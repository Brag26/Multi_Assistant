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
    import structlog
    log = structlog.get_logger()

    asset_result = await session.execute(
        select(IntegrationAssetModel.owner_user_id).where(
            IntegrationAssetModel.tenant_id == tenant_id,
            IntegrationAssetModel.provider == IntegrationProvider.VAPI,
            IntegrationAssetModel.external_id == assistant_id,
        )
    )
    owner_user_id = asset_result.scalar_one_or_none()
    if not owner_user_id:
        # Unowned/shared asset — but "shared" doesn't mean "use the bare
        # VAPI_API_KEY env var and hope it's set". The Setup Wizard stores
        # its own shared connection's key in the database (an `integrations`
        # row with owner_user_id NULL); that's very likely the actual key
        # that synced this assistant in the first place. Use it if it
        # exists, and only fall back to the env var if there's genuinely no
        # shared connection configured at all.
        shared_conn_result = await session.execute(
            select(IntegrationModel).where(
                IntegrationModel.tenant_id == tenant_id,
                IntegrationModel.provider == IntegrationProvider.VAPI,
                IntegrationModel.owner_user_id.is_(None),
                IntegrationModel.disconnected_at.is_(None),
            )
        )
        shared_conn = shared_conn_result.scalars().first()
        if shared_conn and shared_conn.config.get("api_key"):
            return VapiClient(api_key=shared_conn.config["api_key"])
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
    # This assistant belongs to a specific reseller's Vapi account, but that
    # account has no active connection with an api_key right now (disconnected,
    # or key removed) — falling back to the platform key here is very likely
    # WRONG, since Vapi scopes assistants per account: a real assistant ID
    # will come back "Does Not Exist" if queried with a different account's
    # key. Log it loudly so this isn't invisible next time.
    log.warning(
        "call_routing.vapi_owner_disconnected",
        assistant_id=assistant_id, owner_user_id=owner_user_id, tenant_id=tenant_id,
    )
    return VapiClient()


async def resolve_vapi_phone_number_id(session: AsyncSession, tenant_id: str, raw_phone_number: str | None) -> str | None:
    """Vapi's /call endpoint needs a phoneNumberId (its own resource ID for
    the outbound number), not a raw E.164 string — but the rest of this app
    (campaign.twilio_phone_number, AssistantAssignmentModel.phone_number)
    only ever stores raw numbers. Look up the synced Vapi phone-number asset
    whose actual number matches, and use its Vapi ID. Returns None if there's
    no raw number to resolve, or nothing synced matches it — callers should
    treat None as "can't place this call" rather than silently omitting the
    field, since Vapi will reject the call outright without one."""
    if not raw_phone_number:
        return None
    from app.domain.enums import IntegrationProvider
    from app.infrastructure.db.models import IntegrationAssetModel

    def digits_only(number: str) -> str:
        return "".join(ch for ch in number if ch.isdigit())

    target = digits_only(raw_phone_number)
    if not target:
        return None

    # Compare by digits only, not exact string — Vapi's API and whatever
    # this app has stored (Setup Wizard input, manual entry, etc.) can
    # differ in formatting ("+1 929-734-8240" vs "+19297348240") even when
    # they're the same real number. An exact-string match would silently
    # miss that and report "not recognized" for a number that's actually
    # fine, which is worse than the small cost of fetching and comparing
    # in Python for what's normally a short list of numbers.
    result = await session.execute(
        select(IntegrationAssetModel.external_id, IntegrationAssetModel.payload).where(
            IntegrationAssetModel.tenant_id == tenant_id,
            IntegrationAssetModel.provider == IntegrationProvider.VAPI,
            IntegrationAssetModel.kind == "phone_number",
        )
    )
    for external_id, payload in result.all():
        candidate = digits_only(str(payload.get("number", "")))
        # Compare on the last 10 digits so a stored/synced difference in
        # country-code prefix (e.g. "19297348240" vs "9297348240") doesn't
        # cause a false miss either.
        if candidate and (candidate == target or candidate[-10:] == target[-10:]):
            return external_id
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
