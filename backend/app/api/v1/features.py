"""
api/v1/features.py — New feature endpoints:
  DNC list, lead scoring, campaign reports,
  CSV import, Slack config, Calendar config, Zapier webhooks
"""
import csv
import io
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Body, Depends, File, HTTPException, Query, UploadFile, status
from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_db_session
from app.core.security import CurrentUser
from app.infrastructure.db.models import ContactModel
from app.infrastructure.db.new_models import (
    CampaignReportModel,
    CallRetryQueueModel,
    CalendarConfigModel,
    DncListModel,
    SlackConfigModel,
)
from app.infrastructure.repositories.contacts import SqlAlchemyContactRepository, duplicate_key
from app.application.schemas import ContactCreate

# ── DNC List ──────────────────────────────────────────────────────────────────

dnc_router = APIRouter(prefix="/tenants/{tenant_id}/dnc", tags=["dnc"])


@dnc_router.get("")
async def list_dnc(
    tenant_id: str,
    user: CurrentUser,
    session: AsyncSession = Depends(get_db_session),
):
    result = await session.execute(
        select(DncListModel)
        .where(DncListModel.tenant_id == tenant_id)
        .order_by(DncListModel.created_at.desc())
    )
    return [
        {"id": r.id, "phone": r.phone, "reason": r.reason, "created_at": r.created_at}
        for r in result.scalars().all()
    ]


@dnc_router.post("", status_code=201)
async def add_to_dnc(
    tenant_id: str,
    user: CurrentUser,
    payload: dict = Body(...),
    session: AsyncSession = Depends(get_db_session),
):
    phone = payload.get("phone")
    if not phone:
        raise HTTPException(status_code=400, detail="phone required")
    entry = DncListModel(
        tenant_id=tenant_id,
        phone=phone,
        reason=payload.get("reason"),
        added_by=str(user.sub),
    )
    session.add(entry)
    await session.commit()
    await session.refresh(entry)
    return {"id": entry.id, "phone": entry.phone}


@dnc_router.delete("/{phone}")
async def remove_from_dnc(
    tenant_id: str,
    phone: str,
    user: CurrentUser,
    session: AsyncSession = Depends(get_db_session),
):
    await session.execute(
        delete(DncListModel).where(
            DncListModel.tenant_id == tenant_id,
            DncListModel.phone == phone,
        )
    )
    await session.commit()
    return {"removed": phone}


@dnc_router.get("/check/{phone}")
async def check_dnc(
    tenant_id: str,
    phone: str,
    user: CurrentUser,
    session: AsyncSession = Depends(get_db_session),
):
    result = await session.execute(
        select(DncListModel).where(
            DncListModel.tenant_id == tenant_id,
            DncListModel.phone == phone,
        )
    )
    entry = result.scalar_one_or_none()
    return {"phone": phone, "blocked": entry is not None}


# ── Lead Scoring ──────────────────────────────────────────────────────────────

scoring_router = APIRouter(prefix="/tenants/{tenant_id}/leads", tags=["lead-scoring"])


@scoring_router.get("/scores")
async def list_lead_scores(
    tenant_id: str,
    user: CurrentUser,
    min_score: int = Query(0),
    limit: int = Query(50, le=200),
    session: AsyncSession = Depends(get_db_session),
):
    result = await session.execute(
        select(ContactModel)
        .where(
            ContactModel.tenant_id == tenant_id,
            ContactModel.lead_score >= min_score,
        )
        .order_by(ContactModel.lead_score.desc())
        .limit(limit)
    )
    contacts = result.scalars().all()
    return [
        {
            "id": c.id,
            "name": f"{c.first_name or ''} {c.last_name or ''}".strip() or c.phone,
            "phone": c.phone,
            "lead_status": c.lead_status,
            "lead_score": c.lead_score,
            "score_updated_at": c.score_updated_at,
        }
        for c in contacts
    ]


@scoring_router.post("/{contact_id}/rescore")
async def rescore_contact(
    tenant_id: str,
    contact_id: UUID,
    user: CurrentUser,
    session: AsyncSession = Depends(get_db_session),
):
    from app.workers.scheduler import _calculate_lead_score
    result = await session.execute(
        select(ContactModel).where(
            ContactModel.tenant_id == tenant_id,
            ContactModel.id == str(contact_id),
        )
    )
    contact = result.scalar_one_or_none()
    if not contact:
        raise HTTPException(status_code=404, detail="Contact not found")

    # Run sync scoring in thread
    import asyncio
    score = await asyncio.get_event_loop().run_in_executor(
        None, lambda: _calculate_lead_score(session.sync_session, contact)
    )
    contact.lead_score = score
    from datetime import datetime, UTC
    contact.score_updated_at = datetime.now(UTC)
    await session.commit()
    return {"contact_id": str(contact_id), "lead_score": score}


# ── CSV Import ────────────────────────────────────────────────────────────────

import_router = APIRouter(prefix="/tenants/{tenant_id}/contacts", tags=["contacts"])


