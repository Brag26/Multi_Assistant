from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel

from app.api.deps import SessionDep, call_service
from app.application.services import CallService
from app.application.schemas import CallRead
from app.core.security import CurrentUser, require_tenant_access
from app.infrastructure.integrations.vapi import VapiClient
from app.infrastructure.repositories.calls import SqlAlchemyCallRepository
from typing import Annotated
from fastapi import Depends

router = APIRouter(prefix="/tenants/{tenant_id}/calls", tags=["calls"])

@router.get("", response_model=list[CallRead])
async def list_calls(tenant_id: str, user: CurrentUser, session: SessionDep, campaign_id: str | None = None, contact_id: str | None = None):
    require_tenant_access(user, tenant_id)
    return await SqlAlchemyCallRepository(session).list_for_tenant(tenant_id, campaign_id=campaign_id, contact_id=contact_id)


class TestCallRequest(BaseModel):
    assistant_id: str
    customer_phone: str


@router.post("/test", response_model=CallRead, status_code=202)
async def launch_test_call(
    tenant_id: str,
    payload: TestCallRequest,
    user: CurrentUser,
    service: Annotated[CallService, Depends(call_service)],
):
    """Dial one number right now with a chosen assistant — no workflow or
    campaign needed. For quick manual testing."""
    return await service.launch_test_call(user, tenant_id, payload.assistant_id, payload.customer_phone)


@router.get("/{call_id}/recording-url")
async def get_call_recording_url(
    tenant_id: str,
    call_id: str,
    user: CurrentUser,
    session: SessionDep,
    kind: str = "mono-recording",
):
    """Vapi now requires authenticated requests to download recordings —
    the recordingUrl stored on the call no longer works directly as of
    July 2026. This fetches a fresh short-lived signed URL on demand."""
    require_tenant_access(user, tenant_id)
    repo = SqlAlchemyCallRepository(session)
    try:
        call = await repo.get(call_id)
    except Exception:
        call = None
    if not call or str(call.tenant_id) != tenant_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Call not found")
    if not call.provider_call_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "This call has no Vapi recording")

    signed_url = await VapiClient().get_recording_url(call.provider_call_id, kind=kind)
    if not signed_url:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "No recording available for this call")
    return {"recording_url": signed_url}
