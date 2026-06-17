"""
tests/test_phase2_features.py — unit tests for scheduler tasks, lead scoring,
DNC list, voicemail detection, and outbound webhooks.

Run with: pytest tests/test_phase2_features.py -v
"""
import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4
from datetime import datetime, UTC, timedelta


# ─── Lead scoring ──────────────────────────────────────────────────────────────

class TestLeadScoring:
    def test_score_new_lead_is_low(self):
        from app.workers.scheduler import _calculate_lead_score
        from app.domain.enums import LeadStatus

        session = MagicMock()
        session.execute.return_value.scalars.return_value.all.return_value = []

        contact = MagicMock()
        contact.lead_status = LeadStatus.NEW
        contact.id = str(uuid4())

        score = _calculate_lead_score(session, contact)
        assert score == 0

    def test_score_converted_lead_with_calls_is_high(self):
        from app.workers.scheduler import _calculate_lead_score
        from app.domain.enums import LeadStatus, CallOutcome

        call1 = MagicMock(outcome=CallOutcome.QUALIFIED, duration_seconds=150)
        call2 = MagicMock(outcome=CallOutcome.QUALIFIED, duration_seconds=180)

        appt = MagicMock()

        session = MagicMock()
        call_result = MagicMock()
        call_result.scalars.return_value.all.return_value = [call1, call2]
        appt_result = MagicMock()
        appt_result.scalars.return_value.all.return_value = [appt]

        session.execute.side_effect = [call_result, appt_result]

        contact = MagicMock()
        contact.lead_status = LeadStatus.CONVERTED
        contact.id = str(uuid4())

        score = _calculate_lead_score(session, contact)
        # 30 (converted) + 6 (volume: 2*3) + 10 (quality: 2*5) + 10 (1 appt*10) + 20 (avg duration 165s > 120)
        assert score == 76

    def test_score_capped_at_100(self):
        from app.workers.scheduler import _calculate_lead_score
        from app.domain.enums import LeadStatus, CallOutcome

        calls = [MagicMock(outcome=CallOutcome.QUALIFIED, duration_seconds=300) for _ in range(20)]
        appts = [MagicMock() for _ in range(10)]

        session = MagicMock()
        call_result = MagicMock()
        call_result.scalars.return_value.all.return_value = calls
        appt_result = MagicMock()
        appt_result.scalars.return_value.all.return_value = appts
        session.execute.side_effect = [call_result, appt_result]

        contact = MagicMock()
        contact.lead_status = LeadStatus.CONVERTED
        contact.id = str(uuid4())

        score = _calculate_lead_score(session, contact)
        assert score <= 100


# ─── DNC list ──────────────────────────────────────────────────────────────────

class TestDncList:
    @pytest.mark.asyncio
    async def test_dnc_filters_contacts_before_calling(self):
        """Simulates the campaign launcher's DNC filtering logic."""
        dnc_phones = {"+15550001111", "+15550002222"}
        contacts = [
            MagicMock(phone="+15550001111"),
            MagicMock(phone="+15550003333"),
            MagicMock(phone="+15550002222"),
        ]

        queued = [c for c in contacts if c.phone not in dnc_phones]
        skipped = [c for c in contacts if c.phone in dnc_phones]

        assert len(queued) == 1
        assert len(skipped) == 2
        assert queued[0].phone == "+15550003333"


# ─── Voicemail detection ─────────────────────────────────────────────────────

class TestVoicemailDetection:
    @pytest.mark.asyncio
    async def test_detects_voicemail_from_ended_reason(self):
        from app.api.v1.webhooks_voicemail import handle_voicemail_detection

        session = AsyncMock()
        call = MagicMock()
        call.id = str(uuid4())
        call.contact_id = str(uuid4())
        call.campaign_id = None
        call.customer_phone = "+15550001234"
        call.metadata_ = {}

        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = call
        session.execute = AsyncMock(return_value=mock_result)
        session.add = MagicMock()
        session.commit = AsyncMock()

        detected = await handle_voicemail_detection(
            session, "tenant-1", call.id, ended_reason="voicemail"
        )
        assert detected is True
        session.add.assert_called_once()  # retry queue item added

    @pytest.mark.asyncio
    async def test_detects_voicemail_from_transcript_heuristic(self):
        from app.api.v1.webhooks_voicemail import handle_voicemail_detection

        session = AsyncMock()
        call = MagicMock()
        call.id = str(uuid4())
        call.contact_id = None
        call.campaign_id = None
        call.customer_phone = "+15550001234"
        call.metadata_ = {}

        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = call
        session.execute = AsyncMock(return_value=mock_result)
        session.add = MagicMock()
        session.commit = AsyncMock()

        detected = await handle_voicemail_detection(
            session, "tenant-1", call.id,
            ended_reason="customer-ended-call",
            transcript_text="Hi, please leave a message after the tone.",
        )
        assert detected is True

    @pytest.mark.asyncio
    async def test_normal_call_not_flagged_as_voicemail(self):
        from app.api.v1.webhooks_voicemail import handle_voicemail_detection

        session = AsyncMock()
        detected = await handle_voicemail_detection(
            session, "tenant-1", str(uuid4()),
            ended_reason="customer-ended-call",
            transcript_text="Hi, thanks for calling, how can I help you today?",
        )
        assert detected is False
        session.execute.assert_not_called()

    @pytest.mark.asyncio
    async def test_call_not_found_returns_false(self):
        from app.api.v1.webhooks_voicemail import handle_voicemail_detection

        session = AsyncMock()
        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = None
        session.execute = AsyncMock(return_value=mock_result)

        detected = await handle_voicemail_detection(
            session, "tenant-1", str(uuid4()), ended_reason="voicemail"
        )
        assert detected is False


