from typing import Annotated
from uuid import UUID
from fastapi import APIRouter, BackgroundTasks, Depends

from app.api.deps import campaign_service
from app.application.module_services import CampaignService
from app.application.schemas import CampaignCreate, CampaignRead, CampaignUpdate
from app.core.security import CurrentUser

router = APIRouter(prefix="/tenants/{tenant_id}/campaigns", tags=["campaigns"])

@router.get("", response_model=list[CampaignRead])
async def list_campaigns(tenant_id: str, user: CurrentUser, service: Annotated[CampaignService, Depends(campaign_service)]):
    return await service.list_campaigns(user, tenant_id)

@router.post("", response_model=CampaignRead, status_code=201)
async def create_campaign(tenant_id: str, payload: CampaignCreate, user: CurrentUser, service: Annotated[CampaignService, Depends(campaign_service)]):
    return await service.create_campaign(user, tenant_id, payload)

@router.patch("/{campaign_id}", response_model=CampaignRead)
async def update_campaign(tenant_id: str, campaign_id: UUID, payload: CampaignUpdate, user: CurrentUser, service: Annotated[CampaignService, Depends(campaign_service)]):
    return await service.update_campaign(user, tenant_id, campaign_id, payload)

@router.post("/{campaign_id}/pause", response_model=CampaignRead)
async def pause_campaign(tenant_id: str, campaign_id: UUID, user: CurrentUser, service: Annotated[CampaignService, Depends(campaign_service)]):
    return await service.pause(user, tenant_id, campaign_id)

@router.post("/{campaign_id}/resume", response_model=CampaignRead)
async def resume_campaign(tenant_id: str, campaign_id: UUID, user: CurrentUser, service: Annotated[CampaignService, Depends(campaign_service)]):
    return await service.resume(user, tenant_id, campaign_id)

@router.post("/{campaign_id}/cancel", response_model=CampaignRead)
async def cancel_campaign(tenant_id: str, campaign_id: UUID, user: CurrentUser, service: Annotated[CampaignService, Depends(campaign_service)]):
    return await service.cancel(user, tenant_id, campaign_id)

@router.post("/{campaign_id}/clone", response_model=CampaignRead, status_code=201)
async def clone_campaign(tenant_id: str, campaign_id: UUID, user: CurrentUser, service: Annotated[CampaignService, Depends(campaign_service)]):
    return await service.clone(user, tenant_id, campaign_id)

@router.post("/{campaign_id}/launch", response_model=CampaignRead)
async def launch_campaign_now(tenant_id: str, campaign_id: UUID, user: CurrentUser, background_tasks: BackgroundTasks, service: Annotated[CampaignService, Depends(campaign_service)]):
    """Start dialing every attached contact right now, instead of waiting on scheduled_at."""
    return await service.launch_now(user, tenant_id, campaign_id, background_tasks=background_tasks)
