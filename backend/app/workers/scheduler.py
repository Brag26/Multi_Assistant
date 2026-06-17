"""
workers/scheduler.py — Celery Beat periodic tasks.

Handles:
  - Scheduled campaign auto-launch
  - Cron-triggered workflow firing
  - Voicemail / retry queue processing
  - Daily analytics snapshot generation
  - Lead score refresh
"""
import asyncio
from datetime import UTC, datetime, timedelta

import structlog
from celery import shared_task
from celery.schedules import crontab
from sqlalchemy import select, update

from app.workers.celery_app import celery_app

log = structlog.get_logger()

# ── Beat schedule ─────────────────────────────────────────────────────────────

celery_app.conf.beat_schedule = {
    # Every minute: check for campaigns due to start
    "check-scheduled-campaigns": {
        "task": "app.workers.scheduler.check_scheduled_campaigns",
        "schedule": 60.0,
    },
    # Every minute: process voicemail retry queue
    "process-retry-queue": {
        "task": "app.workers.scheduler.process_retry_queue",
        "schedule": 60.0,
    },
    # Every 5 minutes: fire cron workflow triggers
    "fire-cron-workflows": {
        "task": "app.workers.scheduler.fire_cron_workflows",
        "schedule": 300.0,
    },
    # Daily at midnight: generate analytics snapshots
    "daily-analytics-snapshot": {
        "task": "app.workers.scheduler.generate_analytics_snapshots",
        "schedule": crontab(hour=0, minute=0),
    },
    # Every hour: refresh lead scores
    "refresh-lead-scores": {
        "task": "app.workers.scheduler.refresh_lead_scores",
        "schedule": crontab(minute=0),
    },
}

celery_app.conf.timezone = "UTC"


# ── Helpers ───────────────────────────────────────────────────────────────────

def get_sync_session():
    """Create a synchronous DB session for Celery tasks."""
    from sqlalchemy import create_engine
    from sqlalchemy.orm import Session
    from app.core.config import settings

    # Convert asyncpg URL to psycopg for sync tasks
    url = settings.database_url.replace("postgresql+asyncpg://", "postgresql+psycopg://")
    engine = create_engine(url, pool_pre_ping=True)
    return Session(engine)


# ── Campaign scheduler ────────────────────────────────────────────────────────

@celery_app.task(name="app.workers.scheduler.check_scheduled_campaigns")
def check_scheduled_campaigns():
    """Launch any campaigns whose scheduled_at has passed and status is scheduled."""
    from app.infrastructure.db.models import CampaignModel
    from app.domain.enums import CampaignStatus

    now = datetime.now(UTC)
    with get_sync_session() as session:
        result = session.execute(
            select(CampaignModel).where(
                CampaignModel.status == CampaignStatus.SCHEDULED,
                CampaignModel.scheduled_at <= now,
            )
        )
        campaigns = result.scalars().all()
        log.info("scheduler.campaigns.check", due=len(campaigns))

        for campaign in campaigns:
            log.info("scheduler.campaign.launching", campaign_id=campaign.id)
            campaign.status = CampaignStatus.RUNNING
            campaign.last_run_at = now
            session.commit()
            # Enqueue individual call tasks for each contact
            launch_campaign_calls.delay(str(campaign.id), str(campaign.tenant_id))

    return {"checked": len(campaigns)}


@celery_app.task(name="app.workers.scheduler.launch_campaign_calls")
def launch_campaign_calls(campaign_id: str, tenant_id: str):
    """For each contact in the campaign, check DNC and enqueue a call."""
    from app.infrastructure.db.models import CampaignModel, CampaignContactModel, ContactModel
    from app.domain.enums import CampaignStatus

    with get_sync_session() as session:
        campaign = session.get(CampaignModel, campaign_id)
        if not campaign:
            return {"error": "Campaign not found"}

        # Get campaign contacts
        result = session.execute(
            select(ContactModel)
            .join(CampaignContactModel, CampaignContactModel.contact_id == ContactModel.id)
            .where(CampaignContactModel.campaign_id == campaign_id)
        )
        contacts = result.scalars().all()

        # Get DNC list
        from app.infrastructure.db.models import DncListModel
        dnc_result = session.execute(
            select(DncListModel.phone).where(DncListModel.tenant_id == tenant_id)
        )
        dnc_phones = {row[0] for row in dnc_result.all()}

        queued = 0
        skipped = 0
        for contact in contacts:
            if contact.phone in dnc_phones:
                skipped += 1
                log.info("scheduler.call.dnc_skip", contact_id=contact.id, phone=contact.phone)
                continue

            make_scheduled_call.delay(
                tenant_id=tenant_id,
                campaign_id=campaign_id,
                contact_id=str(contact.id),
                phone=contact.phone,
                assistant_id=campaign.vapi_assistant_id,
            )
            queued += 1

        if queued == 0:
            campaign.status = CampaignStatus.COMPLETED
            session.commit()

        log.info("scheduler.campaign.calls_queued", campaign_id=campaign_id,
                 queued=queued, skipped=skipped)
        return {"queued": queued, "skipped_dnc": skipped}


