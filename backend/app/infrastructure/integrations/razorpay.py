import hashlib
import hmac

import httpx

from app.core.config import settings

RAZORPAY_BASE = "https://api.razorpay.com/v1"


class RazorpayClient:
    def __init__(self, key_id: str | None = None, key_secret: str | None = None):
        self.key_id = key_id or settings.razorpay_key_id
        self.key_secret = key_secret or settings.razorpay_key_secret

    async def create_order(self, amount_inr: int, receipt: str, notes: dict) -> dict:
        """amount_inr is in whole rupees; Razorpay wants paise."""
        payload = {
            "amount": int(amount_inr * 100),
            "currency": "INR",
            "receipt": receipt,
            "notes": notes,
        }
        async with httpx.AsyncClient(base_url=RAZORPAY_BASE, timeout=20) as client:
            response = await client.post("/orders", json=payload, auth=(self.key_id, self.key_secret))
            response.raise_for_status()
            return response.json()

    def verify_payment_signature(self, order_id: str, payment_id: str, signature: str) -> bool:
        body = f"{order_id}|{payment_id}".encode()
        expected = hmac.new(self.key_secret.encode(), body, hashlib.sha256).hexdigest()
        return hmac.compare_digest(expected, signature)

    def verify_webhook_signature(self, body: bytes, signature: str | None) -> bool:
        if not settings.razorpay_webhook_secret or not signature:
            return False
        expected = hmac.new(settings.razorpay_webhook_secret.encode(), body, hashlib.sha256).hexdigest()
        return hmac.compare_digest(expected, signature)

    # GPay flows through Razorpay's standard checkout (method: "upi") —
    # no separate integration needed; the frontend checkout widget shows
    # GPay/UPI/cards automatically once an order is created above.