@import_router.post("/import/csv", status_code=201)
async def import_contacts_csv(
    tenant_id: str,
    user: CurrentUser,
    file: UploadFile = File(...),
    session: AsyncSession = Depends(get_db_session),
):
    """
    Upload a CSV with headers: first_name,last_name,phone,email,company,source
    Returns created count, duplicate count, and any row errors.
    """
    if not file.filename.endswith(".csv"):
        raise HTTPException(status_code=400, detail="Only CSV files are accepted")

    contents = await file.read()
    text = contents.decode("utf-8-sig")
    reader = csv.DictReader(io.StringIO(text))

    repo = SqlAlchemyContactRepository(session)
    created = 0
    duplicates = 0
    errors = []

    for i, row in enumerate(reader, start=2):
        phone = (row.get("phone") or "").strip()
        if not phone:
            errors.append(f"Row {i}: missing phone")
            continue
        try:
            contact_data = ContactCreate(
                first_name=(row.get("first_name") or "").strip() or None,
                last_name=(row.get("last_name") or "").strip() or None,
                phone=phone,
                email=(row.get("email") or "").strip() or None,
                company=(row.get("company") or "").strip() or None,
                source=(row.get("source") or "csv_import").strip(),
                custom_fields={},
            )
            await repo.create(tenant_id, contact_data)
            created += 1
        except ValueError:
            duplicates += 1
        except Exception as exc:
            errors.append(f"Row {i}: {str(exc)}")

    return {"created": created, "duplicates": duplicates, "errors": errors}


# ── Campaign Reports ──────────────────────────────────────────────────────────

reports_router = APIRouter(prefix="/tenants/{tenant_id}/campaigns", tags=["reports"])


@reports_router.get("/{campaign_id}/report")
async def get_campaign_report(
    tenant_id: str,
    campaign_id: UUID,
    user: CurrentUser,
    session: AsyncSession = Depends(get_db_session),
):
    from app.infrastructure.db.models import CallModel
    from app.domain.enums import CallStatus, CallOutcome

    # Latest saved report
    saved = await session.execute(
        select(CampaignReportModel)
        .where(CampaignReportModel.campaign_id == str(campaign_id))
        .order_by(CampaignReportModel.generated_at.desc())
        .limit(1)
    )
    report = saved.scalar_one_or_none()

    # Live calculation
    calls_q = await session.execute(
        select(CallModel).where(
            CallModel.tenant_id == tenant_id,
            CallModel.campaign_id == str(campaign_id),
        )
    )
    calls = calls_q.scalars().all()
    total = len(calls)
    connected = sum(1 for c in calls if c.status == CallStatus.COMPLETED)
    qualified = sum(1 for c in calls if c.outcome == CallOutcome.QUALIFIED)
    avg_dur = int(sum(c.duration_seconds or 0 for c in calls) / total) if total else 0

    outcomes: dict = {}
    for c in calls:
        outcomes[c.outcome] = outcomes.get(c.outcome, 0) + 1

    return {
        "campaign_id": str(campaign_id),
        "total_calls": total,
        "connected_calls": connected,
        "connection_rate": round(connected / total, 4) if total else 0,
        "qualified_leads": qualified,
        "avg_duration_seconds": avg_dur,
        "outcomes_breakdown": outcomes,
        "last_saved_report": report.generated_at if report else None,
    }


@reports_router.get("/{campaign_id}/export/csv")
async def export_campaign_csv(
    tenant_id: str,
    campaign_id: UUID,
    user: CurrentUser,
    session: AsyncSession = Depends(get_db_session),
):
    from fastapi.responses import StreamingResponse
    from app.infrastructure.db.models import CallModel

    calls_q = await session.execute(
        select(CallModel).where(
            CallModel.tenant_id == tenant_id,
            CallModel.campaign_id == str(campaign_id),
        )
    )
    calls = calls_q.scalars().all()

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["id", "phone", "status", "outcome", "duration_seconds",
                     "started_at", "ended_at", "summary"])
    for c in calls:
        writer.writerow([c.id, c.customer_phone, c.status, c.outcome,
                         c.duration_seconds, c.started_at, c.ended_at, c.summary])
    output.seek(0)

    return StreamingResponse(
        io.BytesIO(output.getvalue().encode()),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename=campaign_{campaign_id}.csv"},
    )


# ── Slack Config ──────────────────────────────────────────────────────────────

slack_router = APIRouter(prefix="/tenants/{tenant_id}/integrations/slack", tags=["slack"])


@slack_router.get("")
async def get_slack_config(
    tenant_id: str,
    user: CurrentUser,
    session: AsyncSession = Depends(get_db_session),
):
    result = await session.execute(
        select(SlackConfigModel).where(SlackConfigModel.tenant_id == tenant_id)
    )
    config = result.scalar_one_or_none()
    if not config:
        return {"connected": False}
    return {
        "connected": True,
        "channel": config.channel,
        "events": config.events,
        "enabled": config.enabled,
    }


