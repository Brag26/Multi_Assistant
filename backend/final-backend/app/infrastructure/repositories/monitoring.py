"""
repositories/monitoring.py — call monitoring, lead activities, analytics snapshots.
"""
from datetime import date, datetime, UTC
from uuid import UUID

from sqlalchemy import select, func, and_
from sqlalchemy.ext.asyncio import AsyncSession

from app.infrastructure.db.models import (
    CallMonitoringModel,
    LeadActivityModel,
    AnalyticsSnapshotModel,
    CallModel,
    ContactModel,
    AppointmentModel,
    NotificationModel,
)
from app.domain.enums import CallStatus, AppointmentStatus, LeadStatus


class SqlAlchemyCallMonitoringRepository:
    def __init__(self, session: AsyncSession):
        self.session = session

    async def add_event(self, tenant_id: str, call_id: str, event_type: str, event_data: dict):
        from app.infrastructure.db.models import CallMonitoringModel
        event = CallMonitoringModel(
            tenant_id=tenant_id,
            call_id=call_id,
            event_type=event_type,
            event_data=event_data,
        )
        self.session.add(event)
        await self.session.commit()
        await self.session.refresh(event)
        return event

    async def list_for_call(self, tenant_id: str, call_id: UUID, limit: int = 200):
        result = await self.session.execute(
            select(CallMonitoringModel)
            .where(
                CallMonitoringModel.tenant_id == tenant_id,
                CallMonitoringModel.call_id == str(call_id),
            )
            .order_by(CallMonitoringModel.recorded_at.asc())
            .limit(limit)
        )
        return result.scalars().all()

    async def list_active_calls(self, tenant_id: str):
        result = await self.session.execute(
            select(CallModel).where(
                CallModel.tenant_id == tenant_id,
                CallModel.status == CallStatus.IN_PROGRESS,
            ).order_by(CallModel.started_at.desc())
        )
        return result.scalars().all()


class SqlAlchemyLeadActivityRepository:
    def __init__(self, session: AsyncSession):
        self.session = session

    async def create(self, tenant_id: str, contact_id: str, activity_type: str, summary: str | None, metadata: dict):
        activity = LeadActivityModel(
            tenant_id=tenant_id,
            contact_id=contact_id,
            activity_type=activity_type,
            summary=summary,
            metadata=metadata,
        )
        self.session.add(activity)
        await self.session.commit()
        await self.session.refresh(activity)
        return activity

    async def list_for_contact(self, tenant_id: str, contact_id: UUID, limit: int = 100):
        result = await self.session.execute(
            select(LeadActivityModel)
            .where(
                LeadActivityModel.tenant_id == tenant_id,
                LeadActivityModel.contact_id == str(contact_id),
            )
            .order_by(LeadActivityModel.created_at.desc())
            .limit(limit)
        )
        return result.scalars().all()

    async def list_recent(self, tenant_id: str, limit: int = 50):
        result = await self.session.execute(
            select(LeadActivityModel)
            .where(LeadActivityModel.tenant_id == tenant_id)
            .order_by(LeadActivityModel.created_at.desc())
            .limit(limit)
        )
        return result.scalars().all()


