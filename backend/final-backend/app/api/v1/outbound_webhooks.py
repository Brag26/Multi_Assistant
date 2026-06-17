"""
api/v1/outbound_webhooks.py — Generic outbound webhook subscriptions.
Lets users register any URL (Zapier, n8n, custom) to receive platform events,
without writing a workflow. Complements the workflow builder's "Send Webhook"
action node by offering a no-code, account-level subscription model.
"""
import hashlib
import hmac
import json
from datetime import datetime, UTC
from typing import Annotated
from uuid import UUID, uuid4

import httpx
import structlog
from fastapi import APIRouter, Body, Depends, HTTPException, Query
from sqlalchemy import select, delete
from sqlalchemy.dialects.postgresql import JSONB, UUID as PG_UUID
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy import Boolean, DateTime, ForeignKey, String, Text, func

from app.api.deps import get_db_session
from app.core.security import CurrentUser
from app.infrastructure.db.base import Base

log = structlog.get_logger()

AVAILABLE_EVENTS = [
    "call_started", "call_answered", "call_completed", "call_failed",
    "lead_qualified", "lead_created", "lead_status_changed",
    "appointment_booked", "appointment_completed", "appointment_canceled",
    "campaign_started", "campaign_completed",
    "workflow_activated", "workflow_failed",
]


class OutboundWebhookModel(Base):
    __tablename__ = "outbound_webhooks"
    id: Mapped[str] = mapped_column(PG_UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid4()))
    tenant_id: Mapped[str] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), index=True)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    target_url: Mapped[str] = mapped_column(Text, nullable=False)
    events: Mapped[list] = mapped_column(JSONB, default=list, nullable=False)
    secret: Mapped[str | None] = mapped_column(String(120))
    enabled: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    last_triggered_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    last_status_code: Mapped[int | None] = mapped_column(String(10))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


router = APIRouter(prefix="/tenants/{tenant_id}/outbound-webhooks", tags=["outbound-webhooks"])


def _sign_payload(secret: str, body: bytes) -> str:
    return hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()


@router.get("")
async def list_webhooks(
    tenant_id: str,
    user: CurrentUser,
    session: AsyncSession = Depends(get_db_session),
):
    result = await session.execute(
        select(OutboundWebhookModel)
        .where(OutboundWebhookModel.tenant_id == tenant_id)
        .order_by(OutboundWebhookModel.created_at.desc())
    )
    hooks = result.scalars().all()
    return [
        {
            "id": h.id, "name": h.name, "target_url": h.target_url,
            "events": h.events, "enabled": h.enabled,
            "last_triggered_at": h.last_triggered_at,
            "last_status_code": h.last_status_code,
        }
        for h in hooks
    ]


@router.get("/available-events")
async def get_available_events():
    return {"events": AVAILABLE_EVENTS}


@router.post("", status_code=201)
async def create_webhook(
    tenant_id: str,
    user: CurrentUser,
    payload: dict = Body(...),
    session: AsyncSession = Depends(get_db_session),
):
    target_url = payload.get("target_url")
    if not target_url:
        raise HTTPException(status_code=400, detail="target_url required")

    events = payload.get("events", [])
    invalid = [e for e in events if e not in AVAILABLE_EVENTS]
    if invalid:
        raise HTTPException(status_code=400, detail=f"Invalid events: {invalid}")

    hook = OutboundWebhookModel(
        tenant_id=tenant_id,
        name=payload.get("name", "Untitled webhook"),
        target_url=target_url,
        events=events,
        secret=payload.get("secret"),
    )
    session.add(hook)
    await session.commit()
    await session.refresh(hook)
    return {"id": hook.id, "name": hook.name, "events": hook.events}


@router.patch("/{webhook_id}")
async def update_webhook(
    tenant_id: str,
    webhook_id: UUID,
    user: CurrentUser,
    payload: dict = Body(...),
    session: AsyncSession = Depends(get_db_session),
):
    result = await session.execute(
        select(OutboundWebhookModel).where(
            OutboundWebhookModel.tenant_id == tenant_id,
            OutboundWebhookModel.id == str(webhook_id),
        )
    )
    hook = result.scalar_one_or_none()
    if not hook:
        raise HTTPException(status_code=404)
    for key in ("name", "target_url", "events", "secret", "enabled"):
        if key in payload:
            setattr(hook, key, payload[key])
    await session.commit()
    return {"id": hook.id, "updated": True}


@router.delete("/{webhook_id}")
async def delete_webhook(
    tenant_id: str,
    webhook_id: UUID,
    user: CurrentUser,
    session: AsyncSession = Depends(get_db_session),
):
    await session.execute(
        delete(OutboundWebhookModel).where(
            OutboundWebhookModel.tenant_id == tenant_id,
            OutboundWebhookModel.id == str(webhook_id),
        )
    )
    await session.commit()
    return {"deleted": str(webhook_id)}


@router.post("/{webhook_id}/test")
async def test_webhook(
    tenant_id: str,
    webhook_id: UUID,
    user: CurrentUser,
    session: AsyncSession = Depends(get_db_session),
):
    result = await session.execute(
        select(OutboundWebhookModel).where(
            OutboundWebhookModel.tenant_id == tenant_id,
            OutboundWebhookModel.id == str(webhook_id),
        )
    )
    hook = result.scalar_one_or_none()
    if not hook:
        raise HTTPException(status_code=404)

    test_payload = {"event": "test", "tenant_id": tenant_id, "timestamp": datetime.now(UTC).isoformat()}
    success, status_code = await dispatch_outbound_webhook(hook, "test", test_payload)
    hook.last_triggered_at = datetime.now(UTC)
    hook.last_status_code = str(status_code) if status_code else None
    await session.commit()
    return {"success": success, "status_code": status_code}


# ── Dispatch helper, called by the event bus / engine ────────────────────────

async def dispatch_outbound_webhook(hook: OutboundWebhookModel, event: str, payload: dict) -> tuple[bool, int | None]:
    body = json.dumps({"event": event, "data": payload}).encode()
    headers = {"Content-Type": "application/json"}
    if hook.secret:
        headers["X-Webhook-Signature"] = _sign_payload(hook.secret, body)

    try:
        async with httpx.AsyncClient() as client:
            res = await client.post(hook.target_url, content=body, headers=headers, timeout=10)
            log.info("outbound_webhook.sent", hook_id=hook.id, event=event, status=res.status_code)
            return res.status_code < 400, res.status_code
    except Exception as exc:
        log.error("outbound_webhook.failed", hook_id=hook.id, event=event, error=str(exc))
        return False, None


async def fire_event_to_subscribers(session: AsyncSession, tenant_id: str, event: str, payload: dict):
    """Call this from the workflow engine / call lifecycle / appointment lifecycle
    whenever a platform event occurs, to notify all registered outbound webhooks."""
    result = await session.execute(
        select(OutboundWebhookModel).where(
            OutboundWebhookModel.tenant_id == tenant_id,
            OutboundWebhookModel.enabled.is_(True),
        )
    )
    hooks = result.scalars().all()
    matching = [h for h in hooks if event in (h.events or [])]

    for hook in matching:
        success, status_code = await dispatch_outbound_webhook(hook, event, payload)
        hook.last_triggered_at = datetime.now(UTC)
        hook.last_status_code = str(status_code) if status_code else None
    if matching:
        await session.commit()
    return len(matching)
