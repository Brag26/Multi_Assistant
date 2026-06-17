from typing import Annotated
from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException
from app.api.deps import notification_repository
from app.application.schemas import NotificationRead
from app.infrastructure.repositories.notifications import SqlAlchemyNotificationRepository
from app.core.security import CurrentUser, require_tenant_access

router = APIRouter(prefix="/tenants/{tenant_id}/notifications", tags=["notifications"])

@router.get("", response_model=list[NotificationRead])
async def list_notifications(
    tenant_id: str,
    user: CurrentUser,
    repo: Annotated[SqlAlchemyNotificationRepository, Depends(notification_repository)]
):
    require_tenant_access(user, tenant_id)
    return await repo.list_for_tenant(tenant_id)

@router.get("/unread-count", response_model=dict)
async def get_unread_count(
    tenant_id: str,
    user: CurrentUser,
    repo: Annotated[SqlAlchemyNotificationRepository, Depends(notification_repository)]
):
    require_tenant_access(user, tenant_id)
    count = await repo.get_unread_count(tenant_id)
    return {"count": count}

@router.post("/{notification_id}/read", response_model=NotificationRead)
async def mark_notification_read(
    tenant_id: str,
    notification_id: UUID,
    user: CurrentUser,
    repo: Annotated[SqlAlchemyNotificationRepository, Depends(notification_repository)]
):
    require_tenant_access(user, tenant_id)
    notification = await repo.mark_read(tenant_id, notification_id)
    if not notification:
        raise HTTPException(status_code=404, detail="Notification not found")
    return notification

@router.post("/read-all", response_model=dict)
async def mark_all_read(
    tenant_id: str,
    user: CurrentUser,
    repo: Annotated[SqlAlchemyNotificationRepository, Depends(notification_repository)]
):
    require_tenant_access(user, tenant_id)
    await repo.mark_all_read(tenant_id)
    return {"ok": True}
