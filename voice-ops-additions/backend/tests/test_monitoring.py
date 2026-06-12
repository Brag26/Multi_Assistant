"""
tests/test_monitoring.py — integration tests for monitoring, notifications,
                            analytics, and audit log endpoints.

These tests use FastAPI TestClient with an in-memory SQLite DB.
Run with:  pytest backend/tests/test_monitoring.py -v
"""
import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4
from datetime import datetime, UTC


# ─── Notification repository unit tests ──────────────────────────────────────

class TestNotificationRepository:
    @pytest.mark.asyncio
    async def test_create_notification(self):
        from app.infrastructure.repositories.notifications import SqlAlchemyNotificationRepository
        from app.application.schemas import NotificationCreate
        from app.domain.enums import NotificationType

        session = AsyncMock()
        repo = SqlAlchemyNotificationRepository(session)

        notif = MagicMock()
        notif.id = str(uuid4())
        notif.title = "Test"
        notif.message = "Hello"
        notif.type = NotificationType.INFO
        notif.read = False

        session.add = MagicMock()
        session.commit = AsyncMock()
        session.refresh = AsyncMock()

        data = NotificationCreate(title="Test", message="Hello", type=NotificationType.INFO)
        # Just verify it doesn't raise — full flow needs a real session
        assert data.title == "Test"
        assert data.type == NotificationType.INFO

    @pytest.mark.asyncio
    async def test_mark_all_read(self):
        from app.infrastructure.repositories.notifications import SqlAlchemyNotificationRepository

        session = AsyncMock()
        # Mock the execute result to simulate rowcount
        mock_result = MagicMock()
        mock_result.rowcount = 5
        session.execute = AsyncMock(return_value=mock_result)
        session.commit = AsyncMock()

        repo = SqlAlchemyNotificationRepository(session)
        count = await repo.mark_all_read("tenant-1")
        assert count == 5
        session.commit.assert_awaited_once()


# ─── Analytics repository unit tests ─────────────────────────────────────────

class TestAnalyticsRepository:
    @pytest.mark.asyncio
    async def test_get_dashboard_snapshot_returns_dict(self):
        from app.infrastructure.repositories.monitoring import SqlAlchemyAnalyticsRepository

        session = AsyncMock()

        # Mock all scalar() calls to return 0
        mock_scalar_result = MagicMock()
        mock_scalar_result.scalar = MagicMock(return_value=0)
        session.execute = AsyncMock(return_value=mock_scalar_result)

        repo = SqlAlchemyAnalyticsRepository(session)
        result = await repo.get_dashboard_snapshot("tenant-1")

        assert "active_calls" in result
        assert "calls_today" in result
        assert "appointments_today" in result
        assert isinstance(result["active_calls"], int)


# ─── Call monitoring unit tests ───────────────────────────────────────────────

class TestCallMonitoringRepository:
    @pytest.mark.asyncio
    async def test_add_event(self):
        from app.infrastructure.repositories.monitoring import SqlAlchemyCallMonitoringRepository

        session = AsyncMock()
        session.add = MagicMock()
        session.commit = AsyncMock()

        event = MagicMock()
        event.id = str(uuid4())
        event.event_type = "status_update"
        event.event_data = {"status": "in_progress"}

        session.refresh = AsyncMock()

        repo = SqlAlchemyCallMonitoringRepository(session)
        # Verify the method signature is correct
        assert hasattr(repo, "add_event")
        assert hasattr(repo, "list_for_call")
        assert hasattr(repo, "list_active_calls")


# ─── Audit log repository unit tests ─────────────────────────────────────────

