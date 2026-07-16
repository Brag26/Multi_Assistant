import httpx
from app.core.config import settings

class VapiClient:
    def __init__(self, api_key: str | None = None):
        self.api_key = api_key or settings.vapi_api_key

    async def start_call(self, phone_number: str, assistant_id: str, metadata: dict) -> str:
        payload = {"assistantId": assistant_id, "customer": {"number": phone_number}, "metadata": metadata}
        async with httpx.AsyncClient(base_url=settings.vapi_base_url, timeout=20) as client:
            response = await client.post("/call", json=payload, headers=self._headers())
            response.raise_for_status()
            return response.json()["id"]

    async def fetch_assistants(self) -> list[dict]:
        async with httpx.AsyncClient(base_url=settings.vapi_base_url, timeout=20) as client:
            response = await client.get("/assistant", headers=self._headers())
            response.raise_for_status()
            data = response.json()
            return data if isinstance(data, list) else data.get("data", [])

    async def get_recording_url(self, provider_call_id: str, kind: str = "mono-recording") -> str | None:
        """As of July 2026, Vapi requires an authenticated request to download
        recordings — the recordingUrl from webhooks/GET /call no longer works
        directly. This hits the new authenticated endpoint, which 302-redirects
        to a short-lived signed URL; we return that signed URL without
        following the redirect (so we don't download the whole audio file
        through our own server). kind: mono-recording | stereo-recording |
        customer-recording | assistant-recording | video-recording."""
        async with httpx.AsyncClient(base_url=settings.vapi_base_url, timeout=20, follow_redirects=False) as client:
            response = await client.get(f"/call/{provider_call_id}/{kind}", headers=self._headers())
            if response.status_code in (301, 302, 303, 307, 308):
                return response.headers.get("location")
            if response.status_code == 404:
                return None
            response.raise_for_status()
            return None

    def _headers(self) -> dict[str, str]:
        return {"Authorization": f"Bearer {self.api_key}"}
