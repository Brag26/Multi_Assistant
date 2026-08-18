"""application/copilot_tools.py — the actual functions behind "Jarvis"'s
tools. Each function here corresponds 1:1 to a tool schema Vapi is
configured with (see copilot_tool_schemas() below) and to what
app/api/v1/copilot.py's webhook dispatches into by name.

Every handler takes (session, tenant_id, **arguments) and returns a plain
string — Vapi's tool-call response format requires a single-line string
result, never a JSON object/array, so formatting into readable text happens
here rather than being left to the assistant.
"""
from datetime import UTC, datetime, timedelta

from sqlalchemy import func, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.domain.enums import CallStatus, CampaignStatus
from app.infrastructure.db.models import CallModel, CampaignModel, IntegrationAssetModel, IntegrationProvider


def _oneline(s: str) -> str:
    """Vapi's tool response must be a single-line string — line breaks
    break its response parser. Collapse whitespace instead of newlines."""
    return " ".join(str(s).split())


async def get_dashboard_summary(session: AsyncSession, tenant_id: str, **_) -> str:
    today_start = datetime.now(UTC).replace(hour=0, minute=0, second=0, microsecond=0)

    total_today = (await session.execute(
        select(func.count(CallModel.id)).where(CallModel.tenant_id == tenant_id, CallModel.created_at >= today_start)
    )).scalar() or 0
    completed_today = (await session.execute(
        select(func.count(CallModel.id)).where(
            CallModel.tenant_id == tenant_id, CallModel.created_at >= today_start, CallModel.status == CallStatus.COMPLETED,
        )
    )).scalar() or 0
    running_campaigns = (await session.execute(
        select(func.count(CampaignModel.id)).where(CampaignModel.tenant_id == tenant_id, CampaignModel.status == CampaignStatus.RUNNING)
    )).scalar() or 0
    pending_approvals = (await session.execute(
        text("SELECT count(*) FROM memberships WHERE tenant_id = :tid AND status = 'pending'"), {"tid": tenant_id}
    )).scalar() or 0

    return _oneline(
        f"Today: {total_today} calls placed, {completed_today} completed. "
        f"{running_campaigns} campaign(s) currently running. {pending_approvals} account(s) pending approval."
    )


async def list_campaigns(session: AsyncSession, tenant_id: str, status: str | None = None, **_) -> str:
    stmt = select(CampaignModel).where(CampaignModel.tenant_id == tenant_id)
    if status:
        stmt = stmt.where(CampaignModel.status == status)
    stmt = stmt.order_by(CampaignModel.created_at.desc()).limit(15)
    campaigns = (await session.execute(stmt)).scalars().all()
    if not campaigns:
        return "No campaigns found" + (f" with status {status}" if status else "") + "."
    lines = [f"{c.name} ({c.status.value})" for c in campaigns]
    return _oneline("Campaigns: " + "; ".join(lines))


async def _find_campaign_by_name(session: AsyncSession, tenant_id: str, name: str) -> CampaignModel | None:
    result = await session.execute(
        select(CampaignModel).where(CampaignModel.tenant_id == tenant_id, CampaignModel.name.ilike(f"%{name}%"))
        .order_by(CampaignModel.created_at.desc()).limit(1)
    )
    return result.scalar_one_or_none()


async def launch_campaign(session: AsyncSession, tenant_id: str, campaign_name: str, triggered_by_user_id: str | None = None, **_) -> str:
    campaign = await _find_campaign_by_name(session, tenant_id, campaign_name)
    if not campaign:
        return f"Couldn't find a campaign matching '{campaign_name}'."
    if campaign.status == CampaignStatus.RUNNING:
        return f"'{campaign.name}' is already running."

    campaign.status = CampaignStatus.RUNNING
    await session.commit()

    from app.application.module_services import _dial_campaign_now
    import asyncio
    asyncio.create_task(_dial_campaign_now(str(campaign.id), tenant_id, triggered_by_user_id))
    return f"Launched '{campaign.name}' — dialing its contacts now."


async def pause_campaign(session: AsyncSession, tenant_id: str, campaign_name: str, **_) -> str:
    campaign = await _find_campaign_by_name(session, tenant_id, campaign_name)
    if not campaign:
        return f"Couldn't find a campaign matching '{campaign_name}'."
    campaign.status = CampaignStatus.PAUSED
    await session.commit()
    return f"Paused '{campaign.name}'."


async def resume_campaign(session: AsyncSession, tenant_id: str, campaign_name: str, triggered_by_user_id: str | None = None, **_) -> str:
    campaign = await _find_campaign_by_name(session, tenant_id, campaign_name)
    if not campaign:
        return f"Couldn't find a campaign matching '{campaign_name}'."
    campaign.status = CampaignStatus.RUNNING
    await session.commit()

    from app.application.module_services import _dial_campaign_now
    import asyncio
    asyncio.create_task(_dial_campaign_now(str(campaign.id), tenant_id, triggered_by_user_id))
    return f"Resumed '{campaign.name}'."


async def cancel_campaign(session: AsyncSession, tenant_id: str, campaign_name: str, **_) -> str:
    campaign = await _find_campaign_by_name(session, tenant_id, campaign_name)
    if not campaign:
        return f"Couldn't find a campaign matching '{campaign_name}'."
    campaign.status = CampaignStatus.CANCELED
    await session.commit()
    return f"Canceled '{campaign.name}'."


