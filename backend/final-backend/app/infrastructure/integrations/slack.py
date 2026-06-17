"""infrastructure/integrations/slack.py — Slack webhook notifications."""
import httpx
import structlog
from app.infrastructure.db.models import SlackConfigModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

log = structlog.get_logger()

SLACK_EVENT_TEMPLATES = {
    "call_completed": lambda p: {
        "text": f"✅ Call completed — {p.get('phone', 'unknown')} · Outcome: *{p.get('outcome', 'unknown')}* · Duration: {p.get('duration', 0)}s"
    },
    "call_failed": lambda p: {
        "text": f"❌ Call failed — {p.get('phone', 'unknown')} · Reason: {p.get('reason', 'unknown')}"
    },
    "lead_qualified": lambda p: {
        "text": f"🎯 Lead qualified — {p.get('name', p.get('phone', 'unknown'))} · Score: {p.get('score', '—')}"
    },
    "appointment_booked": lambda p: {
        "text": f"📅 Appointment booked — {p.get('title', 'Appointment')} at {p.get('scheduled_at', '—')}"
    },
    "campaign_completed": lambda p: {
        "text": f"📊 Campaign completed — *{p.get('name', 'Campaign')}* · {p.get('total_calls', 0)} calls · {p.get('qualified', 0)} qualified"
    },
    "workflow_failed": lambda p: {
        "text": f"⚠️ Workflow failed — *{p.get('name', 'Workflow')}* · {p.get('error', 'unknown error')}"
    },
}


class SlackClient:
    def __init__(self, session: AsyncSession):
        self.session = session

    async def _get_config(self, tenant_id: str) -> SlackConfigModel | None:
        result = await self.session.execute(
            select(SlackConfigModel).where(
                SlackConfigModel.tenant_id == tenant_id,
                SlackConfigModel.enabled.is_(True),
            )
        )
        return result.scalar_one_or_none()

    async def notify(self, tenant_id: str, event: str, payload: dict) -> bool:
        config = await self._get_config(tenant_id)
        if not config:
            return False
        if event not in (config.events or []):
            return False

        template = SLACK_EVENT_TEMPLATES.get(event)
        if not template:
            body = {"text": f"[{event}] {payload}"}
        else:
            body = template(payload)

        if config.channel:
            body["channel"] = config.channel

        try:
            async with httpx.AsyncClient() as client:
                res = await client.post(config.webhook_url, json=body, timeout=8)
                res.raise_for_status()
                log.info("slack.notify.sent", tenant_id=tenant_id, event=event)
                return True
        except Exception as exc:
            log.error("slack.notify.failed", tenant_id=tenant_id, event=event, error=str(exc))
            return False
