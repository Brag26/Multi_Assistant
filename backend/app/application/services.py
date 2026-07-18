"""application/services.py — extended WorkflowService + CallService."""
from uuid import UUID

from fastapi import HTTPException, status

from app.application.schemas import LaunchCallRequest, WorkflowCreate
from app.core.security import Principal, Role, require_tenant_access
from app.infrastructure.integrations.make import MakeClient
from app.infrastructure.integrations.vapi import VapiClient
from app.infrastructure.repositories.calls import SqlAlchemyCallRepository
from app.infrastructure.repositories.runs import SqlAlchemyWorkflowRunRepository
from app.infrastructure.repositories.workflows import SqlAlchemyWorkflowRepository

_WRITE_ROLES = {Role.SUPER_ADMIN, Role.TENANT_ADMIN, Role.MANAGER}


class WorkflowService:
    def __init__(self, workflows: SqlAlchemyWorkflowRepository,
                 runs: SqlAlchemyWorkflowRunRepository | None = None):
        self.workflows = workflows
        self.runs = runs

    # ── read ────────────────────────────────────────────────────────────────

    async def list_workflows(self, user: Principal, tenant_id: str):
        require_tenant_access(user, tenant_id)
        return await self.workflows.list_for_tenant(tenant_id)

    async def get_workflow(self, user: Principal, tenant_id: str, workflow_id: UUID):
        require_tenant_access(user, tenant_id)
        wf = await self.workflows.get_for_tenant(tenant_id, workflow_id)
        if not wf:
            raise HTTPException(status_code=404, detail="Workflow not found")
        return wf

    # ── write ────────────────────────────────────────────────────────────────

    async def create_workflow(self, user: Principal, tenant_id: str, data: WorkflowCreate):
        require_tenant_access(user, tenant_id)
        if user.role not in _WRITE_ROLES:
            raise HTTPException(status_code=403, detail="Cannot create workflows")
        return await self.workflows.create(tenant_id, data)

    async def delete_workflow(self, user: Principal, tenant_id: str, workflow_id: UUID):
        require_tenant_access(user, tenant_id)
        if user.role not in _WRITE_ROLES:
            raise HTTPException(status_code=403, detail="Cannot delete workflows")
        deleted = await self.workflows.delete_for_tenant(tenant_id, workflow_id)
        if not deleted:
            raise HTTPException(status_code=404, detail="Workflow not found")

    async def update_workflow(self, user: Principal, tenant_id: str,
                              workflow_id: UUID, data: dict):
        require_tenant_access(user, tenant_id)
        if user.role not in _WRITE_ROLES:
            raise HTTPException(status_code=403, detail="Cannot edit workflows")
        wf = await self.workflows.update(tenant_id, workflow_id, data)
        if not wf:
            raise HTTPException(status_code=404, detail="Workflow not found")
        return wf

    async def set_active(self, user: Principal, tenant_id: str,
                         workflow_id: UUID, active: bool):
        require_tenant_access(user, tenant_id)
        if user.role not in _WRITE_ROLES:
            raise HTTPException(status_code=403, detail="Cannot activate workflows")
        wf = await self.workflows.set_active(tenant_id, workflow_id, active)
        if not wf:
            raise HTTPException(status_code=404, detail="Workflow not found")
        return wf

    async def clone_workflow(self, user: Principal, tenant_id: str, workflow_id: UUID):
        require_tenant_access(user, tenant_id)
        if user.role not in _WRITE_ROLES:
            raise HTTPException(status_code=403, detail="Cannot clone workflows")
        clone = await self.workflows.clone(tenant_id, workflow_id)
        if not clone:
            raise HTTPException(status_code=404, detail="Workflow not found")
        return clone

    # ── versions ────────────────────────────────────────────────────────────

    async def list_versions(self, user: Principal, tenant_id: str, workflow_id: UUID):
        require_tenant_access(user, tenant_id)
        return await self.workflows.list_versions(tenant_id, workflow_id)

    async def create_version(self, user: Principal, tenant_id: str,
                             workflow_id: UUID, config: dict):
        require_tenant_access(user, tenant_id)
        if user.role not in _WRITE_ROLES:
            raise HTTPException(status_code=403, detail="Cannot manage versions")
        return await self.workflows.create_version(tenant_id, workflow_id, config)

    async def restore_version(self, user: Principal, tenant_id: str,
                              workflow_id: UUID, version_id: UUID):
        require_tenant_access(user, tenant_id)
        if user.role not in _WRITE_ROLES:
            raise HTTPException(status_code=403, detail="Cannot restore versions")
        return await self.workflows.restore_version(tenant_id, workflow_id, version_id)

    # ── import / export ──────────────────────────────────────────────────────

    async def export_workflow(self, user: Principal, tenant_id: str, workflow_id: UUID):
        require_tenant_access(user, tenant_id)
        payload = await self.workflows.export_workflow(tenant_id, workflow_id)
        if not payload:
            raise HTTPException(status_code=404, detail="Workflow not found")
        return payload

    async def import_workflow(self, user: Principal, tenant_id: str, payload: dict):
        require_tenant_access(user, tenant_id)
        if user.role not in _WRITE_ROLES:
            raise HTTPException(status_code=403, detail="Cannot import workflows")
        return await self.workflows.import_workflow(tenant_id, payload)

    # ── runs ────────────────────────────────────────────────────────────────

    async def list_runs(self, user: Principal, tenant_id: str, workflow_id: UUID):
        require_tenant_access(user, tenant_id)
        if not self.runs:
            return []
        # filter by workflow
        all_runs = await self.runs.list_for_tenant(tenant_id, limit=100)
        return [r for r in all_runs if r.workflow_id == str(workflow_id)]

    async def get_run(self, user: Principal, tenant_id: str, run_id: UUID):
        require_tenant_access(user, tenant_id)
        if not self.runs:
            raise HTTPException(status_code=404, detail="Run not found")
        run = await self.runs.get(run_id)
        if not run or run.tenant_id != tenant_id:
            raise HTTPException(status_code=404, detail="Run not found")
        return run

    async def list_run_steps(self, user: Principal, tenant_id: str, run_id: UUID):
        require_tenant_access(user, tenant_id)
        if not self.runs:
            return []
        return await self.runs.get_steps(run_id)