class SqlAlchemyAnalyticsRepository:
    def __init__(self, session: AsyncSession):
        self.session = session

    async def get_dashboard_snapshot(self, tenant_id: str) -> dict:
        """Build the real-time dashboard payload."""
        today_start = datetime.now(UTC).replace(hour=0, minute=0, second=0, microsecond=0)

        # Active calls
        active_calls_result = await self.session.execute(
            select(func.count(CallModel.id)).where(
                CallModel.tenant_id == tenant_id,
                CallModel.status == CallStatus.IN_PROGRESS,
            )
        )
        active_calls = active_calls_result.scalar() or 0

        # Calls today
        calls_today_result = await self.session.execute(
            select(func.count(CallModel.id)).where(
                CallModel.tenant_id == tenant_id,
                CallModel.created_at >= today_start,
            )
        )
        calls_today = calls_today_result.scalar() or 0

        # Appointments today
        appts_result = await self.session.execute(
            select(func.count(AppointmentModel.id)).where(
                AppointmentModel.tenant_id == tenant_id,
                AppointmentModel.scheduled_at >= today_start,
                AppointmentModel.status == AppointmentStatus.SCHEDULED,
            )
        )
        appointments_today = appts_result.scalar() or 0

        return {
            "active_calls": active_calls,
            "calls_today": calls_today,
            "appointments_today": appointments_today,
        }

    async def get_full_analytics(self, tenant_id: str, days: int = 30) -> dict:
        from datetime import timedelta
        from sqlalchemy import case

        cutoff = datetime.now(UTC) - timedelta(days=days)

        # Total calls
        total_q = await self.session.execute(
            select(func.count(CallModel.id)).where(CallModel.tenant_id == tenant_id)
        )
        total_calls = total_q.scalar() or 0

        # Completed / failed
        status_q = await self.session.execute(
            select(
                CallModel.status,
                func.count(CallModel.id).label("cnt"),
            )
            .where(CallModel.tenant_id == tenant_id)
            .group_by(CallModel.status)
        )
        status_rows = {row.status: row.cnt for row in status_q}
        completed = status_rows.get("completed", 0)
        failed = status_rows.get("failed", 0)

        # Avg duration
        avg_q = await self.session.execute(
            select(func.avg(CallModel.duration_seconds)).where(
                CallModel.tenant_id == tenant_id,
                CallModel.duration_seconds.isnot(None),
            )
        )
        avg_duration = float(avg_q.scalar() or 0)

        # Contacts
        contact_q = await self.session.execute(
            select(func.count(ContactModel.id)).where(ContactModel.tenant_id == tenant_id)
        )
        total_contacts = contact_q.scalar() or 0

        converted_q = await self.session.execute(
            select(func.count(ContactModel.id)).where(
                ContactModel.tenant_id == tenant_id,
                ContactModel.lead_status == LeadStatus.CONVERTED,
            )
        )
        converted_leads = converted_q.scalar() or 0

        # Appointments
        appt_q = await self.session.execute(
            select(func.count(AppointmentModel.id)).where(
                AppointmentModel.tenant_id == tenant_id,
                AppointmentModel.status == AppointmentStatus.SCHEDULED,
            )
        )
        scheduled_appointments = appt_q.scalar() or 0

        # Calls by day (last N days)
        from sqlalchemy import cast, Date
        daily_q = await self.session.execute(
            select(
                cast(CallModel.created_at, Date).label("day"),
                func.count(CallModel.id).label("calls"),
            )
            .where(CallModel.tenant_id == tenant_id, CallModel.created_at >= cutoff)
            .group_by("day")
            .order_by("day")
        )
        calls_by_day = [{"date": str(r.day), "calls": r.calls} for r in daily_q]

        # Outcomes
        outcome_q = await self.session.execute(
            select(CallModel.outcome, func.count(CallModel.id).label("cnt"))
            .where(CallModel.tenant_id == tenant_id)
            .group_by(CallModel.outcome)
        )
        outcomes = {r.outcome: r.cnt for r in outcome_q}

        # Lead funnel
        lead_q = await self.session.execute(
            select(ContactModel.lead_status, func.count(ContactModel.id).label("cnt"))
            .where(ContactModel.tenant_id == tenant_id)
            .group_by(ContactModel.lead_status)
        )
        lead_funnel = {r.lead_status: r.cnt for r in lead_q}

        return {
            "total_calls": total_calls,
            "completed_calls": completed,
            "failed_calls": failed,
            "completion_rate": round(completed / total_calls, 4) if total_calls else 0.0,
            "avg_duration_seconds": round(avg_duration, 2),
            "total_contacts": total_contacts,
            "converted_leads": converted_leads,
            "scheduled_appointments": scheduled_appointments,
            "active_workflows": 0,  # populated by service layer
            "calls_by_day": calls_by_day,
            "outcomes_breakdown": outcomes,
            "lead_funnel": lead_funnel,
            "workflow_run_stats": {},
        }
