"""repositories/audit.py"""
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.infrastructure.db.models import AuditLogModel


class SqlAlchemyAuditLogRepository:
    def __init__(self, session: AsyncSession):
        self.session = session

    async def create(self, tenant_id: str | None, actor_user_id: str | None,
                     action: str, resource_type: str, resource_id: str | None,
                     metadata: dict | None = None):
        log = AuditLogModel(
            tenant_id=tenant_id,
            actor_user_id=actor_user_id,
            action=action,
            resource_type=resource_type,
            resource_id=resource_id,
            metadata_=metadata or {},
        )
        self.session.add(log)
        await self.session.commit()
        await self.session.refresh(log)
        return log

    async def list_for_tenant(self, tenant_id: str, resource_type: str | None = None,
                               limit: int = 100):
        q = select(AuditLogModel).where(AuditLogModel.tenant_id == tenant_id)
        if resource_type:
            q = q.where(AuditLogModel.resource_type == resource_type)
        q = q.order_by(AuditLogModel.created_at.desc()).limit(limit)
        result = await self.session.execute(q)
        return result.scalars().all()
