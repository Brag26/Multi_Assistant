"""api/v1/billing.py — subscriptions, Stripe + Razorpay (GPay/UPI) checkout,
per-user minute usage tracking, and Make.com email triggers.
"""
from datetime import UTC, datetime, timedelta
from uuid import uuid4

import structlog
from fastapi import APIRouter, Depends, Header, HTTPException, Request, status
from pydantic import BaseModel
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_db_session
from app.core.config import settings
from app.core.plans import PLANS, USAGE_WARNING_THRESHOLD
from app.core.security import CurrentUser, Role, require_role, require_tenant_access
from app.domain.enums import BillingPlan, PaymentGateway, PaymentStatus, SubscriptionStatus
from app.infrastructure.db.billing_models import AddonConfigModel, PaymentModel, PlanConfigModel, SubscriptionModel, UsageLogModel
from app.infrastructure.integrations.make import MakeClient
from app.infrastructure.integrations.razorpay import RazorpayClient
from app.infrastructure.integrations.stripe import StripeClient

log = structlog.get_logger()

router = APIRouter(tags=["billing"])
public_router = APIRouter(prefix="/billing", tags=["billing"])  # no tenant prefix, no auth
admin_router = APIRouter(prefix="/admin/billing", tags=["billing-admin"])
SuperAdmin = require_role(Role.SUPER_ADMIN)


# ── Plan config helpers (DB-backed, superadmin-editable) ────────────────────

async def get_plan_configs(session: AsyncSession) -> dict[BillingPlan, dict]:
    try:
        result = await session.execute(select(PlanConfigModel))
        rows = {row.plan: row for row in result.scalars().all()}
    except Exception:
        # plan_configs migration (0005) hasn't been run against this DB yet —
        # fall back to code defaults rather than 500ing the whole billing page.
        await session.rollback()
        log.warning("billing.plan_configs.missing_table")
        rows = {}
    configs: dict[BillingPlan, dict] = {}
    for plan, defaults in PLANS.items():
        row = rows.get(plan)
        if row:
            configs[plan] = {
                "name": row.name,
                "price_inr": float(row.price_inr) if row.price_inr is not None else None,
                "minutes_limit": row.minutes_limit,
                "description": row.description,
            }
        else:
            configs[plan] = defaults
    return configs


async def get_addon_configs(session: AsyncSession) -> dict[str, dict]:
    try:
        result = await session.execute(select(AddonConfigModel))
        return {
            row.key: {"name": row.name, "price_inr": float(row.price_inr), "minutes": row.minutes, "description": row.description}
            for row in result.scalars().all()
        }
    except Exception:
        # addon_configs migration (0007) hasn't been run against this DB yet.
        await session.rollback()
        log.warning("billing.addon_configs.missing_table")
        return {}


# ── Schemas ──────────────────────────────────────────────────────────────────

class CheckoutRequest(BaseModel):
    plan: BillingPlan
    gateway: PaymentGateway


class VerifyRazorpayRequest(BaseModel):
    order_id: str
    payment_id: str
    signature: str


# ── Public: plan catalog ─────────────────────────────────────────────────────

@public_router.get("/plans")
async def list_plans(session: AsyncSession = Depends(get_db_session)):
    configs = await get_plan_configs(session)
    return [
        {
            "plan": plan.value,
            "name": info["name"],
            "price_inr": info["price_inr"],
            "minutes_limit": info["minutes_limit"],
            "description": info["description"],
        }
        for plan, info in configs.items()
    ]


@public_router.get("/addons")
async def list_addons(session: AsyncSession = Depends(get_db_session)):
    configs = await get_addon_configs(session)
    return [{"key": key, **info} for key, info in configs.items()]


class AddonCheckoutRequest(BaseModel):
    addon_key: str
    gateway: PaymentGateway


# ── Tenant-scoped: current subscription / usage ─────────────────────────────

billing_router = APIRouter(prefix="/tenants/{tenant_id}/billing", tags=["billing"])


@billing_router.get("/me")
async def my_subscription(
    tenant_id: str,
    user: CurrentUser,
    session: AsyncSession = Depends(get_db_session),
):
    require_tenant_access(user, tenant_id)
    result = await session.execute(
        select(SubscriptionModel).where(
            SubscriptionModel.tenant_id == tenant_id,
            SubscriptionModel.user_id == user.user_id,
        )
    )
    sub = result.scalar_one_or_none()
    if not sub:
        return {"subscription": None, "plans": await list_plans(session)}
    configs = await get_plan_configs(session)
    plan_info = configs.get(sub.plan, {})
    return {
        "subscription": {
            "id": sub.id,
            "plan": sub.plan.value,
            "plan_name": plan_info.get("name"),
            "status": sub.status.value,
            "minutes_limit": sub.minutes_limit,
            "minutes_used": sub.minutes_used,
            "minutes_remaining": max(sub.minutes_limit - sub.minutes_used, 0),
            "usage_pct": round((sub.minutes_used / sub.minutes_limit) * 100, 1) if sub.minutes_limit else 0,
            "renewal_date": sub.renewal_date,
            "gateway": sub.gateway.value if sub.gateway else None,
        }
    }


