"""core/plans.py — single source of truth for pricing & minute limits.

Amounts are in INR (paise-free, e.g. 999 = ₹999). Stripe amounts are
converted to the smallest currency unit (paise) at call time.
"""
from app.domain.enums import BillingPlan

PLANS: dict[str, dict] = {
    BillingPlan.STARTER: {
        "name": "Starter",
        "price_inr": 999,
        "minutes_limit": 60,
        "description": "For individuals getting started with AI voice calls.",
    },
    BillingPlan.GROWTH: {
        "name": "Growth",
        "price_inr": 2999,
        "minutes_limit": 250,
        "description": "For growing teams running regular campaigns.",
    },
    BillingPlan.PRO: {
        "name": "Pro",
        "price_inr": 7999,
        "minutes_limit": 800,
        "description": "For agencies and resellers at scale.",
    },
    BillingPlan.ENTERPRISE: {
        "name": "Enterprise",
        "price_inr": None,
        "minutes_limit": None,  # None = unlimited / custom, contact sales
        "description": "Custom volume, SLAs, and dedicated support.",
    },
}

USAGE_WARNING_THRESHOLD = 0.8  # trigger "80% used" email via Make.com
