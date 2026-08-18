from fastapi import APIRouter, Header, Request, Response, status
import structlog
from uuid import UUID
from datetime import UTC, datetime

from app.api.deps import SessionDep
from app.domain.enums import IntegrationProvider, CallStatus, CallOutcome, LeadStatus
from app.infrastructure.integrations.twilio import TwilioWebhookVerifier
from app.infrastructure.repositories.integrations import SqlAlchemyIntegrationRepository
from app.infrastructure.repositories.calls import SqlAlchemyCallRepository
from app.infrastructure.repositories.contacts import SqlAlchemyContactRepository
from app.application.engine import WorkflowExecutionEngine
from app.infrastructure.db.models import CallModel
from app.api.v1.billing import record_usage

router = APIRouter(prefix="/webhooks", tags=["webhooks"])
log = structlog.get_logger()


def _resolve_call_outcome(success_eval, structured_data: dict | None, transcript: str) -> CallOutcome:
    """Prefer Vapi's own analysis (successEvaluation / structuredData) over
    guessing from the raw transcript. Vapi's successEvaluation is whatever
    rubric the assistant is configured with — usually boolean-ish or a
    short verdict string — so we check it first, then look for common
    structured-data field names an assistant's schema might use, and only
    fall back to keyword-matching the transcript as a last resort."""
    if success_eval is not None:
        val = str(success_eval).strip().lower()
        if val in ("true", "yes", "pass", "passed", "qualified", "success", "successful", "1"):
            return CallOutcome.QUALIFIED
        if val in ("false", "no", "fail", "failed", "not qualified", "unsuccessful", "0"):
            return CallOutcome.NOT_INTERESTED

    if structured_data:
        for key in ("qualified", "is_qualified", "interested", "is_interested"):
            if key in structured_data:
                return CallOutcome.QUALIFIED if structured_data[key] else CallOutcome.NOT_INTERESTED
        for key in ("callback_requested", "wants_callback", "callback"):
            if structured_data.get(key):
                return CallOutcome.CALLBACK_REQUESTED
        for key in ("escalate", "escalated", "needs_escalation"):
            if structured_data.get(key):
                return CallOutcome.ESCALATED
        for key in ("not_interested", "declined"):
            if structured_data.get(key):
                return CallOutcome.NOT_INTERESTED

    lowered = (transcript or "").lower()
    if "not interested" in lowered or "no thanks" in lowered:
        return CallOutcome.NOT_INTERESTED
    if "qualified" in lowered or "interest" in lowered:
        return CallOutcome.QUALIFIED
    return CallOutcome.UNKNOWN


