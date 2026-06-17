"""infrastructure/integrations/calendar.py — Google/Outlook Calendar sync."""
import httpx
import structlog
from datetime import datetime, timedelta
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.infrastructure.db.models import CalendarConfigModel

log = structlog.get_logger()

GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"
GOOGLE_EVENTS_URL = "https://www.googleapis.com/calendar/v3/calendars/{calendar_id}/events"


class CalendarClient:
    def __init__(self, session: AsyncSession):
        self.session = session

    async def _get_config(self, tenant_id: str) -> CalendarConfigModel | None:
        result = await self.session.execute(
            select(CalendarConfigModel).where(
                CalendarConfigModel.tenant_id == tenant_id,
                CalendarConfigModel.enabled.is_(True),
            )
        )
        return result.scalar_one_or_none()

    async def _refresh_token_if_needed(self, config: CalendarConfigModel) -> str:
        """Refresh Google OAuth token if expired."""
        from app.core.config import settings
        now = datetime.utcnow()
        if config.token_expiry and config.token_expiry > now:
            return config.access_token

        async with httpx.AsyncClient() as client:
            res = await client.post(GOOGLE_TOKEN_URL, data={
                "grant_type": "refresh_token",
                "refresh_token": config.refresh_token,
                "client_id": getattr(settings, "google_client_id", ""),
                "client_secret": getattr(settings, "google_client_secret", ""),
            }, timeout=10)
            res.raise_for_status()
            data = res.json()
            config.access_token = data["access_token"]
            config.token_expiry = now + timedelta(seconds=data.get("expires_in", 3600))
            await self.session.commit()
            return config.access_token

    async def sync_appointment(self, tenant_id: str, appointment) -> str | None:
        """Create a calendar event for an appointment. Returns event ID or None."""
        config = await self._get_config(tenant_id)
        if not config:
            return None

        try:
            if config.provider == "google":
                return await self._create_google_event(config, appointment)
            else:
                log.warning("calendar.sync.unsupported_provider", provider=config.provider)
                return None
        except Exception as exc:
            log.error("calendar.sync.failed", tenant_id=tenant_id, error=str(exc))
            return None

    async def _create_google_event(self, config: CalendarConfigModel, appointment) -> str | None:
        token = await self._refresh_token_if_needed(config)
        calendar_id = config.calendar_id or "primary"
        start = appointment.scheduled_at
        end = start + timedelta(hours=1)

        event_body = {
            "summary": appointment.title,
            "description": appointment.description or "",
            "start": {"dateTime": start.isoformat(), "timeZone": "UTC"},
            "end": {"dateTime": end.isoformat(), "timeZone": "UTC"},
        }

        url = GOOGLE_EVENTS_URL.format(calendar_id=calendar_id)
        async with httpx.AsyncClient() as client:
            res = await client.post(
                url,
                headers={"Authorization": f"Bearer {token}"},
                json=event_body,
                timeout=10,
            )
            res.raise_for_status()
            data = res.json()
            log.info("calendar.event.created", event_id=data.get("id"))
            return data.get("id")

    async def get_oauth_url(self, tenant_id: str, redirect_uri: str) -> str:
        """Generate Google OAuth URL for connecting calendar."""
        from app.core.config import settings
        client_id = getattr(settings, "google_client_id", "")
        scope = "https://www.googleapis.com/auth/calendar.events"
        return (
            f"https://accounts.google.com/o/oauth2/v2/auth"
            f"?client_id={client_id}"
            f"&redirect_uri={redirect_uri}"
            f"&response_type=code"
            f"&scope={scope}"
            f"&state={tenant_id}"
            f"&access_type=offline&prompt=consent"
        )

    async def handle_oauth_callback(self, tenant_id: str, code: str, redirect_uri: str):
        """Exchange OAuth code for tokens and save config."""
        from app.core.config import settings
        async with httpx.AsyncClient() as client:
            res = await client.post(GOOGLE_TOKEN_URL, data={
                "grant_type": "authorization_code",
                "code": code,
                "redirect_uri": redirect_uri,
                "client_id": getattr(settings, "google_client_id", ""),
                "client_secret": getattr(settings, "google_client_secret", ""),
            }, timeout=10)
            res.raise_for_status()
            data = res.json()

        from datetime import datetime, timedelta
        expiry = datetime.utcnow() + timedelta(seconds=data.get("expires_in", 3600))

        # Upsert config
        config = await self._get_config(tenant_id)
        if not config:
            config = CalendarConfigModel(
                tenant_id=tenant_id,
                provider="google",
            )
            self.session.add(config)

        config.access_token = data["access_token"]
        config.refresh_token = data.get("refresh_token", config.refresh_token)
        config.token_expiry = expiry
        config.enabled = True
        await self.session.commit()
        return config
