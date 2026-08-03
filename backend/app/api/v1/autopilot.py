"""api/v1/autopilot.py — cron trigger endpoint + superadmin approval queue."""
from datetime import UTC, datetime

from fastapi import APIRouter, Depends, Header, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_db_session
from app.application.autopilot import execute_approved_action, run_autopilot
from app.core.config import settings
from app.core.security import CurrentUser, Role, require_role
from app.infrastructure.db.models import AutopilotActionModel, AutopilotRunModel

router = APIRouter(tags=["autopilot"])
SuperAdmin = require_role(Role.SUPER_ADMIN)


@router.post("/autopilot/run/{tenant_id}")
async def trigger_autopilot_run(
    tenant_id: str,
    session: AsyncSession = Depends(get_db_session),
    x_cron_secret: str | None = Header(default=None),
):
    """Called by an external scheduler (Render Cron Job) — not a logged-in
    user, so it's protected by a shared secret instead of a session token."""
    if not settings.autopilot_cron_secret or x_cron_secret != settings.autopilot_cron_secret:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid or missing cron secret")
    return await run_autopilot(session, tenant_id)


@router.post("/tenants/{tenant_id}/autopilot/run-now")
async def run_now(tenant_id: str, user=Depends(SuperAdmin), session: AsyncSession = Depends(get_db_session)):
    """Manual "run it now" button for superadmin, same engine as the cron."""
    return await run_autopilot(session, tenant_id)


@router.get("/tenants/{tenant_id}/autopilot/actions")
async def list_actions(tenant_id: str, user=Depends(SuperAdmin), session: AsyncSession = Depends(get_db_session), status_filter: str | None = None):
    query = select(AutopilotActionModel).where(AutopilotActionModel.tenant_id == tenant_id)
    if status_filter:
        query = query.where(AutopilotActionModel.status == status_filter)
    query = query.order_by(AutopilotActionModel.created_at.desc()).limit(100)
    result = await session.execute(query)
    return [
        {
            "id": a.id, "check_name": a.check_name, "action_type": a.action_type,
            "title": a.title, "detail": a.detail, "target_type": a.target_type, "target_id": a.target_id,
            "requires_approval": a.requires_approval, "status": a.status, "result": a.result,
            "created_at": a.created_at, "decided_at": a.decided_at,
        }
        for a in result.scalars().all()
    ]


@router.get("/tenants/{tenant_id}/autopilot/runs")
async def list_runs(tenant_id: str, user=Depends(SuperAdmin), session: AsyncSession = Depends(get_db_session)):
    result = await session.execute(
        select(AutopilotRunModel).where(AutopilotRunModel.tenant_id == tenant_id)
        .order_by(AutopilotRunModel.started_at.desc()).limit(30)
    )
    return [
        {
            "id": r.id, "started_at": r.started_at, "finished_at": r.finished_at,
            "checks_run": r.checks_run, "findings_count": r.findings_count,
            "actions_count": r.actions_count, "status": r.status, "summary": r.summary,
        }
        for r in result.scalars().all()
    ]


@router.post("/tenants/{tenant_id}/autopilot/actions/{action_id}/approve")
async def approve_action(tenant_id: str, action_id: str, user: CurrentUser, session: AsyncSession = Depends(get_db_session)):
    if user.role != Role.SUPER_ADMIN:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Only superadmin can approve Autopilot actions")
    result = await session.execute(select(AutopilotActionModel).where(AutopilotActionModel.id == action_id, AutopilotActionModel.tenant_id == tenant_id))
    action = result.scalar_one_or_none()
    if not action:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Action not found")
    if action.status != "pending":
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Already decided")

    action.result = await execute_approved_action(session, action)
    action.status = "approved"
    action.decided_at = datetime.now(UTC)
    action.decided_by_user_id = user.user_id
    await session.commit()
    return {"ok": True, "result": action.result}


@router.post("/tenants/{tenant_id}/autopilot/actions/{action_id}/reject")
async def reject_action(tenant_id: str, action_id: str, user: CurrentUser, session: AsyncSession = Depends(get_db_session)):
    if user.role != Role.SUPER_ADMIN:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Only superadmin can reject Autopilot actions")
    result = await session.execute(select(AutopilotActionModel).where(AutopilotActionModel.id == action_id, AutopilotActionModel.tenant_id == tenant_id))
    action = result.scalar_one_or_none()
    if not action:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Action not found")
    if action.status != "pending":
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Already decided")

    action.status = "rejected"
    action.decided_at = datetime.now(UTC)
    action.decided_by_user_id = user.user_id
    await session.commit()
    return {"ok": True}
