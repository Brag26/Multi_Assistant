"""infrastructure/db/billing_models.py — subscriptions, payments, usage tracking.

Plans are defined in code (app.core.plans), not in the DB, so pricing/limit
changes don't need a migration.
"""
from datetime import datetime
from uuid import uuid4

from sqlalchemy import DateTime, Enum, ForeignKey, Integer, Numeric, String, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.domain.enums import BillingPlan, PaymentGateway, PaymentStatus, SubscriptionStatus
from app.infrastructure.db.base import Base


class SubscriptionModel(Base):
    __tablename__ = "subscriptions"
    id: Mapped[str] = mapped_column(UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid4()))
    tenant_id: Mapped[str] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), index=True)
    user_id: Mapped[str] = mapped_column(UUID(as_uuid=False), index=True)  # per-user minute limits
    plan: Mapped[BillingPlan] = mapped_column(
        Enum(BillingPlan, values_callable=lambda e: [x.value for x in e], name="billing_plan"),
        nullable=False,
    )
    status: Mapped[SubscriptionStatus] = mapped_column(
        Enum(SubscriptionStatus, values_callable=lambda e: [x.value for x in e], name="subscription_status"),
        default=SubscriptionStatus.TRIALING,
    )
    gateway: Mapped[PaymentGateway | None] = mapped_column(
        Enum(PaymentGateway, values_callable=lambda e: [x.value for x in e], name="payment_gateway"),
    )
    gateway_customer_id: Mapped[str | None] = mapped_column(String(160))
    gateway_subscription_id: Mapped[str | None] = mapped_column(String(160), index=True)
    minutes_limit: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    minutes_used: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    warning_sent_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    current_period_start: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    renewal_date: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    canceled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class PaymentModel(Base):
    __tablename__ = "payments"
    id: Mapped[str] = mapped_column(UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid4()))
    tenant_id: Mapped[str] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), index=True)
    user_id: Mapped[str] = mapped_column(UUID(as_uuid=False), index=True)
    subscription_id: Mapped[str | None] = mapped_column(ForeignKey("subscriptions.id", ondelete="SET NULL"), index=True)
    gateway: Mapped[PaymentGateway | None] = mapped_column(
        Enum(PaymentGateway, values_callable=lambda e: [x.value for x in e], name="payment_gateway"),
        nullable=True,
    )
    gateway_payment_id: Mapped[str | None] = mapped_column(String(160), index=True)
    gateway_order_id: Mapped[str | None] = mapped_column(String(160), index=True)
    amount: Mapped[float] = mapped_column(Numeric(10, 2), nullable=False)
    currency: Mapped[str] = mapped_column(String(8), default="INR")
    status: Mapped[PaymentStatus] = mapped_column(
        Enum(PaymentStatus, values_callable=lambda e: [x.value for x in e], name="payment_status"),
        default=PaymentStatus.PENDING,
    )
    plan: Mapped[BillingPlan | None] = mapped_column(
        Enum(BillingPlan, values_callable=lambda e: [x.value for x in e], name="billing_plan"),
    )
    addon_key: Mapped[str | None] = mapped_column(String(60))
    addon_key: Mapped[str | None] = mapped_column(String(60))
    receipt_url: Mapped[str | None] = mapped_column(String(500))
    raw_payload: Mapped[dict] = mapped_column(JSONB, default=dict, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class UsageLogModel(Base):
    __tablename__ = "usage_logs"
    id: Mapped[str] = mapped_column(UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid4()))
    tenant_id: Mapped[str] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), index=True)
    user_id: Mapped[str] = mapped_column(UUID(as_uuid=False), index=True)
    subscription_id: Mapped[str | None] = mapped_column(ForeignKey("subscriptions.id", ondelete="SET NULL"), index=True)
    call_id: Mapped[str | None] = mapped_column(ForeignKey("voice_calls.id", ondelete="SET NULL"), index=True)
    minutes: Mapped[float] = mapped_column(Numeric(10, 2), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class PlanConfigModel(Base):
    """Superadmin-editable plan pricing/limits. Seeded from core/plans.py
    defaults in migration 0005; the code defaults remain as a fallback if a
    row is ever missing."""
    __tablename__ = "plan_configs"
    plan: Mapped[BillingPlan] = mapped_column(
        Enum(BillingPlan, values_callable=lambda e: [x.value for x in e], name="billing_plan"),
        primary_key=True,
    )
    name: Mapped[str] = mapped_column(String(80), nullable=False)
    price_inr: Mapped[float | None] = mapped_column(Numeric(10, 2))
    minutes_limit: Mapped[int | None] = mapped_column(Integer)
    description: Mapped[str] = mapped_column(String(500), default="")
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class AddonConfigModel(Base):
    """One-time top-up packs (e.g. +100 minutes for ₹5000), editable by
    superadmin. `key` is a stable slug so new add-on types can be added later
    without a schema change."""
    __tablename__ = "addon_configs"
    key: Mapped[str] = mapped_column(String(60), primary_key=True)
    name: Mapped[str] = mapped_column(String(80), nullable=False)
    price_inr: Mapped[float] = mapped_column(Numeric(10, 2), nullable=False)
    minutes: Mapped[int] = mapped_column(Integer, nullable=False)
    description: Mapped[str] = mapped_column(String(300), default="")
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