@billing_router.post("/checkout")
async def create_checkout(
    tenant_id: str,
    body: CheckoutRequest,
    user: CurrentUser,
    session: AsyncSession = Depends(get_db_session),
):
    require_tenant_access(user, tenant_id)
    configs = await get_plan_configs(session)
    plan_info = configs.get(body.plan)
    if not plan_info or plan_info["price_inr"] is None:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Contact sales for Enterprise plan")

    receipt = f"sub_{tenant_id[:8]}_{uuid4().hex[:8]}"
    metadata = {"tenant_id": tenant_id, "user_id": user.user_id, "plan": body.plan.value, "email": user.email or ""}

    payment = PaymentModel(
        tenant_id=tenant_id,
        user_id=user.user_id,
        gateway=body.gateway,
        amount=plan_info["price_inr"],
        currency="INR" if body.gateway == PaymentGateway.RAZORPAY else settings.stripe_price_currency.upper(),
        status=PaymentStatus.PENDING,
        plan=body.plan,
    )

    if body.gateway == PaymentGateway.RAZORPAY:
        order = await RazorpayClient().create_order(plan_info["price_inr"], receipt, metadata)
        payment.gateway_order_id = order["id"]
        session.add(payment)
        await session.commit()
        return {
            "gateway": "razorpay",
            "order_id": order["id"],
            "amount": order["amount"],
            "currency": order["currency"],
            "key_id": settings.razorpay_key_id,
            "payment_row_id": payment.id,
            # frontend opens Razorpay Checkout with method preference "upi" so GPay shows first
        }

    session_obj = await StripeClient().create_checkout_session(
        plan_info["price_inr"],
        plan_info["name"],
        success_url=f"{settings.frontend_url}/billing?checkout=success",
        cancel_url=f"{settings.frontend_url}/billing?checkout=cancelled",
        metadata=metadata,
    )
    payment.gateway_order_id = session_obj["id"]
    session.add(payment)
    await session.commit()
    return {"gateway": "stripe", "checkout_url": session_obj["url"], "session_id": session_obj["id"], "payment_row_id": payment.id}


@billing_router.post("/addon/checkout")
async def create_addon_checkout(
    tenant_id: str,
    body: AddonCheckoutRequest,
    user: CurrentUser,
    session: AsyncSession = Depends(get_db_session),
):
    """Buy a one-time minute top-up pack. Only makes sense for accounts that
    already have an active subscription — the minutes get added to it."""
    require_tenant_access(user, tenant_id)
    configs = await get_addon_configs(session)
    addon = configs.get(body.addon_key)
    if not addon:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Unknown add-on")

    receipt = f"addon_{tenant_id[:8]}_{uuid4().hex[:8]}"
    metadata = {"tenant_id": tenant_id, "user_id": user.user_id, "addon_key": body.addon_key, "email": user.email or ""}

    payment = PaymentModel(
        tenant_id=tenant_id, user_id=user.user_id, gateway=body.gateway, amount=addon["price_inr"],
        currency="INR" if body.gateway == PaymentGateway.RAZORPAY else settings.stripe_price_currency.upper(),
        status=PaymentStatus.PENDING, addon_key=body.addon_key,
    )

    if body.gateway == PaymentGateway.RAZORPAY:
        order = await RazorpayClient().create_order(addon["price_inr"], receipt, metadata)
        payment.gateway_order_id = order["id"]
        session.add(payment)
        await session.commit()
        return {
            "gateway": "razorpay", "order_id": order["id"], "amount": order["amount"],
            "currency": order["currency"], "key_id": settings.razorpay_key_id, "payment_row_id": payment.id,
        }

    session_obj = await StripeClient().create_checkout_session(
        addon["price_inr"], addon["name"],
        success_url=f"{settings.frontend_url}/billing?checkout=success",
        cancel_url=f"{settings.frontend_url}/billing?checkout=cancelled",
        metadata=metadata,
    )
    payment.gateway_order_id = session_obj["id"]
    session.add(payment)
    await session.commit()
    return {"gateway": "stripe", "checkout_url": session_obj["url"], "session_id": session_obj["id"], "payment_row_id": payment.id}
