from typing import Annotated
from pydantic import BaseModel
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
    repo: Annotated[SqlAlchemyNotificationRepository, Depends(notification_repository)],
    unread_only: bool = False,
):
    require_tenant_access(user, tenant_id)
    return await repo.list_for_tenant(tenant_id, user_id=user.user_id, unread_only=unread_only)


@router.get("/unread-count", response_model=dict)
async def get_unread_count(
    tenant_id: str,
    user: CurrentUser,
    repo: Annotated[SqlAlchemyNotificationRepository, Depends(notification_repository)],
):
    require_tenant_access(user, tenant_id)
    count = await repo.unread_count(tenant_id, user_id=user.user_id)
    return {"count": count}


class MarkReadRequest(BaseModel):
    ids: list[str]


@router.post("/mark-read", response_model=dict)
async def mark_notifications_read(
    tenant_id: str,
    body: MarkReadRequest,
    user: CurrentUser,
    repo: Annotated[SqlAlchemyNotificationRepository, Depends(notification_repository)],
):
    require_tenant_access(user, tenant_id)
    await repo.mark_read(tenant_id, body.ids)
    return {"ok": True}


@router.post("/mark-all-read", response_model=dict)
async def mark_all_read(
    tenant_id: str,
    user: CurrentUser,
    repo: Annotated[SqlAlchemyNotificationRepository, Depends(notification_repository)],
):
    require_tenant_access(user, tenant_id)
    await repo.mark_all_read(tenant_id, user_id=user.user_id)
    return {"ok": True}
