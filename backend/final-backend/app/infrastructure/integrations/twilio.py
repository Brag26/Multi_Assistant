from hmac import compare_digest
from hashlib import sha256
import hmac

import httpx

from app.core.config import settings

class TwilioClient:
    def __init__(self, account_sid: str | None = None, auth_token: str | None = None):
        self.account_sid = account_sid or settings.twilio_account_sid
        self.auth_token = auth_token or settings.twilio_auth_token

    async def fetch_phone_numbers(self) -> list[dict]:
        url = f"https://api.twilio.com/2010-04-01/Accounts/{self.account_sid}/IncomingPhoneNumbers.json"
        async with httpx.AsyncClient(timeout=20) as client:
            response = await client.get(url, auth=(self.account_sid, self.auth_token))
            response.raise_for_status()
            return response.json().get("incoming_phone_numbers", [])

class TwilioWebhookVerifier:
    def verify(self, body: bytes, signature: str | None) -> bool:
        if not settings.twilio_webhook_secret:
            return False
        expected = hmac.new(settings.twilio_webhook_secret.encode(), body, sha256).hexdigest()
        return bool(signature) and compare_digest(expected, signature)
