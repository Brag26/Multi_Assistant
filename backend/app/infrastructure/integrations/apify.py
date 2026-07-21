"""infrastructure/integrations/apify.py — lightweight Apify REST client.

Used for triggering a lead-generation Actor/Task run and reading back the
scraped leads + usage (compute units, run count) for billing/quota display.
Docs: https://docs.apify.com/api/v2
"""
import httpx

APIFY_BASE = "https://api.apify.com/v2"


class ApifyClient:
    def __init__(self, api_token: str):
        self.api_token = api_token

    def _headers(self) -> dict[str, str]:
        return {"Authorization": f"Bearer {self.api_token}"}

    async def validate_token(self) -> dict:
        """Confirms the token works and returns basic account info."""
        async with httpx.AsyncClient(base_url=APIFY_BASE, timeout=20) as client:
            response = await client.get("/users/me", headers=self._headers())
            response.raise_for_status()
            return response.json().get("data", {})

    async def list_actors(self) -> list[dict]:
        async with httpx.AsyncClient(base_url=APIFY_BASE, timeout=20) as client:
            response = await client.get("/acts", headers=self._headers(), params={"limit": 50})
            response.raise_for_status()
            return response.json().get("data", {}).get("items", [])

    async def run_actor(self, actor_id: str, run_input: dict | None = None) -> dict:
        """Starts an Actor run (async — returns immediately with run info;
        poll get_run() for status)."""
        async with httpx.AsyncClient(base_url=APIFY_BASE, timeout=30) as client:
            response = await client.post(
                f"/acts/{actor_id}/runs", headers=self._headers(), json=run_input or {},
            )
            response.raise_for_status()
            return response.json().get("data", {})

    async def get_run(self, run_id: str) -> dict:
        async with httpx.AsyncClient(base_url=APIFY_BASE, timeout=20) as client:
            response = await client.get(f"/actor-runs/{run_id}", headers=self._headers())
            response.raise_for_status()
            return response.json().get("data", {})

    async def get_dataset_items(self, dataset_id: str, limit: int = 100) -> list[dict]:
        async with httpx.AsyncClient(base_url=APIFY_BASE, timeout=30) as client:
            response = await client.get(
                f"/datasets/{dataset_id}/items", headers=self._headers(),
                params={"limit": limit, "format": "json"},
            )
            response.raise_for_status()
            return response.json()

    async def list_runs(self, limit: int = 20) -> list[dict]:
        """Recent runs across the account — used to compute usage stats
        (compute units consumed, run count) for the usage dashboard."""
        async with httpx.AsyncClient(base_url=APIFY_BASE, timeout=20) as client:
            response = await client.get(
                "/actor-runs", headers=self._headers(),
                params={"limit": limit, "desc": "true"},
            )
            response.raise_for_status()
            return response.json().get("data", {}).get("items", [])