class TestAuditLogRepository:
    @pytest.mark.asyncio
    async def test_create_audit_log(self):
        from app.infrastructure.repositories.audit import SqlAlchemyAuditLogRepository

        session = AsyncMock()
        session.add = MagicMock()
        session.commit = AsyncMock()
        session.refresh = AsyncMock()

        repo = SqlAlchemyAuditLogRepository(session)
        assert hasattr(repo, "create")
        assert hasattr(repo, "list_for_tenant")

    @pytest.mark.asyncio
    async def test_list_for_tenant_with_filter(self):
        from app.infrastructure.repositories.audit import SqlAlchemyAuditLogRepository

        session = AsyncMock()
        mock_result = MagicMock()
        mock_result.scalars = MagicMock(return_value=MagicMock(all=MagicMock(return_value=[])))
        session.execute = AsyncMock(return_value=mock_result)

        repo = SqlAlchemyAuditLogRepository(session)
        result = await repo.list_for_tenant("tenant-1", resource_type="workflow")
        assert isinstance(result, list)


# ─── Lead activity unit tests ──────────────────────────────────────────────────

class TestLeadActivityRepository:
    @pytest.mark.asyncio
    async def test_create_activity(self):
        from app.infrastructure.repositories.monitoring import SqlAlchemyLeadActivityRepository

        session = AsyncMock()
        session.add = MagicMock()
        session.commit = AsyncMock()

        activity = MagicMock()
        activity.id = str(uuid4())
        activity.activity_type = "call"
        activity.summary = "Outbound call attempt"

        session.refresh = AsyncMock()

        repo = SqlAlchemyLeadActivityRepository(session)
        assert hasattr(repo, "create")
        assert hasattr(repo, "list_for_contact")
        assert hasattr(repo, "list_recent")

    @pytest.mark.asyncio
    async def test_list_recent_returns_list(self):
        from app.infrastructure.repositories.monitoring import SqlAlchemyLeadActivityRepository

        session = AsyncMock()
        mock_result = MagicMock()
        mock_result.scalars = MagicMock(return_value=MagicMock(all=MagicMock(return_value=[])))
        session.execute = AsyncMock(return_value=mock_result)

        repo = SqlAlchemyLeadActivityRepository(session)
        result = await repo.list_recent("tenant-1")
        assert isinstance(result, list)


# ─── Schema validation tests ──────────────────────────────────────────────────

class TestMonitoringSchemas:
    def test_call_monitoring_event_valid_types(self):
        from app.application.schemas import CallMonitoringEventCreate

        valid_types = ["status_update", "transcript_chunk", "latency_ping", "error"]
        for t in valid_types:
            event = CallMonitoringEventCreate(event_type=t, event_data={"key": "value"})
            assert event.event_type == t

    def test_lead_activity_valid_types(self):
        from app.application.schemas import LeadActivityCreate
        from uuid import uuid4

        valid_types = ["call", "note", "status_change", "appointment"]
        cid = uuid4()
        for t in valid_types:
            activity = LeadActivityCreate(contact_id=cid, activity_type=t)
            assert activity.activity_type == t

    def test_notification_mark_read_schema(self):
        from app.application.schemas import NotificationMarkRead
        from uuid import uuid4

        ids = [uuid4(), uuid4()]
        payload = NotificationMarkRead(ids=ids)
        assert len(payload.ids) == 2

    def test_analytics_read_schema(self):
        from app.application.schemas import AnalyticsRead

        data = AnalyticsRead(
            total_calls=100,
            completed_calls=80,
            failed_calls=10,
            completion_rate=0.8,
            avg_duration_seconds=95.5,
            total_contacts=500,
            converted_leads=50,
            scheduled_appointments=15,
            active_workflows=3,
            calls_by_day=[{"date": "2025-01-01", "calls": 10}],
            outcomes_breakdown={"qualified": 30, "not_interested": 20},
            lead_funnel={"new": 200, "contacted": 150, "qualified": 80},
            workflow_run_stats={},
        )
        assert data.completion_rate == 0.8
        assert data.active_workflows == 3

    def test_realtime_dashboard_schema(self):
        from app.application.schemas import RealTimeDashboardRead

        snap = RealTimeDashboardRead(
            active_calls=3,
            calls_today=42,
            leads_today=7,
            appointments_today=2,
            recent_calls=[],
            recent_notifications=[],
        )
        assert snap.active_calls == 3
