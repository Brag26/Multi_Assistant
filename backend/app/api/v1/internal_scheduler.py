"""api/v1/internal_scheduler.py — free-tier alternative to Celery Beat.

Render's free plan doesn't support Background Workers, Key Value (Redis),
or Shell access, so app.workers.scheduler's Celery-based
check_scheduled_campaigns task can never actually run there — there's
nothing to trigger it and nothing to execute it.

This endpoint does the same job (find campaigns whose scheduled_at has
passed and launch them) using the app's normal async DB session and the
same Celery-free dialing path _dial_campaign_now already uses for the
"Start Now" button — no broker, no separate worker process required.

Trigger it with any free external cron service (e.g. cron-job.org,
EasyCron, or a scheduled GitHub Actions workflow) hitting this URL once a
minute:

    POST https://<your-render-backend>/api/v1/internal/scheduler-tick
    Header: X-Scheduler-Secret: <INTERNAL_SCHEDULER_SECRET>

As a bonus, pinging this endpoint every 1-5 minutes also prevents Render's
free web service from spinning down due to inactivity.
"""
from datetime import UTC, datetime

import structlog
from fastapi import APIRouter, Header, HTTPException, status
from sqlalchemy import select

from app.api.deps import SessionDep
from app.core.config import settings
from app.domain.enums import CampaignStatus
from app.infrastructure.db.models import CampaignModel

log = structlog.get_logger()
router = APIRouter(prefix="/internal", tags=["internal"])


@router.post("/scheduler-tick")
async def scheduler_tick(session: SessionDep, x_scheduler_secret: str | None = Header(default=None)):
    if not settings.internal_scheduler_secret:
        raise HTTPException(
            status.HTTP_503_SERVICE_UNAVAILABLE,
            "INTERNAL_SCHEDULER_SECRET is not configured — set it in your environment before wiring up an external cron trigger.",
        )
    if x_scheduler_secret != settings.internal_scheduler_secret:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid scheduler secret")

    from app.application.module_services import _dial_campaign_now

    now = datetime.now(UTC)
    result = await session.execute(
        select(CampaignModel).where(
            CampaignModel.status == CampaignStatus.SCHEDULED,
            CampaignModel.scheduled_at <= now,
        )
    )
    due_campaigns = result.scalars().all()
    log.info("scheduler_tick.check", due=len(due_campaigns))

    launched = []
    for campaign in due_campaigns:
        campaign.status = CampaignStatus.RUNNING
        launched.append({"campaign_id": campaign.id, "tenant_id": campaign.tenant_id})
    await session.commit()

    # Dial each due campaign's contacts after committing the status flip,
    # so a slow dial-out for one campaign can't hold the transaction open
    # and block the others from being marked running.
    for item in launched:
        try:
            await _dial_campaign_now(str(item["campaign_id"]), item["tenant_id"], None)
        except Exception as exc:
            log.error("scheduler_tick.dial_failed", campaign_id=item["campaign_id"], error=str(exc))

    return {"checked": len(due_campaigns), "launched": [c["campaign_id"] for c in launched]}