class CallService:
    def __init__(self, workflows: SqlAlchemyWorkflowRepository,
                 calls: SqlAlchemyCallRepository,
                 vapi: VapiClient, make: MakeClient):
        self.workflows = workflows
        self.calls = calls
        self.vapi = vapi
        self.make = make

    async def launch_call(self, user: Principal, tenant_id: str,
                          workflow_id: UUID, request: LaunchCallRequest):
        require_tenant_access(user, tenant_id)
        if user.role not in {Role.SUPER_ADMIN, Role.TENANT_ADMIN, Role.MANAGER, Role.AGENT}:
            raise HTTPException(status_code=403, detail="Cannot launch calls")
        wf = await self.workflows.get_for_tenant(tenant_id, workflow_id)
        if wf is None or wf.vapi_assistant_id is None:
            raise HTTPException(status_code=400, detail="Workflow is not launchable")
        call = await self.calls.create_queued(
            tenant_id, workflow_id, request, assistant_id=wf.vapi_assistant_id, initiated_by_user_id=user.user_id
        )
        provider_call_id = await self.vapi.start_call(
            request.customer_phone, wf.vapi_assistant_id,
            {"call_id": str(call.id), **request.metadata},
        )
        await self.calls.mark_started(call.id, provider_call_id)
        if wf.make_webhook_url:
            await self.make.trigger_workflow(
                wf.make_webhook_url,
                {"call_id": str(call.id), "provider_call_id": provider_call_id},
            )
        return await self.calls.get(call.id)

    async def launch_test_call(self, user: Principal, tenant_id: str, assistant_id: str, customer_phone: str):
        """Dial one number right now using an assistant directly — no workflow
        required. Used by the 'Test Call' button for quick manual testing."""
        require_tenant_access(user, tenant_id)
        if user.role not in {Role.SUPER_ADMIN, Role.TENANT_ADMIN, Role.MANAGER, Role.AGENT}:
            raise HTTPException(status_code=403, detail="Cannot launch calls")
        from sqlalchemy import select
        from app.application.schemas import LaunchCallRequest
        from app.infrastructure.db.models import AssistantAssignmentModel

        from_number = None
        assignment_result = await self.calls.session.execute(
            select(AssistantAssignmentModel.phone_number).where(
                AssistantAssignmentModel.tenant_id == tenant_id,
                AssistantAssignmentModel.assistant_external_id == assistant_id,
                AssistantAssignmentModel.assigned_to_user_id == user.user_id,
            )
        )
        from_number = assignment_result.scalar_one_or_none()

        request = LaunchCallRequest(customer_phone=customer_phone)
        call = await self.calls.create_queued(
            tenant_id, None, request, assistant_id=assistant_id,
            initiated_by_user_id=user.user_id, from_phone_number=from_number,
        )
        provider_call_id = await self.vapi.start_call(
            customer_phone, assistant_id, {"call_id": str(call.id)},
        )
        await self.calls.mark_started(call.id, provider_call_id)
        return await self.calls.get(call.id)