@celery_app.task(
    name="app.workers.scheduler.make_scheduled_call",
    bind=True,
    max_retries=3,
    default_retry_delay=60,
)
def make_scheduled_call(
    self,
    tenant_id: str,
    campaign_id: str,
    contact_id: str,
    phone: str,
    assistant_id: str | None,
):
    """Place a single outbound call via Vapi."""
    import httpx
    from app.core.config import settings
    from app.infrastructure.db.models import CallModel
    from app.domain.enums import CallStatus

    if not assistant_id:
        log.warning("scheduler.call.no_assistant", campaign_id=campaign_id)
        return {"status": "skipped", "reason": "no_assistant_id"}

    with get_sync_session() as session:
        # Create call record
        call = CallModel(
            tenant_id=tenant_id,
            campaign_id=campaign_id,
            contact_id=contact_id,
            customer_phone=phone,
            assistant_id=assistant_id,
            status=CallStatus.QUEUED,
        )
        session.add(call)
        session.commit()

        try:
            res = httpx.post(
                f"{settings.vapi_base_url}/call/phone",
                headers={"Authorization": f"Bearer {settings.vapi_api_key}"},
                json={
                    "assistantId": assistant_id,
                    "customer": {"number": phone},
                    "metadata": {"call_id": str(call.id), "campaign_id": campaign_id},
                },
                timeout=15,
            )
            res.raise_for_status()
            data = res.json()
            call.provider_call_id = data.get("id")
            call.status = CallStatus.IN_PROGRESS
            call.started_at = datetime.now(UTC)
            session.commit()
            log.info("scheduler.call.started", call_id=str(call.id))
            return {"call_id": str(call.id), "provider_call_id": data.get("id")}
        except Exception as exc:
            call.status = CallStatus.FAILED
            session.commit()
            log.error("scheduler.call.failed", error=str(exc))
            raise self.retry(exc=exc)


# ── Cron workflow trigger ─────────────────────────────────────────────────────

@celery_app.task(name="app.workers.scheduler.fire_cron_workflows")
def fire_cron_workflows():
    """Find active workflows with cron triggers that are due and fire them."""
    from croniter import croniter
    from app.infrastructure.db.models import WorkflowModel
    from app.domain.enums import WorkflowStatus

    now = datetime.now(UTC)
    fired = 0

    with get_sync_session() as session:
        result = session.execute(
            select(WorkflowModel).where(
                WorkflowModel.status == WorkflowStatus.ACTIVE,
                WorkflowModel.trigger_type == "cron",
                WorkflowModel.cron_expression.isnot(None),
            )
        )
        workflows = result.scalars().all()

        for wf in workflows:
            try:
                cron = croniter(wf.cron_expression, now - timedelta(minutes=5))
                next_run = cron.get_next(datetime)
                if next_run <= now:
                    log.info("scheduler.cron.firing", workflow_id=wf.id)
                    fire_workflow_event.delay(
                        tenant_id=str(wf.tenant_id),
                        workflow_id=str(wf.id),
                        trigger_event="cron",
                        payload={"fired_at": now.isoformat()},
                    )
                    fired += 1
            except Exception as exc:
                log.error("scheduler.cron.error", workflow_id=wf.id, error=str(exc))

    return {"fired": fired}


@celery_app.task(name="app.workers.scheduler.fire_workflow_event")
def fire_workflow_event(tenant_id: str, workflow_id: str, trigger_event: str, payload: dict):
    """Run a single workflow asynchronously."""
    from app.infrastructure.db.models import WorkflowModel

    async def _run():
        from app.infrastructure.db.session import async_session_factory
        from app.application.engine import WorkflowExecutionEngine

        async with async_session_factory() as session:
            engine = WorkflowExecutionEngine(session)
            result = await session.execute(
                select(WorkflowModel).where(WorkflowModel.id == workflow_id)
            )
            wf = result.scalar_one_or_none()
            if not wf:
                return
            trigger_node = engine._find_trigger_node(wf, trigger_event)
            if trigger_node:
                await engine.run_workflow(tenant_id, wf, trigger_node, payload)

    asyncio.run(_run())


# ── Voicemail retry queue ─────────────────────────────────────────────────────

@celery_app.task(name="app.workers.scheduler.process_retry_queue")
def process_retry_queue():
    """Pick up calls due for retry and re-queue them."""
    from app.infrastructure.db.models import CallRetryQueueModel

    now = datetime.now(UTC)
    with get_sync_session() as session:
        result = session.execute(
            select(CallRetryQueueModel).where(
                CallRetryQueueModel.status == "pending",
                CallRetryQueueModel.retry_after <= now,
            ).limit(50)
        )
        items = result.scalars().all()
        log.info("scheduler.retry_queue.processing", count=len(items))

        for item in items:
            item.status = "processing"
            session.commit()

            make_scheduled_call.delay(
                tenant_id=str(item.tenant_id),
                campaign_id=str(item.campaign_id) if item.campaign_id else None,
                contact_id=str(item.contact_id) if item.contact_id else None,
                phone=item.phone,
                assistant_id=None,  # pulled from workflow in task
            )

            if item.attempt_number >= item.max_attempts:
                item.status = "exhausted"
            else:
                # Schedule next retry: exponential backoff
                delay_minutes = 60 * (2 ** item.attempt_number)
                next_retry = CallRetryQueueModel(
                    tenant_id=item.tenant_id,
                    contact_id=item.contact_id,
                    workflow_id=item.workflow_id,
                    campaign_id=item.campaign_id,
                    phone=item.phone,
                    attempt_number=item.attempt_number + 1,
                    max_attempts=item.max_attempts,
                    retry_after=now + timedelta(minutes=delay_minutes),
                )
                session.add(next_retry)
            session.commit()

    return {"processed": len(items)}


