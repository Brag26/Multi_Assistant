"""
api/v1/monitoring.py — Call monitoring, lead tracking, appointment tracking,
                        notification center, analytics dashboard, audit logs.
"""
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Query

from app.api.deps import get_db_session
from app.application.schemas import (
    AnalyticsRead,
    AppointmentCreate,
    AppointmentRead,
    AppointmentUpdate,
    AuditLogRead,
    CallMonitoringEventCreate,
    CallMonitoringEventRead,
    CallRead,
    LeadActivityCreate,
    LeadActivityRead,
    NotificationCreate,
    NotificationMarkRead,
    NotificationRead,
    RealTimeDashboardRead,
)
from app.core.security import CurrentUser
from app.infrastructure.db.session import AsyncSession
from app.infrastructure.repositories.monitoring import (
    SqlAlchemyAnalyticsRepository,
    SqlAlchemyCallMonitoringRepository,
    SqlAlchemyLeadActivityRepository,
)
from app.infrastructure.repositories.notifications import SqlAlchemyNotificationRepository
from app.infrastructure.repositories.appointments import SqlAlchemyAppointmentRepository
from app.infrastructure.repositories.calls import SqlAlchemyCallRepository

# ── Call Monitoring ──────────────────────────────────────────────────────────

monitoring_router = APIRouter(
    prefix="/tenants/{tenant_id}/calls", tags=["call-monitoring"]
)


@monitoring_router.get("", response_model=list[CallRead])
async def list_calls(
    tenant_id: str,
    user: CurrentUser,
    status: str | None = Query(None),
    session: AsyncSession = Depends(get_db_session),
):
    repo = SqlAlchemyCallRepository(session)
    return await repo.list_for_tenant(tenant_id, status_filter=status)


@monitoring_router.get("/active", response_model=list[CallRead])
async def list_active_calls(
    tenant_id: str,
    user: CurrentUser,
    session: AsyncSession = Depends(get_db_session),
):
    repo = SqlAlchemyCallMonitoringRepository(session)
    return await repo.list_active_calls(tenant_id)


@monitoring_router.post("/{call_id}/events", response_model=CallMonitoringEventRead, status_code=201)
async def add_monitoring_event(
    tenant_id: str,
    call_id: UUID,
    payload: CallMonitoringEventCreate,
    user: CurrentUser,
    session: AsyncSession = Depends(get_db_session),
):
    repo = SqlAlchemyCallMonitoringRepository(session)
    return await repo.add_event(
        tenant_id=tenant_id,
        call_id=str(call_id),
        event_type=payload.event_type,
        event_data=payload.event_data,
    )


@monitoring_router.get("/{call_id}/events", response_model=list[CallMonitoringEventRead])
async def list_monitoring_events(
    tenant_id: str,
    call_id: UUID,
    user: CurrentUser,
    limit: int = Query(200, le=500),
    session: AsyncSession = Depends(get_db_session),
):
    repo = SqlAlchemyCallMonitoringRepository(session)
    return await repo.list_for_call(tenant_id, call_id, limit)


# ── Lead Activity Feed ────────────────────────────────────────────────────────

leads_router = APIRouter(
    prefix="/tenants/{tenant_id}/leads", tags=["lead-tracking"]
)


@leads_router.get("/activities", response_model=list[LeadActivityRead])
async def list_recent_activities(
    tenant_id: str,
    user: CurrentUser,
    limit: int = Query(50, le=200),
    session: AsyncSession = Depends(get_db_session),
):
    repo = SqlAlchemyLeadActivityRepository(session)
    return await repo.list_recent(tenant_id, limit)


@leads_router.get("/{contact_id}/activities", response_model=list[LeadActivityRead])
async def list_contact_activities(
    tenant_id: str,
    contact_id: UUID,
    user: CurrentUser,
    limit: int = Query(100, le=500),
    session: AsyncSession = Depends(get_db_session),
):
    repo = SqlAlchemyLeadActivityRepository(session)
    return await repo.list_for_contact(tenant_id, contact_id, limit)


@leads_router.post("/activities", response_model=LeadActivityRead, status_code=201)
async def create_activity(
    tenant_id: str,
    payload: LeadActivityCreate,
    user: CurrentUser,
    session: AsyncSession = Depends(get_db_session),
):
    repo = SqlAlchemyLeadActivityRepository(session)
    return await repo.create(
        tenant_id=tenant_id,
        contact_id=str(payload.contact_id),
        activity_type=payload.activity_type,
        summary=payload.summary,
        metadata=payload.metadata,
    )


# ── Appointment Tracking ──────────────────────────────────────────────────────

appointments_router = APIRouter(
    prefix="/tenants/{tenant_id}/appointments", tags=["appointments"]
)


@appointments_router.get("", response_model=list[AppointmentRead])
async def list_appointments(
    tenant_id: str,
    user: CurrentUser,
    status: str | None = Query(None),
    session: AsyncSession = Depends(get_db_session),
):
    repo = SqlAlchemyAppointmentRepository(session)
    return await repo.list_for_tenant(tenant_id, status_filter=status)


