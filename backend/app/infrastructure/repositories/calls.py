"""infrastructure/repositories/calls.py — extended with status filter & limit."""
from datetime import UTC, datetime
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.application.schemas import LaunchCallRequest
from app.domain.enums import CallStatus
from app.infrastructure.db.models import CallModel


class SqlAlchemyCallRepository:
    def __init__(self, session: AsyncSession):
        self.session = session

    async def get(self, call_id: UUID):
        result = await self.session.execute(
            select(CallModel).where(CallModel.id == str(call_id))
        )
        return result.scalar_one()

    async def list_for_tenant(
        self,
        tenant_id: str,
        campaign_id: str | None = None,
        contact_id: str | None = None,
        status_filter: str | None = None,
        limit: int = 100,
    ):
        stmt = select(CallModel).where(CallModel.tenant_id == tenant_id)
        if campaign_id:
            stmt = stmt.where(CallModel.campaign_id == campaign_id)
        if contact_id:
            stmt = stmt.where(CallModel.contact_id == contact_id)
        if status_filter:
            stmt = stmt.where(CallModel.status == status_filter)
        stmt = stmt.order_by(CallModel.created_at.desc()).limit(limit)
        result = await self.session.execute(stmt)
        return result.scalars().all()

    async def create_queued(
        self,
        tenant_id: str,
        workflow_id: UUID | None,
        request: LaunchCallRequest,
        assistant_id: str | None = None,
        initiated_by_user_id: str | None = None,
    ):
        call = CallModel(
            tenant_id=tenant_id,
            workflow_id=str(workflow_id) if workflow_id else None,
            contact_id=str(request.contact_id) if request.contact_id else None,
            campaign_id=str(request.campaign_id) if request.campaign_id else None,
            assistant_id=assistant_id,
            customer_phone=request.customer_phone,
            initiated_by_user_id=initiated_by_user_id,
            metadata_=request.metadata,
        )
        self.session.add(call)
        await self.session.commit()
        await self.session.refresh(call)
        return call

    async def mark_started(self, call_id: UUID, provider_call_id: str):
        call = await self.get(call_id)
        call.provider_call_id = provider_call_id
        call.status = CallStatus.IN_PROGRESS
        call.started_at = datetime.now(UTC)
        await self.session.commit()

    async def mark_completed(self, call_id: UUID, outcome: str, duration: int | None = None):
        call = await self.get(call_id)
        call.status = CallStatus.COMPLETED
        call.outcome = outcome
        call.ended_at = datetime.now(UTC)
        if duration is not None:
            call.duration_seconds = duration
        await self.session.commit()

    async def mark_failed(self, call_id: UUID, reason: str | None = None):
        call = await self.get(call_id)
        call.status = CallStatus.FAILED
        call.ended_at = datetime.now(UTC)
        if reason:
            call.metadata_["fail_reason"] = reason
        await self.session.commit()
