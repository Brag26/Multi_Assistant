"""api/v1/scheduler_internal.py — the endpoint an external cron (Render Cron
Job or any HTTP-pinging scheduler) hits every ~60s to launch any campaign
whose scheduled_at has passed. No Celery/Redis dependency — dials directly
via the same background-task mechanism as the "Launch Now" button.
"""
from datetime import UTC, datetime

import structlog
from fastapi import APIRouter, BackgroundTasks, Depends, Header, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_db_session
from app.core.config import settings
from app.domain.enums import CampaignStatus
from app.infrastructure.db.models import CampaignModel

router = APIRouter(prefix="/internal", tags=["internal"])
log = structlog.get_logger()


@router.post("/scheduler-tick")
async def scheduler_tick(
    background_tasks: BackgroundTasks,
    session: AsyncSession = Depends(get_db_session),
    x_scheduler_secret: str | None = Header(default=None),
):
    """Called by an external scheduler, not a logged-in user — protected by
    a shared secret the same way /autopilot/run/{tenant_id} is. If
    SCHEDULER_CRON_SECRET isn't set, the check is skipped (open endpoint) so
    an already-configured external pinger that sends no header doesn't
    suddenly start getting 401s — set the env var when you get a chance to
    lock this down."""
    if settings.scheduler_cron_secret and x_scheduler_secret != settings.scheduler_cron_secret:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid or missing scheduler secret")

    from app.application.module_services import _dial_campaign_now

    now = datetime.now(UTC)
    result = await session.execute(
        select(CampaignModel).where(
            CampaignModel.status == CampaignStatus.SCHEDULED,
            CampaignModel.scheduled_at.isnot(None),
            CampaignModel.scheduled_at <= now,
        )
    )
    due_campaigns = result.scalars().all()

    for campaign in due_campaigns:
        campaign.status = CampaignStatus.RUNNING
        # scheduler-tick isn't tied to any particular logged-in user, so
        # there's no one to attribute minute-limit checks to — that's the
        # same as how this campaign would run if nobody were watching it.
        background_tasks.add_task(_dial_campaign_now, str(campaign.id), str(campaign.tenant_id), None)

    await session.commit()

    log.info("scheduler_tick.check", due=len(due_campaigns))
    return {"due": len(due_campaigns)}
