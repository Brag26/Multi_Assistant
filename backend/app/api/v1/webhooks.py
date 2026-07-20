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
    payload = await request.json()
    event_type = payload.get("type")
    
    # Log the incoming webhook
    await SqlAlchemyIntegrationRepository(session).log_webhook(tenant_id, IntegrationProvider.VAPI, "inbound", payload, 200, event_type)
    
    call_id_str = payload.get("call", {}).get("metadata", {}).get("call_id")
    db_call = None
    if call_id_str:
        try:
            db_call_id = UUID(str(call_id_str))
            db_call = await SqlAlchemyCallRepository(session).get(db_call_id)
        except Exception as e:
            log.warning("vapi.webhook.find_call_failed", error=str(e))
            
    engine = WorkflowExecutionEngine(session)
    
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
            success_eval = analysis.get("successEvaluation")
            db_call.success_evaluation = str(success_eval) if success_eval is not None else None
            db_call.ended_at = datetime.now(UTC)
            
            if ended_reason in ["normal", "customer-hung-up", "agent-hung-up"]:
                db_call.status = CallStatus.COMPLETED
                db_call.outcome = _resolve_call_outcome(success_eval, db_call.structured_data, transcript)
            else:
                db_call.status = CallStatus.FAILED
                db_call.outcome = CallOutcome.FAILED
                
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
