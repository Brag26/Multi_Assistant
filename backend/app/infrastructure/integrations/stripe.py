import hashlib
import hmac
import time

import httpx

from app.core.config import settings

STRIPE_BASE = "https://api.stripe.com/v1"


class StripeClient:
    def __init__(self, secret_key: str | None = None):
        self.secret_key = secret_key or settings.stripe_secret_key

    def _headers(self) -> dict[str, str]:
        return {"Authorization": f"Bearer {self.secret_key}"}

    async def create_checkout_session(self, amount_inr: int, plan_name: str, success_url: str, cancel_url: str, metadata: dict) -> dict:
        """Amount is in INR rupees; converted to paise (smallest unit) for Stripe."""
        data = {
            "mode": "payment",
            "success_url": success_url,
            "cancel_url": cancel_url,
            "line_items[0][price_data][currency]": settings.stripe_price_currency,
            "line_items[0][price_data][product_data][name]": f"VoiceOps {plan_name} plan",
            "line_items[0][price_data][unit_amount]": str(int(amount_inr * 100)),
            "line_items[0][quantity]": "1",
        }
        for key, value in metadata.items():
            data[f"metadata[{key}]"] = str(value)
        async with httpx.AsyncClient(base_url=STRIPE_BASE, timeout=20) as client:
            response = await client.post("/checkout/sessions", data=data, headers=self._headers())
            response.raise_for_status()
            return response.json()

    def verify_webhook_signature(self, body: bytes, sig_header: str | None, tolerance: int = 300) -> bool:
        if not settings.stripe_webhook_secret or not sig_header:
            return False
        try:
            parts = dict(p.split("=", 1) for p in sig_header.split(","))
            timestamp, v1 = parts["t"], parts["v1"]
        except (KeyError, ValueError):
            return False
        if abs(time.time() - int(timestamp)) > tolerance:
            return False
        signed_payload = f"{timestamp}.{body.decode()}".encode()
        expected = hmac.new(settings.stripe_webhook_secret.encode(), signed_payload, hashlib.sha256).hexdigest()
        return hmac.compare_digest(expected, v1)
