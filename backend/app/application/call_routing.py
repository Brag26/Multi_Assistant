"""application/call_routing.py — shared by CallService and CampaignService.

Two things every call placement needs to check, regardless of whether it's a
single test call, a workflow-triggered call, or a campaign dial:

1. Which Vapi account actually owns this assistant, so the call goes out
   through the right reseller's own credentials instead of always falling
   back to the platform's shared key.
2. Whether the person placing the call is still within their plan's minute
   allowance — this is the hard stop that usage tracking alone didn't
   enforce before.
"""
from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.domain.enums import IntegrationProvider, SubscriptionStatus
from app.infrastructure.db.billing_models import SubscriptionModel
from app.infrastructure.db.models import IntegrationAssetModel, IntegrationModel
from app.infrastructure.integrations.vapi import VapiClient


async def resolve_vapi_client(session: AsyncSession, tenant_id: str, assistant_id: str) -> VapiClient:
    """Finds which Vapi account synced this assistant (via owner_user_id on
    the synced asset) and uses that account's own API key. Falls back to the
    platform's shared key for assistants synced before this feature existed,
    or synced with no specific account connected."""
    asset_result = await session.execute(
        select(IntegrationAssetModel.owner_user_id).where(
            IntegrationAssetModel.tenant_id == tenant_id,
            IntegrationAssetModel.provider == IntegrationProvider.VAPI,
            IntegrationAssetModel.external_id == assistant_id,
        )
    )
    owner_user_id = asset_result.scalar_one_or_none()
    if not owner_user_id:
        return VapiClient()

    conn_result = await session.execute(
        select(IntegrationModel).where(
            IntegrationModel.tenant_id == tenant_id,
            IntegrationModel.provider == IntegrationProvider.VAPI,
            IntegrationModel.owner_user_id == owner_user_id,
            IntegrationModel.disconnected_at.is_(None),
        )
    )
    conn = conn_result.scalars().first()
    if conn and conn.config.get("api_key"):
        return VapiClient(api_key=conn.config["api_key"])
    return VapiClient()


async def resolve_phone_number_id(session: AsyncSession, tenant_id: str, from_number: str | None) -> str | None:
    """Maps a raw outbound number (e.g. campaign.twilio_phone_number,
    '+19297348240') to the Vapi phoneNumberId it was synced under, via
    _sync_vapi_phone_numbers. Returns None if we don't have a match — the
    caller falls back to Vapi's own default-number behavior in that case,
    same as before this fix, rather than blocking the call outright."""
    if not from_number:
        return None
    normalized = "".join(ch for ch in from_number if ch.isdigit() or ch == "+")
    result = await session.execute(
        select(IntegrationAssetModel).where(
            IntegrationAssetModel.tenant_id == tenant_id,
            IntegrationAssetModel.provider == IntegrationProvider.VAPI,
            IntegrationAssetModel.kind == "phone_number",
        )
    )
    for asset in result.scalars().all():
        candidate = str(asset.payload.get("number") or "")
        candidate_normalized = "".join(ch for ch in candidate if ch.isdigit() or ch == "+")
        if candidate_normalized and candidate_normalized.lstrip("+") == normalized.lstrip("+"):
            return asset.external_id
    return None


async def enforce_minute_limit(session: AsyncSession, tenant_id: str, user_id: str | None) -> None:
    """Blocks the call if the initiating user's active subscription has no
    minutes left. No-ops if they have no subscription at all (e.g. an
    account that's never been assigned a plan) — usage tracking there is
    handled separately and shouldn't block calling outright."""
    if not user_id:
        return
    result = await session.execute(
        select(SubscriptionModel).where(
            SubscriptionModel.tenant_id == tenant_id,
            SubscriptionModel.user_id == user_id,
            SubscriptionModel.status == SubscriptionStatus.ACTIVE,
        )
    )
    sub = result.scalar_one_or_none()
    if not sub or not sub.minutes_limit:
        return
    if sub.minutes_used >= sub.minutes_limit:
        raise HTTPException(
            status.HTTP_402_PAYMENT_REQUIRED,
            f"Minute limit reached ({sub.minutes_used}/{sub.minutes_limit} used this period) — upgrade your plan or buy an add-on to keep calling.",
        )