@slack_router.post("", status_code=201)
async def configure_slack(
    tenant_id: str,
    user: CurrentUser,
    payload: dict = Body(...),
    session: AsyncSession = Depends(get_db_session),
):
    webhook_url = payload.get("webhook_url")
    if not webhook_url:
        raise HTTPException(status_code=400, detail="webhook_url required")

    result = await session.execute(
        select(SlackConfigModel).where(SlackConfigModel.tenant_id == tenant_id)
    )
    config = result.scalar_one_or_none()
    if not config:
        config = SlackConfigModel(tenant_id=tenant_id, webhook_url=webhook_url)
        session.add(config)
    else:
        config.webhook_url = webhook_url

    config.channel = payload.get("channel")
    config.events = payload.get("events", ["call_completed", "lead_qualified", "appointment_booked"])
    config.enabled = payload.get("enabled", True)
    await session.commit()
    return {"connected": True, "channel": config.channel}


@slack_router.post("/test")
async def test_slack(
    tenant_id: str,
    user: CurrentUser,
    session: AsyncSession = Depends(get_db_session),
):
    from app.infrastructure.integrations.slack import SlackClient
    client = SlackClient(session)
    sent = await client.notify(tenant_id, "call_completed", {
        "phone": "+15550001234", "outcome": "qualified", "duration": 92
    })
    return {"sent": sent}


@slack_router.delete("")
async def disconnect_slack(
    tenant_id: str,
    user: CurrentUser,
    session: AsyncSession = Depends(get_db_session),
):
    await session.execute(
        delete(SlackConfigModel).where(SlackConfigModel.tenant_id == tenant_id)
    )
    await session.commit()
    return {"connected": False}


# ── Calendar Config ───────────────────────────────────────────────────────────

calendar_router = APIRouter(prefix="/tenants/{tenant_id}/integrations/calendar", tags=["calendar"])


@calendar_router.get("/oauth/url")
async def get_calendar_oauth_url(
    tenant_id: str,
    user: CurrentUser,
    redirect_uri: str = Query(...),
    session: AsyncSession = Depends(get_db_session),
):
    from app.infrastructure.integrations.calendar import CalendarClient
    client = CalendarClient(session)
    url = await client.get_oauth_url(tenant_id, redirect_uri)
    return {"url": url}


@calendar_router.get("/oauth/callback")
async def calendar_oauth_callback(
    tenant_id: str,
    code: str = Query(...),
    redirect_uri: str = Query(...),
    session: AsyncSession = Depends(get_db_session),
):
    from app.infrastructure.integrations.calendar import CalendarClient
    client = CalendarClient(session)
    config = await client.handle_oauth_callback(tenant_id, code, redirect_uri)
    return {"connected": True, "provider": config.provider}


@calendar_router.get("")
async def get_calendar_config(
    tenant_id: str,
    user: CurrentUser,
    session: AsyncSession = Depends(get_db_session),
):
    result = await session.execute(
        select(CalendarConfigModel).where(CalendarConfigModel.tenant_id == tenant_id)
    )
    config = result.scalar_one_or_none()
    if not config:
        return {"connected": False}
    return {
        "connected": True,
        "provider": config.provider,
        "calendar_id": config.calendar_id,
        "enabled": config.enabled,
    }


@calendar_router.delete("")
async def disconnect_calendar(
    tenant_id: str,
    user: CurrentUser,
    session: AsyncSession = Depends(get_db_session),
):
    await session.execute(
        delete(CalendarConfigModel).where(CalendarConfigModel.tenant_id == tenant_id)
    )
    await session.commit()
    return {"connected": False}


# ── Retry Queue ───────────────────────────────────────────────────────────────

retry_router = APIRouter(prefix="/tenants/{tenant_id}/retry-queue", tags=["retry-queue"])


@retry_router.get("")
async def list_retry_queue(
    tenant_id: str,
    user: CurrentUser,
    session: AsyncSession = Depends(get_db_session),
):
    result = await session.execute(
        select(CallRetryQueueModel)
        .where(
            CallRetryQueueModel.tenant_id == tenant_id,
            CallRetryQueueModel.status == "pending",
        )
        .order_by(CallRetryQueueModel.retry_after.asc())
        .limit(100)
    )
    items = result.scalars().all()
    return [
        {
            "id": i.id,
            "phone": i.phone,
            "attempt": i.attempt_number,
            "max_attempts": i.max_attempts,
            "retry_after": i.retry_after,
            "status": i.status,
        }
        for i in items
    ]


@retry_router.post("/{item_id}/cancel")
async def cancel_retry(
    tenant_id: str,
    item_id: UUID,
    user: CurrentUser,
    session: AsyncSession = Depends(get_db_session),
):
    result = await session.execute(
        select(CallRetryQueueModel).where(
            CallRetryQueueModel.tenant_id == tenant_id,
            CallRetryQueueModel.id == str(item_id),
        )
    )
    item = result.scalar_one_or_none()
    if not item:
        raise HTTPException(status_code=404)
    item.status = "exhausted"
    await session.commit()
    return {"cancelled": str(item_id)}
