"""repositories/notifications.py"""
from sqlalchemy import select, update, func, or_
from sqlalchemy.ext.asyncio import AsyncSession

from app.application.schemas import NotificationCreate
from app.infrastructure.db.models import NotificationModel


class SqlAlchemyNotificationRepository:
    def __init__(self, session: AsyncSession):
        self.session = session

    async def create(self, tenant_id: str, data: NotificationCreate):
        notif = NotificationModel(
            tenant_id=tenant_id,
            title=data.title,
            message=data.message,
            type=data.type,
            user_id=data.user_id,
        )
        self.session.add(notif)
        await self.session.commit()
        await self.session.refresh(notif)
        return notif

    async def list_for_tenant(self, tenant_id: str, user_id: str | None = None,
                               unread_only: bool = False, limit: int = 50):
        q = select(NotificationModel).where(NotificationModel.tenant_id == tenant_id)
        if user_id:
            # Visible to this user: tenant-wide broadcasts (user_id is null)
            # plus anything specifically targeted at them.
            q = q.where(or_(NotificationModel.user_id.is_(None), NotificationModel.user_id == user_id))
        if unread_only:
            q = q.where(NotificationModel.read.is_(False))
        q = q.order_by(NotificationModel.created_at.desc()).limit(limit)
        result = await self.session.execute(q)
        return result.scalars().all()

    async def mark_read(self, tenant_id: str, ids: list[str]):
        await self.session.execute(
            update(NotificationModel)
            .where(
                NotificationModel.tenant_id == tenant_id,
                NotificationModel.id.in_(ids),
            )
            .values(read=True)
        )
        await self.session.commit()

    async def mark_all_read(self, tenant_id: str, user_id: str | None = None) -> int:
        q = update(NotificationModel).where(
            NotificationModel.tenant_id == tenant_id,
            NotificationModel.read.is_(False),
        )
        if user_id:
            q = q.where(or_(NotificationModel.user_id.is_(None), NotificationModel.user_id == user_id))
        result = await self.session.execute(q.values(read=True))
        await self.session.commit()
        return result.rowcount

    async def unread_count(self, tenant_id: str, user_id: str | None = None) -> int:
        q = select(func.count(NotificationModel.id)).where(
            NotificationModel.tenant_id == tenant_id,
            NotificationModel.read.is_(False),
        )
        if user_id:
            q = q.where(or_(NotificationModel.user_id.is_(None), NotificationModel.user_id == user_id))
        result = await self.session.execute(q)
        return result.scalar() or 0
