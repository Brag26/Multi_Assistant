from typing import Annotated
from fastapi import APIRouter, Depends
from app.api.deps import analytics_service
from app.application.schemas import AnalyticsRead
from app.application.analytics import AnalyticsService
from app.core.security import CurrentUser, require_tenant_access

router = APIRouter(prefix="/tenants/{tenant_id}/analytics", tags=["analytics"])

@router.get("", response_model=AnalyticsRead)
async def get_analytics(
    tenant_id: str,
    user: CurrentUser,
    service: Annotated[AnalyticsService, Depends(analytics_service)]
):
    require_tenant_access(user, tenant_id)
    return await service.get_tenant_analytics(tenant_id)
