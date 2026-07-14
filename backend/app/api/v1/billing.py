"""api/v1/billing.py — subscriptions, Stripe + Razorpay (GPay/UPI) checkout,
per-user minute usage tracking, and Make.com email triggers.
"""
from datetime import UTC, datetime, timedelta
from uuid import uuid4

import structlog
from fastapi import APIRouter, Depends, Header, HTTPException, Request, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_db_session
from app.core.config import settings
from app.core.plans import PLANS, USAGE_WARNING_THRESHOLD
from app.core.security import CurrentUser, require_tenant_access
from app.domain.enums import BillingPlan, PaymentGateway, PaymentStatus, SubscriptionStatus
from app.infrastructure.db.billing_models import PaymentModel, SubscriptionModel, UsageLogModel
from app.infrastructure.integrations.make import MakeClient
from app.infrastructure.integrations.razorpay import RazorpayClient
from app.infrastructure.integrations.stripe import StripeClient

log = structlog.get_logger()

router = APIRouter(tags=["billing"])
public_router = APIRouter(prefix="/billing", tags=["billing"])  # no tenant prefix, no auth


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
async def list_plans():
    return [
        {
            "plan": plan.value,
            "name": info["name"],
            "price_inr": info["price_inr"],
            "minutes_limit": info["minutes_limit"],
            "description": info["description"],
        }
        for plan, info in PLANS.items()
    ]


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
        return {"subscription": None, "plans": await list_plans()}
    plan_info = PLANS.get(sub.plan, {})
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
    plan_info = PLANS.get(body.plan)
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


@billing_router.post("/checkout/razorpay/verify")
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
        await _activate_subscription(session, payment)
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
            await _activate_subscription(session, payment)
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
            await _activate_subscription(session, payment)
            await session.commit()
            await _send_invoice_email(payment)

    return {"ok": True}


# ── Shared helpers ───────────────────────────────────────────────────────────

async def _activate_subscription(session: AsyncSession, payment: PaymentModel) -> None:
    plan_info = PLANS[payment.plan]
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
    sub.minutes_limit = plan_info["minutes_limit"] or 0
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