async def verify_razorpay_checkout(
    tenant_id: str,
    body: VerifyRazorpayRequest,
    user: CurrentUser,
    session: AsyncSession = Depends(get_db_session),
):
    """Called by the frontend right after Razorpay Checkout succeeds, to confirm
    the payment signature client-side before the async webhook lands."""
    require_tenant_access(user, tenant_id)
    if not RazorpayClient().verify_payment_signature(body.order_id, body.payment_id, body.signature):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Invalid payment signature")

    result = await session.execute(select(PaymentModel).where(PaymentModel.gateway_order_id == body.order_id))
    payment = result.scalar_one_or_none()
    if not payment:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Payment record not found")
    if payment.status != PaymentStatus.SUCCESS:
        payment.status = PaymentStatus.SUCCESS
        payment.gateway_payment_id = body.payment_id
        await _fulfill_payment(session, payment)
        await session.commit()
        await _send_invoice_email(payment)
    return {"ok": True}


# ── Webhooks (public, signature-verified) ───────────────────────────────────

@router.post("/webhooks/razorpay")
async def razorpay_webhook(request: Request, session: AsyncSession = Depends(get_db_session), x_razorpay_signature: str | None = Header(default=None)):
    body = await request.body()
    if not RazorpayClient().verify_webhook_signature(body, x_razorpay_signature):
        return {"ok": False}, status.HTTP_401_UNAUTHORIZED
    payload = (await request.json())
    event = payload.get("event")
    log.info("razorpay.webhook", event=event)

    if event == "payment.captured":
        entity = payload["payload"]["payment"]["entity"]
        order_id = entity.get("order_id")
        result = await session.execute(select(PaymentModel).where(PaymentModel.gateway_order_id == order_id))
        payment = result.scalar_one_or_none()
        if payment and payment.status != PaymentStatus.SUCCESS:
            payment.status = PaymentStatus.SUCCESS
            payment.gateway_payment_id = entity.get("id")
            payment.raw_payload = entity
            await _fulfill_payment(session, payment)
            await session.commit()
            await _send_invoice_email(payment)
    elif event == "payment.failed":
        entity = payload["payload"]["payment"]["entity"]
        result = await session.execute(select(PaymentModel).where(PaymentModel.gateway_order_id == entity.get("order_id")))
        payment = result.scalar_one_or_none()
        if payment:
            payment.status = PaymentStatus.FAILED
            await session.commit()

    return {"ok": True}


@router.post("/webhooks/stripe")
async def stripe_webhook(request: Request, session: AsyncSession = Depends(get_db_session), stripe_signature: str | None = Header(default=None)):
    body = await request.body()
    if not StripeClient().verify_webhook_signature(body, stripe_signature):
        return {"ok": False}, status.HTTP_401_UNAUTHORIZED
    payload = await request.json()
    event = payload.get("type")
    log.info("stripe.webhook", event=event)

    if event == "checkout.session.completed":
        obj = payload["data"]["object"]
        result = await session.execute(select(PaymentModel).where(PaymentModel.gateway_order_id == obj["id"]))
        payment = result.scalar_one_or_none()
        if payment and payment.status != PaymentStatus.SUCCESS:
            payment.status = PaymentStatus.SUCCESS
            payment.gateway_payment_id = obj.get("payment_intent")
            payment.raw_payload = obj
            await _fulfill_payment(session, payment)
            await session.commit()
            await _send_invoice_email(payment)

    return {"ok": True}


# ── Shared helpers ───────────────────────────────────────────────────────────

async def _fulfill_payment(session: AsyncSession, payment: PaymentModel) -> None:
    """Route a successful payment to the right side-effect: a plan purchase
    activates/replaces the subscription; an add-on purchase just tops up
    minutes on whatever subscription is already active."""
    if payment.addon_key:
        await _apply_addon(session, payment)
    else:
        await _activate_subscription(session, payment)


async def _apply_addon(session: AsyncSession, payment: PaymentModel) -> None:
    configs = await get_addon_configs(session)
    addon = configs.get(payment.addon_key)
    if not addon:
        log.warning("billing.addon.unknown", key=payment.addon_key)
        return
    result = await session.execute(
        select(SubscriptionModel).where(
            SubscriptionModel.tenant_id == payment.tenant_id,
            SubscriptionModel.user_id == payment.user_id,
        )
    )
    sub = result.scalar_one_or_none()
    if not sub:
        log.warning("billing.addon.no_subscription", user_id=payment.user_id)
        return
    sub.minutes_limit += addon["minutes"]
    payment.subscription_id = sub.id


