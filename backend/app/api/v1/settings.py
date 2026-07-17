"""api/v1/settings.py — per-user settings (currently just timezone)."""
from fastapi import APIRouter
from pydantic import BaseModel
from sqlalchemy import text

from app.api.deps import SessionDep
from app.core.security import CurrentUser, require_tenant_access

router = APIRouter(prefix="/tenants/{tenant_id}/settings", tags=["settings"])


class TimezoneUpdate(BaseModel):
    timezone: str


@router.get("/me")
async def get_my_settings(tenant_id: str, user: CurrentUser, session: SessionDep):
    require_tenant_access(user, tenant_id)
    result = await session.execute(
        text("SELECT timezone FROM memberships WHERE tenant_id = :tid AND user_id = :uid LIMIT 1"),
        {"tid": tenant_id, "uid": user.user_id},
    )
    row = result.fetchone()
    return {"timezone": row[0] if row else None}


@router.patch("/me")
async def update_my_settings(tenant_id: str, body: TimezoneUpdate, user: CurrentUser, session: SessionDep):
    require_tenant_access(user, tenant_id)
    await session.execute(
        text("UPDATE memberships SET timezone = :tz WHERE tenant_id = :tid AND user_id = :uid"),
        {"tz": body.timezone, "tid": tenant_id, "uid": user.user_id},
    )
    await session.commit()
    return {"ok": True, "timezone": body.timezone}
