"""
repositories/workflows.py — extended for visual workflow builder.
Handles save/clone/version/activate/deactivate and JSON import-export.
"""
from uuid import UUID

from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.application.schemas import WorkflowCreate, WorkflowUpdate
from app.domain.enums import WorkflowStatus
from app.infrastructure.db.models import WorkflowModel, WorkflowVersionModel


class SqlAlchemyWorkflowRepository:
    def __init__(self, session: AsyncSession):
        self.session = session

    # ── list ────────────────────────────────────────────────────────────────

    async def list_for_tenant(self, tenant_id: str):
        result = await self.session.execute(
            select(WorkflowModel)
            .where(WorkflowModel.tenant_id == tenant_id)
            .order_by(WorkflowModel.created_at.desc())
        )
        return result.scalars().all()

    # ── get ─────────────────────────────────────────────────────────────────

    async def get_for_tenant(self, tenant_id: str, workflow_id: UUID):
        result = await self.session.execute(
            select(WorkflowModel).where(
                WorkflowModel.tenant_id == tenant_id,
                WorkflowModel.id == str(workflow_id),
            )
        )
        return result.scalar_one_or_none()

    # ── delete (permanent) ─────────────────────────────────────────────────

    async def delete_for_tenant(self, tenant_id: str, workflow_id: UUID) -> bool:
        wf = await self.get_for_tenant(tenant_id, workflow_id)
        if not wf:
            return False
        await self.session.delete(wf)
        await self.session.commit()
        return True

    # ── create ───────────────────────────────────────────────────────────────

    async def create(self, tenant_id: str, data: WorkflowCreate):
        payload = data.model_dump(exclude={"nodes", "edges"})
        payload["nodes"] = [n.model_dump() for n in data.nodes]
        payload["edges"] = [e.model_dump() for e in data.edges]
        workflow = WorkflowModel(tenant_id=tenant_id, **payload)
        self.session.add(workflow)
        await self.session.commit()
        await self.session.refresh(workflow)
        return workflow

    # ── update (generic dict patch) ──────────────────────────────────────────

    async def update(self, tenant_id: str, workflow_id: UUID, update_data: dict):
        workflow = await self.get_for_tenant(tenant_id, workflow_id)
        if not workflow:
            return None
        # Serialise nodes / edges if present
        if "nodes" in update_data and update_data["nodes"] is not None:
            nodes = update_data.pop("nodes")
            update_data["nodes"] = (
                [n.model_dump() if hasattr(n, "model_dump") else n for n in nodes]
            )
        if "edges" in update_data and update_data["edges"] is not None:
            edges = update_data.pop("edges")
            update_data["edges"] = (
                [e.model_dump() if hasattr(e, "model_dump") else e for e in edges]
            )
        for key, value in update_data.items():
            if value is not None:
                setattr(workflow, key, value)
        await self.session.commit()
        await self.session.refresh(workflow)
        return workflow

    # ── activate / deactivate ────────────────────────────────────────────────

    async def set_active(self, tenant_id: str, workflow_id: UUID, active: bool):
        status = WorkflowStatus.ACTIVE if active else WorkflowStatus.PAUSED
        return await self.update(tenant_id, workflow_id, {"status": status})

    # ── clone ────────────────────────────────────────────────────────────────

    async def clone(self, tenant_id: str, workflow_id: UUID):
        wf = await self.get_for_tenant(tenant_id, workflow_id)
        if not wf:
            return None
        clone = WorkflowModel(
            tenant_id=tenant_id,
            name=f"Copy of {wf.name}",
            description=wf.description,
            status=WorkflowStatus.DRAFT,
            vapi_assistant_id=wf.vapi_assistant_id,
            twilio_phone_number=wf.twilio_phone_number,
            make_webhook_url=wf.make_webhook_url,
            trigger_type=wf.trigger_type,
            cron_expression=wf.cron_expression,
            nodes=wf.nodes,
            edges=wf.edges,
            config=wf.config,
            builder_version=wf.builder_version,
        )
        self.session.add(clone)
        await self.session.commit()
        await self.session.refresh(clone)
        return clone

    # ── versions ────────────────────────────────────────────────────────────

    async def list_versions(self, tenant_id: str, workflow_id: UUID):
        result = await self.session.execute(
            select(WorkflowVersionModel)
            .where(
                WorkflowVersionModel.tenant_id == tenant_id,
                WorkflowVersionModel.workflow_id == str(workflow_id),
            )
            .order_by(WorkflowVersionModel.version.desc())
        )
        return result.scalars().all()

    async def create_version(self, tenant_id: str, workflow_id: UUID, config: dict):
        result = await self.session.execute(
            select(func.max(WorkflowVersionModel.version)).where(
                WorkflowVersionModel.workflow_id == str(workflow_id)
            )
        )
        max_version = result.scalar() or 0
        version_rec = WorkflowVersionModel(
            tenant_id=tenant_id,
            workflow_id=str(workflow_id),
            version=max_version + 1,
            config=config,
        )
        self.session.add(version_rec)
        await self.session.commit()
        await self.session.refresh(version_rec)
        return version_rec

    async def restore_version(self, tenant_id: str, workflow_id: UUID, version_id: UUID):
        """Restore nodes/edges/config from a saved version."""
        result = await self.session.execute(
            select(WorkflowVersionModel).where(
                WorkflowVersionModel.tenant_id == tenant_id,
                WorkflowVersionModel.id == str(version_id),
                WorkflowVersionModel.workflow_id == str(workflow_id),
            )
        )
        version = result.scalar_one_or_none()
        if not version:
            return None
        cfg = version.config
        return await self.update(
            tenant_id,
            workflow_id,
            {
                "config": cfg,
                "nodes": cfg.get("nodes", []),
                "edges": cfg.get("edges", []),
            },
        )

    # ── import / export ──────────────────────────────────────────────────────

    async def import_workflow(self, tenant_id: str, payload: dict):
        """Create a new workflow from an exported JSON payload."""
        workflow = WorkflowModel(
            tenant_id=tenant_id,
            name=payload.get("name", "Imported Workflow"),
            description=payload.get("description"),
            status=WorkflowStatus.DRAFT,
            trigger_type=payload.get("trigger_type"),
            cron_expression=payload.get("cron_expression"),
            nodes=payload.get("nodes", []),
            edges=payload.get("edges", []),
            config=payload.get("config", {}),
        )
        self.session.add(workflow)
        await self.session.commit()
        await self.session.refresh(workflow)
        return workflow

    async def export_workflow(self, tenant_id: str, workflow_id: UUID) -> dict:
        wf = await self.get_for_tenant(tenant_id, workflow_id)
        if not wf:
            return {}
        return {
            "schema_version": "1.0",
            "name": wf.name,
            "description": wf.description,
            "trigger_type": wf.trigger_type,
            "cron_expression": wf.cron_expression,
            "nodes": wf.nodes or [],
            "edges": wf.edges or [],
            "config": wf.config or {},
        }
