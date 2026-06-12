from fastapi import APIRouter

from app.api.deps import SessionDep
from app.application.schemas import CallRead
from app.core.security import CurrentUser, require_tenant_access
from app.infrastructure.repositories.calls import SqlAlchemyCallRepository

router = APIRouter(prefix="/tenants/{tenant_id}/calls", tags=["calls"])

@router.get("", response_model=list[CallRead])
async def list_calls(tenant_id: str, user: CurrentUser, session: SessionDep, campaign_id: str | None = None, contact_id: str | None = None):
    require_tenant_access(user, tenant_id)
    return await SqlAlchemyCallRepository(session).list_for_tenant(tenant_id, campaign_id=campaign_id, contact_id=contact_id)