@appointments_router.post("", response_model=AppointmentRead, status_code=201)
async def create_appointment(
    tenant_id: str,
    payload: AppointmentCreate,
    user: CurrentUser,
    session: AsyncSession = Depends(get_db_session),
):
    repo = SqlAlchemyAppointmentRepository(session)
    return await repo.create(tenant_id, payload)


@appointments_router.get("/{appointment_id}", response_model=AppointmentRead)
async def get_appointment(
    tenant_id: str,
    appointment_id: UUID,
    user: CurrentUser,
    session: AsyncSession = Depends(get_db_session),
):
    repo = SqlAlchemyAppointmentRepository(session)
    return await repo.get_for_tenant(tenant_id, appointment_id)


@appointments_router.patch("/{appointment_id}", response_model=AppointmentRead)
async def update_appointment(
    tenant_id: str,
    appointment_id: UUID,
    payload: AppointmentUpdate,
    user: CurrentUser,
    session: AsyncSession = Depends(get_db_session),
):
    repo = SqlAlchemyAppointmentRepository(session)
    return await repo.update(tenant_id, appointment_id, payload.model_dump(exclude_none=True))


@appointments_router.delete("/{appointment_id}", status_code=204)
async def delete_appointment(
    tenant_id: str,
    appointment_id: UUID,
    user: CurrentUser,
    session: AsyncSession = Depends(get_db_session),
):
    repo = SqlAlchemyAppointmentRepository(session)
    await repo.delete(tenant_id, appointment_id)


# ── Notification Center ───────────────────────────────────────────────────────

notifications_router = APIRouter(
    prefix="/tenants/{tenant_id}/notifications", tags=["notifications"]
)


@notifications_router.get("", response_model=list[NotificationRead])
async def list_notifications(
    tenant_id: str,
    user: CurrentUser,
    unread_only: bool = Query(False),
    limit: int = Query(50, le=200),
    session: AsyncSession = Depends(get_db_session),
):
    repo = SqlAlchemyNotificationRepository(session)
    return await repo.list_for_tenant(tenant_id, unread_only=unread_only, limit=limit)


@notifications_router.post("", response_model=NotificationRead, status_code=201)
async def create_notification(
    tenant_id: str,
    payload: NotificationCreate,
    user: CurrentUser,
    session: AsyncSession = Depends(get_db_session),
):
    repo = SqlAlchemyNotificationRepository(session)
    return await repo.create(tenant_id, payload)


@notifications_router.post("/mark-read")
async def mark_notifications_read(
    tenant_id: str,
    payload: NotificationMarkRead,
    user: CurrentUser,
    session: AsyncSession = Depends(get_db_session),
):
    repo = SqlAlchemyNotificationRepository(session)
    await repo.mark_read(tenant_id, [str(i) for i in payload.ids])
    return {"marked": len(payload.ids)}


@notifications_router.post("/mark-all-read")
async def mark_all_read(
    tenant_id: str,
    user: CurrentUser,
    session: AsyncSession = Depends(get_db_session),
):
    repo = SqlAlchemyNotificationRepository(session)
    count = await repo.mark_all_read(tenant_id)
    return {"marked": count}


# ── Analytics Dashboard ───────────────────────────────────────────────────────

analytics_router = APIRouter(
    prefix="/tenants/{tenant_id}/analytics", tags=["analytics"]
)


@analytics_router.get("", response_model=AnalyticsRead)
async def get_analytics(
    tenant_id: str,
    user: CurrentUser,
    days: int = Query(30, ge=1, le=365),
    session: AsyncSession = Depends(get_db_session),
):
    repo = SqlAlchemyAnalyticsRepository(session)
    return await repo.get_full_analytics(tenant_id, days)


@analytics_router.get("/dashboard", response_model=RealTimeDashboardRead)
async def get_realtime_dashboard(
    tenant_id: str,
    user: CurrentUser,
    session: AsyncSession = Depends(get_db_session),
):
    """Snapshot for Supabase Realtime; also polled every 10s as fallback."""
    analytics_repo = SqlAlchemyAnalyticsRepository(session)
    call_repo = SqlAlchemyCallRepository(session)
    notif_repo = SqlAlchemyNotificationRepository(session)

    snapshot = await analytics_repo.get_dashboard_snapshot(tenant_id)
    recent_calls = await call_repo.list_for_tenant(tenant_id, limit=10)
    recent_notifs = await notif_repo.list_for_tenant(tenant_id, unread_only=False, limit=10)

    return {
        **snapshot,
        "leads_today": 0,  # populated if lead_activities table used
        "recent_calls": recent_calls,
        "recent_notifications": recent_notifs,
    }


# ── Audit Logs ────────────────────────────────────────────────────────────────

audit_router = APIRouter(
    prefix="/tenants/{tenant_id}/audit-logs", tags=["audit-logs"]
)


@audit_router.get("", response_model=list[AuditLogRead])
async def list_audit_logs(
    tenant_id: str,
    user: CurrentUser,
    resource_type: str | None = Query(None),
    limit: int = Query(100, le=500),
    session: AsyncSession = Depends(get_db_session),
):
    from app.infrastructure.repositories.audit import SqlAlchemyAuditLogRepository
    repo = SqlAlchemyAuditLogRepository(session)
    return await repo.list_for_tenant(tenant_id, resource_type=resource_type, limit=limit)