# ── Lead scoring ──────────────────────────────────────────────────────────────

@celery_app.task(name="app.workers.scheduler.refresh_lead_scores")
def refresh_lead_scores():
    """Recalculate lead scores for all contacts based on call history."""
    from app.infrastructure.db.models import ContactModel, CallModel, AppointmentModel
    from app.domain.enums import CallStatus, CallOutcome

    with get_sync_session() as session:
        contacts_result = session.execute(select(ContactModel))
        contacts = contacts_result.scalars().all()
        updated = 0

        for contact in contacts:
            score = _calculate_lead_score(session, contact)
            if score != contact.lead_score:
                contact.lead_score = score
                contact.score_updated_at = datetime.now(UTC)
                updated += 1

        session.commit()
        log.info("scheduler.lead_scores.refreshed", updated=updated)
        return {"updated": updated}


def _calculate_lead_score(session, contact) -> int:
    """
    Score 0–100 based on:
      - Lead status     (0–30 pts)
      - Call history    (0–30 pts)
      - Appointments    (0–20 pts)
      - Engagement      (0–20 pts)
    """
    from app.infrastructure.db.models import CallModel, AppointmentModel
    from app.domain.enums import CallOutcome, LeadStatus

    score = 0

    # Lead status score
    status_scores = {
        LeadStatus.NEW: 0,
        LeadStatus.CONTACTED: 10,
        LeadStatus.NURTURING: 15,
        LeadStatus.QUALIFIED: 25,
        LeadStatus.CONVERTED: 30,
        LeadStatus.LOST: 0,
    }
    score += status_scores.get(contact.lead_status, 0)

    # Call history
    calls_result = session.execute(
        select(CallModel).where(CallModel.contact_id == contact.id)
    )
    calls = calls_result.scalars().all()
    if calls:
        completed = [c for c in calls if c.outcome == CallOutcome.QUALIFIED]
        score += min(len(calls) * 3, 15)          # up to 15 for volume
        score += min(len(completed) * 5, 15)       # up to 15 for quality

    # Appointments booked
    appts_result = session.execute(
        select(AppointmentModel).where(AppointmentModel.contact_id == contact.id)
    )
    appts = appts_result.scalars().all()
    score += min(len(appts) * 10, 20)

    # Engagement (call duration)
    if calls:
        avg_duration = sum(c.duration_seconds or 0 for c in calls) / len(calls)
        if avg_duration > 120:
            score += 20
        elif avg_duration > 60:
            score += 10
        elif avg_duration > 30:
            score += 5

    return min(score, 100)


# ── Daily analytics snapshot ──────────────────────────────────────────────────

@celery_app.task(name="app.workers.scheduler.generate_analytics_snapshots")
def generate_analytics_snapshots():
    """Pre-aggregate daily analytics for each tenant."""
    from app.infrastructure.db.models import TenantModel, AnalyticsSnapshotModel

    today = datetime.now(UTC).date()

    with get_sync_session() as session:
        tenants_result = session.execute(select(TenantModel))
        tenants = tenants_result.scalars().all()

        for tenant in tenants:
            from app.infrastructure.repositories.monitoring import SqlAlchemyAnalyticsRepository
            # Build metrics synchronously
            metrics = _build_tenant_metrics_sync(session, str(tenant.id))

            # Upsert snapshot
            existing = session.execute(
                select(AnalyticsSnapshotModel).where(
                    AnalyticsSnapshotModel.tenant_id == str(tenant.id),
                    AnalyticsSnapshotModel.snapshot_date == datetime.combine(today, datetime.min.time()),
                )
            ).scalar_one_or_none()

            if existing:
                existing.metrics = metrics
            else:
                session.add(AnalyticsSnapshotModel(
                    tenant_id=str(tenant.id),
                    snapshot_date=datetime.combine(today, datetime.min.time()),
                    metrics=metrics,
                ))
            session.commit()

        log.info("scheduler.analytics.snapshots_generated", tenants=len(tenants))
        return {"tenants": len(tenants)}


def _build_tenant_metrics_sync(session, tenant_id: str) -> dict:
    from app.infrastructure.db.models import CallModel, ContactModel
    from sqlalchemy import func
    total = session.execute(
        select(func.count(CallModel.id)).where(CallModel.tenant_id == tenant_id)
    ).scalar() or 0
    contacts = session.execute(
        select(func.count(ContactModel.id)).where(ContactModel.tenant_id == tenant_id)
    ).scalar() or 0
    return {"total_calls": total, "total_contacts": contacts}
