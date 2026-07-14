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
            
            db_call.duration_seconds = int(duration) if duration else None
            db_call.transcript = transcript
            db_call.summary = summary
            db_call.ended_at = datetime.now(UTC)
            
            if ended_reason in ["normal", "customer-hung-up", "agent-hung-up"]:
                db_call.status = CallStatus.COMPLETED
                db_call.outcome = CallOutcome.QUALIFIED if "qualified" in transcript.lower() or "interest" in transcript.lower() else CallOutcome.UNKNOWN
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
