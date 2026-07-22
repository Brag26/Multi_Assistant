"""api/v1/support.py — AI support chatbot (powered by a Vapi assistant's
text Chat API) with an escalate-to-human path that emails superadmin (via
Make.com, if configured) and always logs to an in-app inbox.
"""
import structlog
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_db_session
from app.core.config import settings
from app.core.security import CurrentUser, Role, require_role, require_tenant_access
from app.infrastructure.db.models import SupportConfigModel, SupportEscalationModel
from app.infrastructure.integrations.make import MakeClient
from app.infrastructure.integrations.vapi import VapiClient

log = structlog.get_logger()
router = APIRouter(prefix="/tenants/{tenant_id}/support", tags=["support"])
SuperAdmin = require_role(Role.SUPER_ADMIN)


@router.get("/config")
async def get_support_config(tenant_id: str, user: CurrentUser, session: AsyncSession = Depends(get_db_session)):
    """Anyone can check whether the support bot is set up (so the widget
    knows whether to show itself)."""
    require_tenant_access(user, tenant_id)
    result = await session.execute(select(SupportConfigModel).where(SupportConfigModel.tenant_id == tenant_id))
    row = result.scalar_one_or_none()
    return {"configured": bool(row and row.support_assistant_id), "support_assistant_id": row.support_assistant_id if row else None}


class SetSupportConfigRequest(BaseModel):
    support_assistant_id: str | None = None


@router.put("/config")
async def set_support_config(
    tenant_id: str,
    body: SetSupportConfigRequest,
    user=Depends(SuperAdmin),
    session: AsyncSession = Depends(get_db_session),
):
    result = await session.execute(select(SupportConfigModel).where(SupportConfigModel.tenant_id == tenant_id))
    row = result.scalar_one_or_none()
    if row:
        row.support_assistant_id = body.support_assistant_id
    else:
        session.add(SupportConfigModel(tenant_id=tenant_id, support_assistant_id=body.support_assistant_id))
    await session.commit()
    return {"ok": True}


class ChatRequest(BaseModel):
    message: str
    previous_chat_id: str | None = None


@router.post("/chat")
async def send_chat_message(
    tenant_id: str,
    body: ChatRequest,
    user: CurrentUser,
    session: AsyncSession = Depends(get_db_session),
):
    require_tenant_access(user, tenant_id)
    result = await session.execute(select(SupportConfigModel).where(SupportConfigModel.tenant_id == tenant_id))
    config = result.scalar_one_or_none()
    if not config or not config.support_assistant_id:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Support chat isn't set up yet — ask your admin to configure it")

    try:
        chat = await VapiClient().send_chat(config.support_assistant_id, body.message, body.previous_chat_id)
    except Exception as exc:
        log.warning("support.chat.failed", error=str(exc))
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, "The support bot didn't respond — please try again")

    reply_text = ""
    for block in chat.get("output", []):
        if block.get("role") == "assistant" and block.get("message"):
            reply_text = block["message"]
    return {"chat_id": chat.get("id"), "reply": reply_text or "Sorry, I didn't catch that — could you rephrase?"}


class EscalateRequest(BaseModel):
    message: str
    conversation: list[dict] = []


@router.post("/escalate")
async def escalate_to_human(
    tenant_id: str,
    body: EscalateRequest,
    user: CurrentUser,
    session: AsyncSession = Depends(get_db_session),
):
    """User asked for a human. Always logged in-app; also emailed to
    superadmin if a Make.com webhook is configured."""
    require_tenant_access(user, tenant_id)

    superadmin_result = await session.execute(
        text("SELECT email FROM memberships WHERE tenant_id = :tid AND role = 'super_admin' ORDER BY created_at ASC LIMIT 1"),
        {"tid": tenant_id},
    )
    superadmin_row = superadmin_result.fetchone()
    superadmin_email = superadmin_row[0] if superadmin_row else None

    user_info = await session.execute(text("SELECT email FROM memberships WHERE user_id = :uid LIMIT 1"), {"uid": user.user_id})
    user_row = user_info.fetchone()
    user_email = user_row[0] if user_row else None

    escalation = SupportEscalationModel(
        tenant_id=tenant_id, user_id=user.user_id, user_email=user_email,
        message=body.message, conversation=body.conversation,
    )
    session.add(escalation)
    await session.commit()

    if settings.make_support_escalation_webhook:
        try:
            await MakeClient().trigger_workflow(settings.make_support_escalation_webhook, {
                "event": "support_escalation",
                "to_email": superadmin_email,
                "from_user_email": user_email,
                "message": body.message,
                "conversation": body.conversation,
                "escalation_id": escalation.id,
            })
        except Exception as exc:
            log.warning("support.escalate.email_failed", error=str(exc))

    return {"ok": True, "escalation_id": escalation.id}


@router.get("/escalations")
async def list_escalations(tenant_id: str, user=Depends(SuperAdmin), session: AsyncSession = Depends(get_db_session)):
    result = await session.execute(
        select(SupportEscalationModel).where(SupportEscalationModel.tenant_id == tenant_id)
        .order_by(SupportEscalationModel.created_at.desc()).limit(100)
    )
    return [
        {
            "id": e.id, "user_email": e.user_email, "message": e.message,
            "status": e.status, "created_at": e.created_at, "resolved_at": e.resolved_at,
        }
        for e in result.scalars().all()
    ]


@router.post("/escalations/{escalation_id}/resolve")
async def resolve_escalation(tenant_id: str, escalation_id: str, user=Depends(SuperAdmin), session: AsyncSession = Depends(get_db_session)):
    from datetime import UTC, datetime
    result = await session.execute(select(SupportEscalationModel).where(SupportEscalationModel.id == escalation_id, SupportEscalationModel.tenant_id == tenant_id))
    row = result.scalar_one_or_none()
    if not row:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Not found")
    row.status = "resolved"
    row.resolved_at = datetime.now(UTC)
    await session.commit()
    return {"ok": True}
