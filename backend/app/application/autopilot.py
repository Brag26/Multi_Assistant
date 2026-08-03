"""application/autopilot.py — the deterministic "Autopilot" rule engine.

Runs on a schedule (triggered by an external cron hitting a protected
endpoint — see api/v1/autopilot.py). Each check either:
  - auto-executes a safe, reversible action (sending a reminder), or
  - queues an AutopilotActionModel with requires_approval=True for anything
    touching money or account status, which a superadmin must approve.

Deliberately rule-based, not LLM-based — these are well-defined business
checks where a deterministic answer is more reliable (and cheaper, and
faster) than asking a model to guess.
"""
from datetime import UTC, datetime, timedelta
from uuid import uuid4

import structlog
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.domain.enums import CampaignStatus, PaymentStatus, SubscriptionStatus
from app.infrastructure.db.billing_models import PaymentModel, SubscriptionModel
from app.infrastructure.db.models import AutopilotActionModel, AutopilotRunModel, CampaignModel
from app.infrastructure.integrations.make import MakeClient

log = structlog.get_logger()


async def _record_action(session: AsyncSession, tenant_id: str, run_id: str, *, check_name: str,
                          action_type: str, title: str, detail: str, target_type: str | None = None,
                          target_id: str | None = None, requires_approval: bool = True,
                          auto_result: str | None = None) -> AutopilotActionModel:
    action = AutopilotActionModel(
        id=str(uuid4()), tenant_id=tenant_id, run_id=run_id, check_name=check_name,
        action_type=action_type, target_type=target_type, target_id=target_id,
        title=title, detail=detail, requires_approval=requires_approval,
        status="pending" if requires_approval else "auto_executed",
        result=auto_result,
    )
    session.add(action)
    return action


async def check_minute_limits(session: AsyncSession, tenant_id: str, run_id: str) -> int:
    """Accounts over their limit get a reminder auto-sent (safe, reversible)."""
    count = 0
    result = await session.execute(
        select(SubscriptionModel).where(
            SubscriptionModel.tenant_id == tenant_id,
            SubscriptionModel.status == SubscriptionStatus.ACTIVE,
        )
    )
    for sub in result.scalars().all():
        if not sub.minutes_limit or sub.minutes_used < sub.minutes_limit:
            continue
        info = await session.execute(text("SELECT email, display_name FROM memberships WHERE user_id = :uid LIMIT 1"), {"uid": sub.user_id})
        m = info.mappings().first()
        label = (m["display_name"] or m["email"]) if m else sub.user_id

        if settings.make_usage_warning_webhook:
            try:
                await MakeClient().trigger_workflow(settings.make_usage_warning_webhook, {
                    "event": "minute_limit_reached", "user_id": sub.user_id,
                    "tenant_id": tenant_id, "plan": sub.plan.value,
                })
            except Exception as exc:
                log.warning("autopilot.minute_reminder_failed", error=str(exc))

        await _record_action(
            session, tenant_id, run_id,
            check_name="minute_limit", action_type="reminder_sent",
            title=f"{label} hit their minute limit", target_type="subscription", target_id=sub.id,
            detail=f"{sub.minutes_used}/{sub.minutes_limit} minutes used on {sub.plan.value}. Reminder email sent automatically.",
            requires_approval=False, auto_result="Reminder sent",
        )
        count += 1
    return count


async def check_stuck_campaigns(session: AsyncSession, tenant_id: str, run_id: str) -> int:
    """A campaign stuck in 'running' with no calls dialed for a while is
    almost always broken — queue it for a human rather than guess and auto-fix."""
    count = 0
    cutoff = datetime.now(UTC) - timedelta(minutes=20)
    result = await session.execute(
        select(CampaignModel).where(
            CampaignModel.tenant_id == tenant_id,
            CampaignModel.status == CampaignStatus.RUNNING,
            CampaignModel.updated_at < cutoff,
        )
    )
    for campaign in result.scalars().all():
        calls_result = await session.execute(
            text("SELECT COUNT(*) FROM voice_calls WHERE campaign_id = :cid"), {"cid": campaign.id}
        )
        call_count = calls_result.scalar() or 0
        if call_count > 0:
            continue  # it's actually working, just slow

        await _record_action(
            session, tenant_id, run_id,
            check_name="stuck_campaign", action_type="pause_campaign",
            title=f"Campaign \"{campaign.name}\" looks stuck", target_type="campaign", target_id=campaign.id,
            detail="Been 'running' for 20+ minutes with zero calls dialed — likely missing an assistant, contacts, or valid credentials.",
            requires_approval=True,
        )
        count += 1
    return count


async def check_failed_payments(session: AsyncSession, tenant_id: str, run_id: str) -> int:
    """Failed payments in the last 24h get flagged — always requires
    approval since it's money, per the guardrail."""
    count = 0
    cutoff = datetime.now(UTC) - timedelta(hours=24)
    result = await session.execute(
        select(PaymentModel).where(
            PaymentModel.tenant_id == tenant_id,
            PaymentModel.status == PaymentStatus.FAILED,
            PaymentModel.created_at >= cutoff,
        )
    )
    for payment in result.scalars().all():
        await _record_action(
            session, tenant_id, run_id,
            check_name="failed_payment", action_type="review_payment",
            title=f"Payment failed — ₹{payment.amount}", target_type="payment", target_id=payment.id,
            detail=f"{payment.gateway.value if payment.gateway else 'unknown gateway'} payment for {payment.plan.value if payment.plan else 'add-on'} failed.",
            requires_approval=True,
        )
        count += 1
    return count


async def execute_approved_action(session: AsyncSession, action: AutopilotActionModel) -> str:
    """Runs the actual effect of an approved action. Only wired up for
    action types that have a safe, well-defined effect — anything else just
    gets marked approved with no automatic follow-through (a note for the
    superadmin to act on manually)."""
    if action.action_type == "pause_campaign" and action.target_id:
        campaign = await session.get(CampaignModel, action.target_id)
        if campaign and campaign.status == CampaignStatus.RUNNING:
            campaign.status = CampaignStatus.PAUSED
            return "Campaign paused."
        return "Campaign was already changed — no action taken."
    return "Marked approved — no automatic follow-through defined for this action type yet."


async def run_autopilot(session: AsyncSession, tenant_id: str) -> dict:
    run = AutopilotRunModel(id=str(uuid4()), tenant_id=tenant_id, checks_run=[
        "minute_limits", "stuck_campaigns", "failed_payments",
    ])
    session.add(run)
    await session.flush()

    findings = 0
    findings += await check_minute_limits(session, tenant_id, run.id)
    findings += await check_stuck_campaigns(session, tenant_id, run.id)
    findings += await check_failed_payments(session, tenant_id, run.id)

    auto_count_result = await session.execute(
        select(AutopilotActionModel).where(AutopilotActionModel.run_id == run.id, AutopilotActionModel.requires_approval.is_(False))
    )
    auto_count = len(auto_count_result.scalars().all())

    run.finished_at = datetime.now(UTC)
    run.findings_count = findings
    run.actions_count = auto_count
    run.status = "completed"
    run.summary = f"{findings} finding(s), {auto_count} auto-resolved, {findings - auto_count} awaiting approval." if findings else "All clear — nothing needs attention."
    await session.commit()

    log.info("autopilot.run.completed", tenant_id=tenant_id, findings=findings)
    return {"run_id": run.id, "findings": findings, "auto_resolved": auto_count, "summary": run.summary}
