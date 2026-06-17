import httpx

class MakeClient:
    async def trigger_workflow(self, webhook_url: str, payload: dict) -> None:
        async with httpx.AsyncClient(timeout=15) as client:
            response = await client.post(webhook_url, json=payload)
            response.raise_for_status()
