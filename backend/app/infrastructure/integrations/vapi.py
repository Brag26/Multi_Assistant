import httpx
from app.core.config import settings


class VapiCallError(Exception):
    """Vapi rejected a call request — carries the real reason from Vapi's
    response body instead of just a bare HTTP status code."""
    def __init__(self, status_code: int, message: str):
        self.status_code = status_code
        self.message = message
        super().__init__(f"Vapi {status_code}: {message}")


class VapiClient:
    def __init__(self, api_key: str | None = None):
        self.api_key = api_key or settings.vapi_api_key

    async def start_call(self, phone_number: str, assistant_id: str, metadata: dict, from_phone_number_id: str | None = None) -> str:
        payload = {"assistantId": assistant_id, "customer": {"number": phone_number}, "metadata": metadata}
        if from_phone_number_id:
            payload["phoneNumberId"] = from_phone_number_id
        async with httpx.AsyncClient(base_url=settings.vapi_base_url, timeout=20) as client:
            response = await client.post("/call", json=payload, headers=self._headers())
            if response.status_code >= 400:
                # raise_for_status() alone only gives the status code, not
                # Vapi's actual reason (e.g. "assistant not found", "invalid
                # phone number", "insufficient credits") — that message is
                # what shows up in Test Call and in campaign dial-failure
                # logs, so surface it instead of a bare "400 Bad Request".
                try:
                    detail = response.json().get("message") or response.text
                except Exception:
                    detail = response.text
                raise VapiCallError(response.status_code, detail if isinstance(detail, str) else str(detail))
            return response.json()["id"]

    async def fetch_assistants(self) -> list[dict]:
        async with httpx.AsyncClient(base_url=settings.vapi_base_url, timeout=20) as client:
            response = await client.get("/assistant", headers=self._headers())
            response.raise_for_status()
            data = response.json()
            return data if isinstance(data, list) else data.get("data", [])

    async def fetch_phone_numbers(self) -> list[dict]:
        """Numbers bought/imported directly inside Vapi (as opposed to a
        separate Twilio/Exotel/etc. connection) — lets a tenant that connects
        straight to Vapi sync its numbers the same way it syncs assistants."""
        async with httpx.AsyncClient(base_url=settings.vapi_base_url, timeout=20) as client:
            response = await client.get("/phone-number", headers=self._headers())
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

    async def send_chat(self, assistant_id: str, message: str, previous_chat_id: str | None = None) -> dict:
        """Vapi's text Chat API — same assistant config as voice calls, but a
        plain text back-and-forth instead of a phone call. Pass the previous
        response's `id` as previous_chat_id to keep conversation context."""
        payload: dict = {"assistantId": assistant_id, "input": message}
        if previous_chat_id:
            payload["previousChatId"] = previous_chat_id
        async with httpx.AsyncClient(base_url=settings.vapi_base_url, timeout=30) as client:
            response = await client.post("/chat", json=payload, headers=self._headers())
            if response.status_code >= 400:
                # Surface Vapi's actual error body instead of a generic
                # "didn't respond" message — this is what tells us whether
                # it's a bad assistant ID, an auth problem, or something else.
                raise RuntimeError(f"Vapi chat API returned {response.status_code}: {response.text}")
            return response.json()

    async def create_assistant(self, config: dict) -> dict:
        """Creates a new Vapi assistant from a full assistant config dict
        (name, model, voice, tools, firstMessage, etc.). Returns the created
        assistant's full record, including its id."""
        async with httpx.AsyncClient(base_url=settings.vapi_base_url, timeout=30) as client:
            response = await client.post("/assistant", json=config, headers=self._headers())
            if response.status_code >= 400:
                raise RuntimeError(f"Vapi create-assistant returned {response.status_code}: {response.text}")
            return response.json()

    async def update_assistant(self, assistant_id: str, config: dict) -> dict:
        """Patches an existing assistant — used to re-sync the copilot's
        config (tools, prompt) without creating a duplicate assistant every
        time setup is re-run."""
        async with httpx.AsyncClient(base_url=settings.vapi_base_url, timeout=30) as client:
            response = await client.patch(f"/assistant/{assistant_id}", json=config, headers=self._headers())
            if response.status_code >= 400:
                raise RuntimeError(f"Vapi update-assistant returned {response.status_code}: {response.text}")
            return response.json()

    def _headers(self) -> dict[str, str]:
        return {"Authorization": f"Bearer {self.api_key}"}
