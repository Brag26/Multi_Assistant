"""
api/v1/webhooks_voicemail.py — Voicemail detection on Vapi end-of-call webhook.

Vapi sends an `end-of-call-report` event with `endedReason` and an
`analysis.successEvaluation` field. We treat reasons indicating an
answering machine / voicemail as a special outcome and enqueue a retry.

This supplements the existing webhooks.py Vapi handler — call
`handle_voicemail_detection(...)` from within that handler after parsing
the payload.
"""
from datetime import UTC, datetime, timedelta

import structlog
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.infrastructure.db.models import CallModel
from app.infrastructure.db.new_models import CallRetryQueueModel
from app.domain.enums import CallOutcome, CallStatus

log = structlog.get_logger()

# Vapi's endedReason values that indicate voicemail / no human answered
VOICEMAIL_REASONS = {
    "voicemail",
    "customer-did-not-answer",
    "voicemail-detected",
    "machine-detected",
    "no-answer",
}

DEFAULT_RETRY_DELAY_MINUTES = 120  # retry in 2 hours
DEFAULT_MAX_ATTEMPTS = 3


async def handle_voicemail_detection(
    session: AsyncSession,
    tenant_id: str,
    call_id: str,
    ended_reason: str | None,
    transcript_text: str | None = None,
) -> bool:
    """
    Detects voicemail from Vapi's endedReason or a transcript heuristic,
    marks the call accordingly, and enqueues a retry attempt.

    Returns True if voicemail was detected and a retry was queued.
    """
    is_voicemail = False

    if ended_reason and ended_reason.lower() in VOICEMAIL_REASONS:
        is_voicemail = True

    # Heuristic fallback: short calls with common voicemail phrases
    if not is_voicemail and transcript_text:
        voicemail_phrases = [
            "leave a message", "not available", "voicemail",
            "press the star key", "record your message", "at the tone",
        ]
        lowered = transcript_text.lower()
        if any(phrase in lowered for phrase in voicemail_phrases):
            is_voicemail = True

    if not is_voicemail:
        return False

    log.info("webhook.voicemail.detected", call_id=call_id, ended_reason=ended_reason)

    # Mark the call
    result = await session.execute(select(CallModel).where(CallModel.id == call_id))
    call = result.scalar_one_or_none()
    if not call:
        return False

    call.status = CallStatus.COMPLETED
    call.outcome = CallOutcome.CALLBACK_REQUESTED
    call.ended_at = datetime.now(UTC)
    call.metadata_ = {**(call.metadata_ or {}), "voicemail_detected": True}
    await session.commit()

    # Enqueue retry
    retry_item = CallRetryQueueModel(
        tenant_id=tenant_id,
        contact_id=call.contact_id,
        campaign_id=call.campaign_id,
        phone=call.customer_phone,
        attempt_number=1,
        max_attempts=DEFAULT_MAX_ATTEMPTS,
        retry_after=datetime.now(UTC) + timedelta(minutes=DEFAULT_RETRY_DELAY_MINUTES),
        status="pending",
    )
    session.add(retry_item)
    await session.commit()

    log.info("webhook.voicemail.retry_queued", call_id=call_id,
             retry_after=retry_item.retry_after.isoformat())
    return True