async def _activate_subscription(session: AsyncSession, payment: PaymentModel, minutes_limit_override: int | None = None) -> None:
    configs = await get_plan_configs(session)
    plan_info = configs[payment.plan]
    result = await session.execute(
        select(SubscriptionModel).where(
            SubscriptionModel.tenant_id == payment.tenant_id,
            SubscriptionModel.user_id == payment.user_id,
        )
    )
    sub = result.scalar_one_or_none()
    now = datetime.now(UTC)
    if not sub:
        sub = SubscriptionModel(tenant_id=payment.tenant_id, user_id=payment.user_id)
        session.add(sub)
    sub.plan = payment.plan
    sub.status = SubscriptionStatus.ACTIVE
    sub.gateway = payment.gateway
    sub.minutes_limit = minutes_limit_override if minutes_limit_override is not None else (plan_info["minutes_limit"] or 0)
    sub.minutes_used = 0
    sub.warning_sent_at = None
    sub.current_period_start = now
    sub.renewal_date = now + timedelta(days=30)
    payment.subscription_id = sub.id


async def _send_invoice_email(payment: PaymentModel) -> None:
    if not settings.make_invoice_email_webhook:
        return
    try:
        await MakeClient().trigger_workflow(settings.make_invoice_email_webhook, {
            "event": "invoice",
            "user_id": payment.user_id,
            "tenant_id": payment.tenant_id,
            "amount": float(payment.amount),
            "currency": payment.currency,
            "plan": payment.plan.value if payment.plan else None,
            "addon_key": payment.addon_key,
            "gateway": payment.gateway.value,
            "payment_id": payment.gateway_payment_id,
        })
    except Exception as exc:  # pragma: no cover - best effort notification
        log.warning("make.invoice_email.failed", error=str(exc))


async def record_usage(session: AsyncSession, tenant_id: str, user_id: str, call_id: str, duration_seconds: int) -> None:
    """Deduct minutes from the user's active subscription and fire an 80%-usage
    warning email via Make.com when the threshold is crossed. Called from the
    Vapi `call.ended` webhook — safe no-op if the user has no subscription."""
    if not user_id or duration_seconds <= 0:
        return
    result = await session.execute(
        select(SubscriptionModel).where(
            SubscriptionModel.tenant_id == tenant_id,
            SubscriptionModel.user_id == user_id,
            SubscriptionModel.status == SubscriptionStatus.ACTIVE,
        )
    )
    sub = result.scalar_one_or_none()
    if not sub:
        return

    minutes = round(duration_seconds / 60, 2)
    session.add(UsageLogModel(tenant_id=tenant_id, user_id=user_id, subscription_id=sub.id, call_id=call_id, minutes=minutes))
    sub.minutes_used += minutes

    if sub.minutes_limit and sub.minutes_used >= sub.minutes_limit * USAGE_WARNING_THRESHOLD and not sub.warning_sent_at:
        sub.warning_sent_at = datetime.now(UTC)
        if settings.make_usage_warning_webhook:
            try:
                await MakeClient().trigger_workflow(settings.make_usage_warning_webhook, {
                    "event": "usage_warning",
                    "user_id": user_id,
                    "tenant_id": tenant_id,
                    "minutes_used": sub.minutes_used,
                    "minutes_limit": sub.minutes_limit,
                    "plan": sub.plan.value,
                })
            except Exception as exc:  # pragma: no cover
                log.warning("make.usage_warning.failed", error=str(exc))

    await session.commit()


# ── Superadmin: accounts overview, free plan assignment, editable pricing ────

class AssignPlanRequest(BaseModel):
    user_id: str
    plan: BillingPlan
    minutes_limit: int | None = None  # override; required for Enterprise since it has no default


class UpdatePlanConfigRequest(BaseModel):
    name: str | None = None
    price_inr: float | None = None
    minutes_limit: int | None = None
    description: str | None = None


@admin_router.get("/plans")
async def admin_list_plans(user=Depends(SuperAdmin), session: AsyncSession = Depends(get_db_session)):
    """Same shape as the public plan list, but always fresh for the editor UI."""
    configs = await get_plan_configs(session)
    return [{"plan": plan.value, **info} for plan, info in configs.items()]


