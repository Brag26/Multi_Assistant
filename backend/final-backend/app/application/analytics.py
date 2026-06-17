from datetime import UTC, datetime, timedelta
from sqlalchemy import select, func, and_
from sqlalchemy.ext.asyncio import AsyncSession
from app.domain.enums import CallStatus, CallOutcome, LeadStatus
from app.infrastructure.db.models import CallModel, ContactModel, AppointmentModel

class AnalyticsService:
    def __init__(self, session: AsyncSession):
        self.session = session

    async def get_tenant_analytics(self, tenant_id: str):
        # 1. Total, Completed, Failed calls
        calls_stat = await self.session.execute(
            select(
                func.count(CallModel.id).label("total"),
                func.count(CallModel.id).filter(CallModel.status == CallStatus.COMPLETED).label("completed"),
                func.count(CallModel.id).filter(CallModel.status == CallStatus.FAILED).label("failed"),
                func.coalesce(func.avg(CallModel.duration_seconds), 0).label("avg_duration")
            ).where(CallModel.tenant_id == tenant_id)
        )
        stats = calls_stat.one()
        total = stats.total or 0
        completed = stats.completed or 0
        failed = stats.failed or 0
        avg_dur = float(stats.avg_duration or 0.0)

        completion_rate = (completed / total * 100.0) if total > 0 else 0.0

        # 2. Total Contacts / Leads
        contacts_stat = await self.session.execute(
            select(
                func.count(ContactModel.id).label("total"),
                func.count(ContactModel.id).filter(ContactModel.lead_status == LeadStatus.CONVERTED).label("converted")
            ).where(ContactModel.tenant_id == tenant_id)
        )
        c_stats = contacts_stat.one()
        total_contacts = c_stats.total or 0
        converted_leads = c_stats.converted or 0

        # 3. Scheduled Appointments
        appointments_stat = await self.session.execute(
            select(func.count(AppointmentModel.id)).where(
                AppointmentModel.tenant_id == tenant_id,
                AppointmentModel.status == "scheduled"
            )
        )
        scheduled_appointments = appointments_stat.scalar() or 0

        # 4. Calls by Day (Last 7 Days)
        seven_days_ago = datetime.now(UTC) - timedelta(days=7)
        calls_by_day_res = await self.session.execute(
            select(
                func.to_char(CallModel.created_at, 'YYYY-MM-DD').label("day"),
                func.count(CallModel.id).label("count")
            )
            .where(
                CallModel.tenant_id == tenant_id,
                CallModel.created_at >= seven_days_ago
            )
            .group_by("day")
            .order_by("day")
        )
        
        # Populate daily list
        days_map = { (datetime.now(UTC) - timedelta(days=i)).strftime('%Y-%m-%d'): 0 for i in range(7) }
        for row in calls_by_day_res.all():
            days_map[row.day] = row.count

        calls_by_day = [{"day": k, "count": v} for k, v in sorted(days_map.items())]

        # 5. Outcomes Breakdown
        outcomes_res = await self.session.execute(
            select(
                CallModel.outcome,
                func.count(CallModel.id)
            )
            .where(CallModel.tenant_id == tenant_id)
            .group_by(CallModel.outcome)
        )
        outcomes_breakdown = { str(row[0].value if hasattr(row[0], 'value') else row[0]): row[1] for row in outcomes_res.all() }

        return {
            "total_calls": total,
            "completed_calls": completed,
            "failed_calls": failed,
            "completion_rate": round(completion_rate, 2),
            "avg_duration_seconds": round(avg_dur, 2),
            "total_contacts": total_contacts,
            "converted_leads": converted_leads,
            "scheduled_appointments": scheduled_appointments,
            "calls_by_day": calls_by_day,
            "outcomes_breakdown": outcomes_breakdown
        }
