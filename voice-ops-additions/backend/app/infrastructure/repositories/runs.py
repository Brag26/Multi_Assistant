from uuid import UUID
from datetime import UTC, datetime
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.domain.enums import WorkflowRunStatus, WorkflowRunStepStatus
from app.infrastructure.db.models import WorkflowRunModel, WorkflowRunStepModel

class SqlAlchemyWorkflowRunRepository:
    def __init__(self, session: AsyncSession):
        self.session = session

    async def list_for_tenant(self, tenant_id: str, limit: int = 50):
        result = await self.session.execute(
            select(WorkflowRunModel)
            .where(WorkflowRunModel.tenant_id == tenant_id)
            .order_by(WorkflowRunModel.created_at.desc())
            .limit(limit)
        )
        return result.scalars().all()

    async def get(self, run_id: UUID):
        result = await self.session.execute(
            select(WorkflowRunModel).where(WorkflowRunModel.id == str(run_id))
        )
        return result.scalar_one_or_none()

    async def get_steps(self, run_id: UUID):
        result = await self.session.execute(
            select(WorkflowRunStepModel)
            .where(WorkflowRunStepModel.run_id == str(run_id))
            .order_by(WorkflowRunStepModel.created_at.asc())
        )
        return result.scalars().all()

    async def create_run(self, tenant_id: str, workflow_id: UUID, version_id: UUID | None, trigger_event: str, variables: dict = {}):
        run = WorkflowRunModel(
            tenant_id=tenant_id,
            workflow_id=str(workflow_id),
            version_id=str(version_id) if version_id else None,
            trigger_event=trigger_event,
            status=WorkflowRunStatus.RUNNING,
            variables=variables
        )
        self.session.add(run)
        await self.session.commit()
        await self.session.refresh(run)
        return run

    async def update_run_status(self, run_id: UUID, status: WorkflowRunStatus, variables: dict | None = None):
        run = await self.get(run_id)
        if run:
            run.status = status
            if variables is not None:
                run.variables = variables
            run.updated_at = datetime.now(UTC)
            await self.session.commit()
            await self.session.refresh(run)
            return run
        return None

    async def add_step(self, tenant_id: str, run_id: UUID, node_id: str, node_type: str, node_name: str, status: WorkflowRunStepStatus, input_data: dict = {}, output_data: dict = {}, error_message: str | None = None):
        step = WorkflowRunStepModel(
            tenant_id=tenant_id,
            run_id=str(run_id),
            node_id=node_id,
            node_type=node_type,
            node_name=node_name,
            status=status,
            input_data=input_data,
            output_data=output_data,
            error_message=error_message
        )
        self.session.add(step)
        await self.session.commit()
        await self.session.refresh(step)
        return step