@admin_router.put("/plans/{plan}")
async def admin_update_plan(
    plan: BillingPlan,
    body: UpdatePlanConfigRequest,
    user=Depends(SuperAdmin),
    session: AsyncSession = Depends(get_db_session),
):
    """Edit pricing/minute limits for a plan. Changes apply to future
    checkouts and assignments immediately — existing subscriptions keep
    whatever minutes_limit they were given at signup."""
    result = await session.execute(select(PlanConfigModel).where(PlanConfigModel.plan == plan))
    row = result.scalar_one_or_none()
    if not row:
        defaults = PLANS[plan]
        row = PlanConfigModel(plan=plan, name=defaults["name"], price_inr=defaults["price_inr"],
                               minutes_limit=defaults["minutes_limit"], description=defaults["description"])
        session.add(row)
    if body.name is not None:
        row.name = body.name
    if body.price_inr is not None:
        row.price_inr = body.price_inr
    if body.minutes_limit is not None:
        row.minutes_limit = body.minutes_limit
    if body.description is not None:
        row.description = body.description
    await session.commit()
    return {"plan": plan.value, "name": row.name, "price_inr": float(row.price_inr) if row.price_inr is not None else None,
            "minutes_limit": row.minutes_limit, "description": row.description}


@admin_router.get("/accounts")
async def admin_list_accounts(user=Depends(SuperAdmin), session: AsyncSession = Depends(get_db_session)):
    """All resellers (tenant_admin) and clients (agent), each with their
    current subscription if any — for the superadmin's plan-assignment view."""
    result = await session.execute(text("""
        SELECT m.user_id::text as user_id, m.email, m.display_name, m.role, m.created_by::text as created_by
        FROM memberships m
        WHERE m.role IN ('tenant_admin', 'agent')
        ORDER BY m.role, m.created_at DESC
    """))
    accounts = [dict(r) for r in result.mappings().all()]

    sub_result = await session.execute(select(SubscriptionModel))
    subs_by_user = {s.user_id: s for s in sub_result.scalars().all()}

    for acct in accounts:
        sub = subs_by_user.get(acct["user_id"])
        acct["subscription"] = None if not sub else {
            "plan": sub.plan.value, "status": sub.status.value,
            "minutes_limit": sub.minutes_limit, "minutes_used": sub.minutes_used,
            "gateway": sub.gateway.value if sub.gateway else None,
        }
    return accounts


@admin_router.post("/assign")
async def admin_assign_plan(
    body: AssignPlanRequest,
    user=Depends(SuperAdmin),
    session: AsyncSession = Depends(get_db_session),
):
    """Superadmin grants a plan to a reseller/client directly — no payment,
    no gateway involved. Used for comped accounts, manual deals, or Enterprise
    (which has no self-serve price)."""
    configs = await get_plan_configs(session)
    plan_info = configs.get(body.plan, {})
    minutes_limit = body.minutes_limit if body.minutes_limit is not None else plan_info.get("minutes_limit")
    if minutes_limit is None:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "minutes_limit is required for plans without a default (e.g. Enterprise)")

    # Look up the account's tenant (all accounts share the single Default tenant in this app)
    result = await session.execute(text("SELECT tenant_id::text FROM memberships WHERE user_id = :uid LIMIT 1"), {"uid": body.user_id})
    row = result.fetchone()
    if not row:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Account not found")
    tenant_id = row[0]

    payment = PaymentModel(
        tenant_id=tenant_id, user_id=body.user_id, gateway=None, amount=0, currency="INR",
        status=PaymentStatus.SUCCESS, plan=body.plan, raw_payload={"assigned_by": user.user_id, "note": "admin-assigned, no charge"},
    )
    session.add(payment)
    await _activate_subscription(session, payment, minutes_limit_override=minutes_limit)
    await session.commit()
    return {"ok": True}


class UpdateAddonConfigRequest(BaseModel):
    name: str | None = None
    price_inr: float | None = None
    minutes: int | None = None
    description: str | None = None


@admin_router.get("/addons")
async def admin_list_addons(user=Depends(SuperAdmin), session: AsyncSession = Depends(get_db_session)):
    configs = await get_addon_configs(session)
    return [{"key": key, **info} for key, info in configs.items()]


@admin_router.put("/addons/{key}")
async def admin_update_addon(
    key: str,
    body: UpdateAddonConfigRequest,
    user=Depends(SuperAdmin),
    session: AsyncSession = Depends(get_db_session),
):
    result = await session.execute(select(AddonConfigModel).where(AddonConfigModel.key == key))
    row = result.scalar_one_or_none()
    if not row:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Unknown add-on")
    if body.name is not None:
        row.name = body.name
    if body.price_inr is not None:
        row.price_inr = body.price_inr
    if body.minutes is not None:
        row.minutes = body.minutes
    if body.description is not None:
        row.description = body.description
    await session.commit()
    return {"key": row.key, "name": row.name, "price_inr": float(row.price_inr), "minutes": row.minutes, "description": row.description}