@router.post("/vapi")
async def vapi_webhook(request: Request, session: SessionDep, tenant_id: str | None = None):
    raw_payload = await request.json()
    # Vapi's actual webhook contract wraps the real event inside a top-level
    # "message" object ({"message": {"type": ..., "call": {...}}}) — every
    # branch below was reading straight off the top level, so on a real
    # Vapi payload event_type and call_id both came back None and this
    # whole handler silently did nothing, every single time.
    payload = raw_payload.get("message", raw_payload)
    event_type = payload.get("type")

    # Log the incoming webhook
    await SqlAlchemyIntegrationRepository(session).log_webhook(tenant_id, IntegrationProvider.VAPI, "inbound", raw_payload, 200, event_type)

    call_id_str = payload.get("call", {}).get("metadata", {}).get("call_id")
    db_call = None
    if call_id_str:
        try:
            db_call_id = UUID(str(call_id_str))
            db_call = await SqlAlchemyCallRepository(session).get(db_call_id)
        except Exception as e:
            log.warning("vapi.webhook.find_call_failed", error=str(e))

    if not db_call:
        # Fallback: match on Vapi's own call ID, which we always stored
        # reliably as provider_call_id right when the call was created —
        # more robust than depending on our metadata surviving the round
        # trip through Vapi's servers intact.
        from sqlalchemy import select
        vapi_call_id = payload.get("call", {}).get("id")
        if vapi_call_id:
            result = await session.execute(select(CallModel).where(CallModel.provider_call_id == vapi_call_id))
            db_call = result.scalar_one_or_none()

    engine = WorkflowExecutionEngine(session)

    # Vapi's real event names: "status-update" (with call.status one of
    # "queued"/"ringing"/"in-progress"/"forwarding"/"ended") for the
    # in-flight lifecycle, and a separate final "end-of-call-report" with
    # the transcript/recording/analysis. Map both onto this app's existing
    # call.started / call.answered / call.ended handling below.
    call_status = payload.get("call", {}).get("status")
    if event_type == "status-update" and call_status == "in-progress":
        event_type = "call.started"
    elif event_type == "status-update" and call_status == "forwarding":
        event_type = "call.answered"
    elif event_type == "end-of-call-report":
        event_type = "call.ended"

    if db_call:
        t_id = db_call.tenant_id
        # Update call details based on event
        if event_type == "call.started":
            db_call.status = CallStatus.IN_PROGRESS
            db_call.started_at = datetime.now(UTC)
            await session.commit()
            await engine.trigger_workflows(t_id, "Call Started", {
                "call_id": str(db_call.id),
                "contact_id": str(db_call.contact_id) if db_call.contact_id else None,
                "customer_phone": db_call.customer_phone
            })
            
        elif event_type == "call.answered":
            await engine.trigger_workflows(t_id, "Call Answered", {
                "call_id": str(db_call.id),
                "contact_id": str(db_call.contact_id) if db_call.contact_id else None,
                "customer_phone": db_call.customer_phone
            })
            
        elif event_type == "call.ended":
            # Set outcome based on Vapi payload or end reason
            ended_reason = payload.get("call", {}).get("endedReason", "")
            duration = payload.get("call", {}).get("duration", 0)
            transcript = payload.get("call", {}).get("transcript", "")
            summary = payload.get("call", {}).get("summary", "")
            analysis = payload.get("call", {}).get("analysis") or payload.get("analysis") or {}
            recording_url = (
                payload.get("call", {}).get("recordingUrl")
                or payload.get("recordingUrl")
                or payload.get("artifact", {}).get("recordingUrl")
            )

            db_call.duration_seconds = int(duration) if duration else None
            db_call.transcript = transcript
            db_call.summary = analysis.get("summary") or summary
            db_call.recording_url = recording_url
            db_call.structured_data = analysis.get("structuredData")
            db_call.ended_reason = ended_reason or None
            success_eval = analysis.get("successEvaluation")
            db_call.success_evaluation = str(success_eval) if success_eval is not None else None
            db_call.ended_at = datetime.now(UTC)
            
            # Vapi's real endedReason values (customer-ended-call,
            # assistant-ended-call, exceeded-max-duration, etc.) don't match
            # "normal"/"customer-hung-up"/"agent-hung-up" at all — those
            # were guessed values that basically never matched, so real
            # completed calls were being marked FAILED. Flip the logic:
            # default to COMPLETED, and only mark FAILED for reasons that
            # actually indicate a real error (not just "nobody picked up",
            # which is handled separately below via the voicemail/retry path).
            failure_reasons = {
                "unknown-error", "pipeline-error", "assistant-not-found",
                "assistant-request-failed", "database-error",
                "call-start-error-neither-assistant-nor-server-set",
                "phone-call-provider-closed-websocket",
            }

            # Voicemail / no-answer detection already existed as a fully
            # built feature (retry queue + scheduler already process it) —
            # it just wasn't ever actually called from here, so nothing ever
            # populated the queue. Check it before falling through to plain
            # COMPLETED/FAILED classification: a voicemail isn't a hard
            # failure, it's a "try again later", and it already commits its
            # own status/outcome when it detects one.
            from app.api.v1.webhooks_voicemail import handle_voicemail_detection
            was_voicemail = await handle_voicemail_detection(session, t_id, str(db_call.id), ended_reason, transcript)

            if was_voicemail:
                pass  # status/outcome/retry already handled inside
            elif ended_reason in failure_reasons:
                db_call.status = CallStatus.FAILED
                db_call.outcome = CallOutcome.FAILED
            else:
                db_call.status = CallStatus.COMPLETED
                db_call.outcome = _resolve_call_outcome(success_eval, db_call.structured_data, transcript)
                
            await session.commit()

            if db_call.status == CallStatus.COMPLETED and db_call.duration_seconds and db_call.initiated_by_user_id:
                await record_usage(session, t_id, db_call.initiated_by_user_id, str(db_call.id), db_call.duration_seconds)

            # If lead qualified, trigger lead qualified and update contact lead_status
            if db_call.outcome == CallOutcome.QUALIFIED and db_call.contact_id:
                contact = await SqlAlchemyContactRepository(session).get(t_id, UUID(db_call.contact_id))
                if contact:
                    contact.lead_status = LeadStatus.QUALIFIED
                    await session.commit()
                    await engine.trigger_workflows(t_id, "Lead Qualified", {
                        "contact_id": str(contact.id),
                        "first_name": contact.first_name,
                        "last_name": contact.last_name,
                        "phone": contact.phone
                    })
            
            # Trigger Call Completed / Failed workflows
            workflow_event = "Call Completed" if db_call.status == CallStatus.COMPLETED else "Call Failed"
            await engine.trigger_workflows(t_id, workflow_event, {
                "call_id": str(db_call.id),
                "contact_id": str(db_call.contact_id) if db_call.contact_id else None,
                "customer_phone": db_call.customer_phone,
                "outcome": db_call.outcome.value,
                "duration_seconds": db_call.duration_seconds,
                "summary": db_call.summary
            })
    else:
        # Fallback if no db_call matches (e.g. inbound cold calls)
        log.info("vapi.webhook.received", event=event_type, call_id=payload.get("call", {}).get("id"))
        
    return {"ok": True}

@router.post("/twilio")
async def twilio_webhook(request: Request, session: SessionDep, tenant_id: str | None = None, x_twilio_signature: str | None = Header(default=None)):
    body = await request.body()
    if not TwilioWebhookVerifier().verify(body, x_twilio_signature):
        await SqlAlchemyIntegrationRepository(session).log_webhook(tenant_id, IntegrationProvider.TWILIO, "inbound", {"raw": body.decode(errors="ignore")}, 401, "signature.invalid")
        return Response(status_code=status.HTTP_401_UNAUTHORIZED)
    form = dict(await request.form()) if request.headers.get("content-type", "").startswith("application/x-www-form-urlencoded") else {"raw": body.decode(errors="ignore")}
    await SqlAlchemyIntegrationRepository(session).log_webhook(tenant_id, IntegrationProvider.TWILIO, "inbound", form, 200, form.get("CallStatus"))
    log.info("twilio.webhook.received")
    return {"ok": True}

@router.post("/make")
async def make_webhook(request: Request, session: SessionDep, tenant_id: str | None = None):
    payload = await request.json()
    await SqlAlchemyIntegrationRepository(session).log_webhook(tenant_id, IntegrationProvider.MAKE, "inbound", payload, 200, payload.get("event_type"))
    log.info("make.webhook.received", keys=list(payload.keys()))
    
    # Trigger Incoming Make.com Webhook workflow
    if tenant_id:
        engine = WorkflowExecutionEngine(session)
        await engine.trigger_workflows(tenant_id, "Incoming Make.com Webhook", payload)
        
    return {"ok": True}