# ─── Outbound webhooks ────────────────────────────────────────────────────────

class TestOutboundWebhooks:
    @pytest.mark.asyncio
    async def test_dispatch_signs_payload_when_secret_present(self):
        from app.api.v1.outbound_webhooks import dispatch_outbound_webhook, _sign_payload

        hook = MagicMock()
        hook.target_url = "https://example.com/hook"
        hook.secret = "supersecret"
        hook.id = str(uuid4())

        mock_response = MagicMock()
        mock_response.status_code = 200

        with patch("httpx.AsyncClient") as mock_client_cls:
            mock_client = AsyncMock()
            mock_client.__aenter__ = AsyncMock(return_value=mock_client)
            mock_client.__aexit__ = AsyncMock(return_value=None)
            mock_client.post = AsyncMock(return_value=mock_response)
            mock_client_cls.return_value = mock_client

            success, status = await dispatch_outbound_webhook(hook, "call_completed", {"phone": "x"})

        assert success is True
        assert status == 200
        call_kwargs = mock_client.post.call_args
        assert "X-Webhook-Signature" in call_kwargs.kwargs["headers"]

    @pytest.mark.asyncio
    async def test_dispatch_handles_failure_gracefully(self):
        from app.api.v1.outbound_webhooks import dispatch_outbound_webhook

        hook = MagicMock()
        hook.target_url = "https://broken.example.com"
        hook.secret = None
        hook.id = str(uuid4())

        with patch("httpx.AsyncClient") as mock_client_cls:
            mock_client = AsyncMock()
            mock_client.__aenter__ = AsyncMock(return_value=mock_client)
            mock_client.__aexit__ = AsyncMock(return_value=None)
            mock_client.post = AsyncMock(side_effect=Exception("connection refused"))
            mock_client_cls.return_value = mock_client

            success, status = await dispatch_outbound_webhook(hook, "call_completed", {})

        assert success is False
        assert status is None

    def test_signature_is_deterministic(self):
        from app.api.v1.outbound_webhooks import _sign_payload

        sig1 = _sign_payload("secret123", b'{"a":1}')
        sig2 = _sign_payload("secret123", b'{"a":1}')
        sig3 = _sign_payload("different", b'{"a":1}')

        assert sig1 == sig2
        assert sig1 != sig3


# ─── CSV import ─────────────────────────────────────────────────────────────────

class TestCsvImport:
    def test_duplicate_key_generation_for_csv_rows(self):
        from app.infrastructure.repositories.contacts import duplicate_key

        key1 = duplicate_key("+1 (555) 000-1111", None)
        key2 = duplicate_key("15550001111", None)
        # Both normalize to same digits-only key
        assert key1 == key2

    def test_duplicate_key_prefers_email(self):
        from app.infrastructure.repositories.contacts import duplicate_key

        key = duplicate_key("+15550001111", "Test@Example.com")
        assert key == "test@example.com"


# ─── Agent performance ────────────────────────────────────────────────────────

class TestAgentPerformance:
    def test_conversion_rate_calculation(self):
        total_calls = 20
        qualified_calls = 5
        conversion_rate = round(qualified_calls / total_calls, 4) if total_calls else 0
        assert conversion_rate == 0.25

    def test_avg_handle_time_calculation(self):
        total_duration = 600
        total_calls = 10
        avg = round(total_duration / total_calls, 1) if total_calls else 0
        assert avg == 60.0

    def test_zero_calls_does_not_divide_by_zero(self):
        total_calls = 0
        qualified_calls = 0
        conversion_rate = round(qualified_calls / total_calls, 4) if total_calls else 0
        assert conversion_rate == 0
