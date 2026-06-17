"""
application/engine.py — Extended WorkflowExecutionEngine.

Supports BOTH legacy config.nodes/config.connections format AND
the new visual-builder format (workflow.nodes / workflow.edges).
"""
import asyncio
import httpx
import structlog
from datetime import datetime, UTC
from uuid import UUID

from sqlalchemy import select

from app.application.schemas import NotificationCreate
from app.domain.enums import (
    CallStatus,
    LeadStatus,
    NotificationType,
    WorkflowRunStatus,
    WorkflowRunStepStatus,
)
from app.infrastructure.db.models import CallModel, WorkflowModel
from app.infrastructure.integrations.make import MakeClient
from app.infrastructure.integrations.vapi import VapiClient
from app.infrastructure.repositories.appointments import SqlAlchemyAppointmentRepository
from app.infrastructure.repositories.contacts import SqlAlchemyContactRepository
from app.infrastructure.repositories.notifications import SqlAlchemyNotificationRepository
from app.infrastructure.repositories.runs import SqlAlchemyWorkflowRunRepository

log = structlog.get_logger()


class WorkflowExecutionEngine:
    def __init__(self, session):
        self.session = session
        self.runs = SqlAlchemyWorkflowRunRepository(session)
        self.notifications = SqlAlchemyNotificationRepository(session)
        self.contacts = SqlAlchemyContactRepository(session)
        self.appointments = SqlAlchemyAppointmentRepository(session)
        self.make = MakeClient()
        self.vapi = VapiClient()

    # ── Public entry point ────────────────────────────────────────────────────

    async def trigger_workflows(self, tenant_id: str, trigger_event: str, payload: dict):
        """Find and run all active workflows that match trigger_event."""
        result = await self.session.execute(
            select(WorkflowModel).where(
                WorkflowModel.tenant_id == tenant_id,
                WorkflowModel.status == "active",
            )
        )
        workflows = result.scalars().all()
        log.info("workflow.engine.trigger", tenant_id=tenant_id,
                 event=trigger_event, count=len(workflows))

        for workflow in workflows:
            trigger_node = self._find_trigger_node(workflow, trigger_event)
            if trigger_node:
                log.info("workflow.engine.match",
                         workflow_id=workflow.id, node_id=trigger_node.get("id"))
                asyncio.create_task(
                    self.run_workflow(tenant_id, workflow, trigger_node, payload)
                )

    # ── Graph resolution ──────────────────────────────────────────────────────

    def _find_trigger_node(self, workflow: WorkflowModel, trigger_event: str) -> dict | None:
        """Support both legacy config.nodes and new builder workflow.nodes."""
        # New format: workflow.nodes is a list of {id, type, data:{trigger_type,...}}
        nodes: list[dict] = workflow.nodes or workflow.config.get("nodes", [])
        for node in nodes:
            data = node.get("data", {})
            ntype = node.get("type", "")
            # New builder: category=="trigger" + trigger_type matches
            if data.get("category") == "trigger" or ntype == "trigger":
                tt = data.get("trigger_type") or data.get("event")
                if tt == trigger_event:
                    return node
        return None

    def _build_adjacency(self, workflow: WorkflowModel) -> dict[str, list[tuple]]:
        """
        Returns adj[source_id] = [(target_id, source_handle, target_handle), …]

        Handles both:
          - New format: workflow.edges list [{id,source,target,source_handle,...}]
          - Legacy format: config.connections list [{source,target,sourcePort,targetPort}]
        """
        adj: dict[str, list] = {}

        # New builder edges
        edges: list[dict] = workflow.edges or []
        for edge in edges:
            src = edge.get("source", "")
            tgt = edge.get("target", "")
            # strip __true/__false virtual suffixes back to real node id
            real_src = src.split("__")[0] if "__" in src else src
            src_handle = edge.get("source_handle") or ("true" if src.endswith("__true") else "false" if src.endswith("__false") else "output")
            tgt_handle = edge.get("target_handle", "input")
            if real_src and tgt:
                adj.setdefault(real_src, []).append((tgt, src_handle, tgt_handle))

        # Legacy connections
        for conn in workflow.config.get("connections", []):
            src = conn.get("source", "")
            tgt = conn.get("target", "")
            src_port = conn.get("sourcePort", "output")
            tgt_port = conn.get("targetPort", "input")
            if src and tgt:
                adj.setdefault(src, []).append((tgt, src_port, tgt_port))

        return adj

    def _get_nodes_map(self, workflow: WorkflowModel) -> dict[str, dict]:
        nodes = workflow.nodes or workflow.config.get("nodes", [])
        return {n.get("id", ""): n for n in nodes}

    # ── Run workflow ──────────────────────────────────────────────────────────

    async def run_workflow(
        self,
        tenant_id: str,
        workflow: WorkflowModel,
        trigger_node: dict,
        initial_variables: dict,
    ):
        from app.infrastructure.repositories.workflows import SqlAlchemyWorkflowRepository
        wf_repo = SqlAlchemyWorkflowRepository(self.session)
        versions = await wf_repo.list_versions(tenant_id, workflow.id)
        version_id = versions[0].id if versions else None

        run = await self.runs.create_run(
            tenant_id=tenant_id,
            workflow_id=workflow.id,
            version_id=version_id,
            trigger_event=(
                trigger_node.get("data", {}).get("trigger_type")
                or trigger_node.get("data", {}).get("event")
                or "unknown"
            ),
            variables=initial_variables,
        )
        log.info("workflow.run.started", run_id=run.id, workflow_id=workflow.id)

        await self.runs.add_step(
            tenant_id=tenant_id,
            run_id=run.id,
            node_id=trigger_node.get("id"),
            node_type="trigger",
            node_name=trigger_node.get("data", {}).get("label", "Trigger"),
            status=WorkflowRunStepStatus.COMPLETED,
            input_data={},
            output_data=initial_variables,
        )

        adj = self._build_adjacency(workflow)
        nodes_map = self._get_nodes_map(workflow)

        queue: list[tuple[str, str, dict]] = [
            (tgt, tgt_handle, initial_variables)
            for tgt, _, tgt_handle in adj.get(trigger_node.get("id", ""), [])
        ]

        visited_parallel: set[str] = set()

        while queue:
            node_id, incoming_port, current_vars = queue.pop(0)
            node = nodes_map.get(node_id)
            if not node:
                continue

            data = node.get("data", {})
            node_type = node.get("type", "")
            node_name = data.get("label", f"Node {node_id}")

            # Detect node category from either new or legacy format
            category = data.get("category") or node_type

            log.info("workflow.run.step", run_id=run.id, node_id=node_id,
                     category=category, name=node_name)

            step_status = WorkflowRunStepStatus.COMPLETED
            output_data: dict = {}
            error_message: str | None = None

            try:
                if category == "action":
                    output_data = await self._execute_action(tenant_id, data, current_vars)

                elif category == "logic":
                    output_data, routing_port = await self._execute_logic(
                        tenant_id, data, current_vars
                    )
                    # Route only matching port
                    for tgt, src_handle, tgt_handle in adj.get(node_id, []):
                        if src_handle == routing_port or routing_port == "output":
                            queue.append((tgt, tgt_handle, {**current_vars, **output_data}))
                    await self.runs.add_step(
                        tenant_id=tenant_id, run_id=run.id,
                        node_id=node_id, node_type="logic", node_name=node_name,
                        status=step_status, input_data=data, output_data=output_data,
                    )
                    continue

                elif category == "stop" or data.get("logic_type") == "stop_workflow":
                    await self.runs.add_step(
                        tenant_id=tenant_id, run_id=run.id,
                        node_id=node_id, node_type="stop", node_name=node_name,
                        status=WorkflowRunStepStatus.COMPLETED,
                    )
                    await self.runs.update_run_status(
                        run.id, WorkflowRunStatus.COMPLETED, current_vars
                    )
                    return

            except Exception as exc:
                log.error("workflow.run.step_failed", run_id=run.id,
                          node_id=node_id, error=str(exc))
                step_status = WorkflowRunStepStatus.FAILED
                error_message = str(exc)
                output_data = {"error": str(exc)}

            await self.runs.add_step(
                tenant_id=tenant_id, run_id=run.id,
                node_id=node_id, node_type=category, node_name=node_name,
                status=step_status, input_data=data, output_data=output_data,
                error_message=error_message,
            )

            if step_status == WorkflowRunStepStatus.FAILED:
                await self.runs.update_run_status(
                    run.id, WorkflowRunStatus.FAILED, current_vars
                )
                return

            # Enqueue downstream
            for tgt, src_handle, tgt_handle in adj.get(node_id, []):
                queue.append((tgt, tgt_handle, {**current_vars, **output_data}))

        await self.runs.update_run_status(
            run.id, WorkflowRunStatus.COMPLETED, current_vars if queue == [] else initial_variables
        )
        log.info("workflow.run.completed", run_id=run.id)

    # ── Action executor ───────────────────────────────────────────────────────

    async def _execute_action(self, tenant_id: str, data: dict, variables: dict) -> dict:
        # Support both new (action_type) and legacy (action) keys
        action_type = data.get("action_type") or data.get("action")
        config = data.get("config", {})
        merged = {**config, **data}  # config values can be overridden by top-level data fields

        log.info("workflow.engine.action", action=action_type)

        if action_type in ("start_vapi_call", "start_call"):
            phone = merged.get("phone") or variables.get("phone") or variables.get("customer_phone")
            assistant_id = merged.get("assistant_id") or merged.get("vapi_assistant_id") or variables.get("assistant_id")
            if not phone or not assistant_id:
                raise ValueError("Missing phone or assistant_id")
            call = CallModel(
                tenant_id=tenant_id,
                customer_phone=phone,
                assistant_id=assistant_id,
                status=CallStatus.QUEUED,
                contact_id=variables.get("contact_id"),
                campaign_id=variables.get("campaign_id"),
            )
            self.session.add(call)
            await self.session.commit()
            try:
                prov_id = await self.vapi.start_call(phone, assistant_id, {"call_id": str(call.id)})
                call.provider_call_id = prov_id
                call.status = CallStatus.IN_PROGRESS
                call.started_at = datetime.now(UTC)
                await self.session.commit()
                return {"call_id": str(call.id), "provider_call_id": prov_id}
            except Exception as exc:
                call.status = CallStatus.FAILED
                await self.session.commit()
                raise

        elif action_type in ("end_call",):
            call_id = variables.get("call_id")
            if call_id:
                result = await self.session.execute(
                    select(CallModel).where(CallModel.id == str(call_id))
                )
                call = result.scalar_one_or_none()
                if call:
                    call.status = CallStatus.COMPLETED
                    call.ended_at = datetime.now(UTC)
                    await self.session.commit()
                    return {"call_id": call_id, "status": "completed"}
            return {"status": "skipped"}

        elif action_type == "transfer_call":
            return {"status": "transferred", "destination": merged.get("destination")}

        elif action_type in ("update_contact",):
            contact_id = variables.get("contact_id")
            if not contact_id:
                raise ValueError("Missing contact_id")
            contact = await self.contacts.get(tenant_id, UUID(str(contact_id)))
            if not contact:
                raise ValueError(f"Contact {contact_id} not found")
            for k, v in (merged.get("fields") or {}).items():
                if hasattr(contact, k):
                    setattr(contact, k, v)
                else:
                    contact.custom_fields[k] = v
            await self.session.commit()
            return {"contact_id": str(contact.id), "status": "updated"}

        elif action_type in ("change_lead_status",):
            contact_id = variables.get("contact_id")
            new_status = merged.get("lead_status")
            if not contact_id or not new_status:
                raise ValueError("Missing contact_id or lead_status")
            contact = await self.contacts.get(tenant_id, UUID(str(contact_id)))
            if not contact:
                raise ValueError(f"Contact {contact_id} not found")
            contact.lead_status = LeadStatus(new_status)
            await self.session.commit()
            return {"contact_id": str(contact.id), "lead_status": new_status}

        elif action_type in ("add_note", "add_notes"):
            contact_id = variables.get("contact_id")
            notes = merged.get("notes", "")
            if contact_id and notes:
                contact = await self.contacts.get(tenant_id, UUID(str(contact_id)))
                if contact:
                    contact.custom_fields.setdefault("notes", []).append({
                        "date": datetime.now(UTC).isoformat(), "text": notes
                    })
                    await self.session.commit()
                    return {"status": "notes_added"}
            return {"status": "skipped"}

        elif action_type in ("trigger_make_scenario", "trigger_make"):
            webhook_url = merged.get("webhook_url")
            if not webhook_url:
                raise ValueError("Missing webhook_url")
            await self.make.trigger_workflow(webhook_url, {**variables, **(merged.get("payload") or {})})
            return {"triggered": True}

        elif action_type == "send_webhook":
            url = merged.get("url") or merged.get("webhook_url")
            if not url:
                raise ValueError("Missing url")
            async with httpx.AsyncClient() as client:
                res = await client.post(
                    url,
                    json={**variables, **(merged.get("payload") or {})},
                    headers=merged.get("headers") or {},
                    timeout=10,
                )
                return {"status_code": res.status_code, "response": res.text[:500]}

        elif action_type in ("send_email_notification", "send_email"):
            email = merged.get("email") or variables.get("email")
            subject = merged.get("subject", "Notification")
            body = merged.get("body", "")
            if not email:
                raise ValueError("Missing email")
            await self.notifications.create(
                tenant_id,
                NotificationCreate(
                    title=f"Email sent: {subject}",
                    message=f"To: {email}. {body}",
                    type=NotificationType.INFO,
                ),
            )
            return {"sent": True, "email": email}

        elif action_type == "delay":
            duration = int(merged.get("delay_seconds") or merged.get("duration") or 5)
            await asyncio.sleep(min(duration, 300))  # cap at 5 min in engine
            return {"delayed_seconds": duration}

        elif action_type == "retry":
            return {"retry": "success"}

        else:
            raise NotImplementedError(f"Action '{action_type}' not implemented")

    # ── Logic executor ────────────────────────────────────────────────────────

    async def _execute_logic(
        self, tenant_id: str, data: dict, variables: dict
    ) -> tuple[dict, str]:
        logic_type = data.get("logic_type") or data.get("logic")
        config = data.get("config", {})
        merged = {**config, **data}

        log.info("workflow.engine.logic", logic=logic_type)

        if logic_type in ("if_else", "ifelse"):
            field = merged.get("field")
            operator = merged.get("operator", "equals")
            value = merged.get("value")
            actual = variables.get(field)
            match = (
                (operator == "equals" and str(actual) == str(value))
                or (operator == "not_equals" and str(actual) != str(value))
                or (operator == "contains" and str(value) in str(actual or ""))
                or (operator == "exists" and actual is not None)
                or (operator == "gt" and float(actual or 0) > float(value or 0))
                or (operator == "lt" and float(actual or 0) < float(value or 0))
            )
            return {"match": match, "field": field, "actual": actual}, "true" if match else "false"

        elif logic_type == "switch":
            field = merged.get("field")
            actual = str(variables.get(field) or "")
            for case in merged.get("cases") or []:
                if case.get("value") == actual:
                    return {"value": actual, "port": case.get("port", "default")}, case.get("port", "default")
            return {"value": actual, "port": "default"}, "default"

        elif logic_type == "wait":
            wait_seconds = int(merged.get("wait_seconds") or 1)
            await asyncio.sleep(min(wait_seconds, 60))
            return {"waited": wait_seconds}, "output"

        elif logic_type == "merge":
            return {"merged": True}, "output"

        elif logic_type in ("parallel_execution", "parallel"):
            return {"parallel": True}, "output"

        else:
            raise NotImplementedError(f"Logic '{logic_type}' not implemented")

    # ── Legacy compatibility shims ────────────────────────────────────────────

    async def execute_action(self, tenant_id: str, data: dict, variables: dict) -> dict:
        return await self._execute_action(tenant_id, data, variables)

    async def execute_logic(self, tenant_id: str, data: dict, variables: dict) -> tuple[dict, str]:
        return await self._execute_logic(tenant_id, data, variables)