async def list_accounts(session: AsyncSession, tenant_id: str, role: str | None = None, **_) -> str:
    query = "SELECT display_name, email, role FROM memberships WHERE tenant_id = :tid AND role IN ('tenant_admin', 'agent')"
    params = {"tid": tenant_id}
    if role in ("tenant_admin", "agent"):
        query += " AND role = :role"
        params["role"] = role
    query += " ORDER BY role, created_at DESC LIMIT 20"
    rows = (await session.execute(text(query), params)).all()
    if not rows:
        return "No accounts found."
    lines = [f"{(r.display_name or r.email)} ({'Reseller' if r.role == 'tenant_admin' else 'Client'})" for r in rows]
    return _oneline("Accounts: " + "; ".join(lines))


async def get_account_usage(session: AsyncSession, tenant_id: str, account_name: str, **_) -> str:
    row = (await session.execute(
        text("""
            SELECT m.user_id::text, m.display_name, m.email, s.minutes_used, s.minutes_limit, s.plan
            FROM memberships m
            LEFT JOIN subscriptions s ON s.user_id = m.user_id
            WHERE m.tenant_id = :tid AND (m.display_name ILIKE :q OR m.email ILIKE :q)
            LIMIT 1
        """),
        {"tid": tenant_id, "q": f"%{account_name}%"},
    )).first()
    if not row:
        return f"Couldn't find an account matching '{account_name}'."
    name = row.display_name or row.email
    if row.minutes_limit is None:
        return f"{name} has no active subscription/plan."
    return _oneline(f"{name}: {row.minutes_used}/{row.minutes_limit} minutes used on the {row.plan} plan.")


async def list_assistants(session: AsyncSession, tenant_id: str, **_) -> str:
    result = await session.execute(
        select(IntegrationAssetModel).where(
            IntegrationAssetModel.tenant_id == tenant_id,
            IntegrationAssetModel.provider == IntegrationProvider.VAPI,
            IntegrationAssetModel.kind == "assistant",
        ).order_by(IntegrationAssetModel.label)
    )
    assets = result.scalars().all()
    if not assets:
        return "No assistants synced from Vapi yet."
    return _oneline("Assistants: " + "; ".join(a.label for a in assets))


async def get_recent_calls(session: AsyncSession, tenant_id: str, limit: int = 5, **_) -> str:
    limit = max(1, min(int(limit or 5), 15))
    result = await session.execute(
        select(CallModel).where(CallModel.tenant_id == tenant_id).order_by(CallModel.created_at.desc()).limit(limit)
    )
    calls = result.scalars().all()
    if not calls:
        return "No calls yet."
    lines = [f"{c.customer_phone}: {c.status.value}" + (f", {c.duration_seconds}s" if c.duration_seconds else "") for c in calls]
    return _oneline(f"Last {len(calls)} calls: " + "; ".join(lines))


# Name → handler. Used by the tool-calls webhook to dispatch by function name.
TOOL_HANDLERS = {
    "get_dashboard_summary": get_dashboard_summary,
    "list_campaigns": list_campaigns,
    "launch_campaign": launch_campaign,
    "pause_campaign": pause_campaign,
    "resume_campaign": resume_campaign,
    "cancel_campaign": cancel_campaign,
    "list_accounts": list_accounts,
    "get_account_usage": get_account_usage,
    "list_assistants": list_assistants,
    "get_recent_calls": get_recent_calls,
}


def copilot_tool_schemas() -> list[dict]:
    """Vapi tool definitions — passed as the assistant's `model.tools` when
    creating/updating the copilot assistant. Kept in the same file as the
    handlers so the two can never drift apart (add a tool here, you have to
    add its schema right below it)."""
    def tool(name: str, description: str, properties: dict | None = None, required: list[str] | None = None) -> dict:
        return {
            "type": "function",
            "function": {
                "name": name,
                "description": description,
                "parameters": {
                    "type": "object",
                    "properties": properties or {},
                    "required": required or [],
                },
            },
            "server": {"url": "__SERVER_URL__"},  # replaced at assistant-creation time
        }

    return [
        tool("get_dashboard_summary", "Get a quick summary of today's activity: calls placed/completed, running campaigns, pending account approvals."),
        tool("list_campaigns", "List campaigns, optionally filtered by status.",
             {"status": {"type": "string", "description": "Filter by status: draft, scheduled, running, paused, completed, canceled. Omit to list recent campaigns of any status."}}),
        tool("launch_campaign", "Start dialing a campaign's contacts right now.",
             {"campaign_name": {"type": "string", "description": "Name (or part of the name) of the campaign to launch."}}, ["campaign_name"]),
        tool("pause_campaign", "Pause a currently running campaign.",
             {"campaign_name": {"type": "string", "description": "Name (or part of the name) of the campaign to pause."}}, ["campaign_name"]),
        tool("resume_campaign", "Resume a paused campaign — continues dialing contacts not yet reached.",
             {"campaign_name": {"type": "string", "description": "Name (or part of the name) of the campaign to resume."}}, ["campaign_name"]),
        tool("cancel_campaign", "Cancel a campaign entirely.",
             {"campaign_name": {"type": "string", "description": "Name (or part of the name) of the campaign to cancel."}}, ["campaign_name"]),
        tool("list_accounts", "List reseller and client accounts on the platform.",
             {"role": {"type": "string", "description": "Filter by 'tenant_admin' (reseller) or 'agent' (client). Omit to list both."}}),
        tool("get_account_usage", "Get a specific account's subscription plan and minutes used vs. their limit.",
             {"account_name": {"type": "string", "description": "Name or email (or part of it) of the account to look up."}}, ["account_name"]),
        tool("list_assistants", "List every Vapi assistant that's been synced into the platform."),
        tool("get_recent_calls", "Get the most recent calls placed, with status and duration.",
             {"limit": {"type": "integer", "description": "How many recent calls to return, default 5, max 15."}}),
    ]
