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

    def _headers(self) -> dict[str, str]:
        return {"Authorization": f"Bearer {self.api_key}"}
