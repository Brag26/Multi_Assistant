from typing import Annotated
from fastapi import APIRouter, Depends

from app.api.deps import integration_service
from app.application.module_services import IntegrationService
from app.application.schemas import IntegrationAssetRead, IntegrationConnect, IntegrationRead, MakeScenarioTrigger, WebhookLogRead
from app.core.security import CurrentUser
from app.domain.enums import IntegrationProvider

router = APIRouter(prefix="/tenants/{tenant_id}/integrations", tags=["integrations"])

@router.get("", response_model=list[IntegrationRead])
async def list_integrations(tenant_id: str, user: CurrentUser, service: Annotated[IntegrationService, Depends(integration_service)]):
    return await service.list_integrations(user, tenant_id)

@router.post("/{provider}/connect", response_model=IntegrationRead, status_code=201)
async def connect_provider(tenant_id: str, provider: IntegrationProvider, payload: IntegrationConnect, user: CurrentUser, service: Annotated[IntegrationService, Depends(integration_service)]):
    return await service.connect(user, tenant_id, provider, payload)

@router.post("/{provider}/disconnect", response_model=IntegrationRead | None)
async def disconnect_provider(tenant_id: str, provider: IntegrationProvider, user: CurrentUser, service: Annotated[IntegrationService, Depends(integration_service)]):
    return await service.disconnect(user, tenant_id, provider)

@router.delete("/profiles/{name}")
async def delete_profile(tenant_id: str, name: str, user: CurrentUser, service: Annotated[IntegrationService, Depends(integration_service)], owner_user_id: str | None = None):
    """Delete a whole named setup (e.g. "Setup 2") — removes every provider
    connection saved under that name. Superadmin only."""
    return await service.delete_profile(user, tenant_id, name, owner_user_id)

@router.post("/vapi/refresh-assistants", response_model=list[IntegrationAssetRead])
async def refresh_vapi_assistants(tenant_id: str, user: CurrentUser, service: Annotated[IntegrationService, Depends(integration_service)]):
    return await service.refresh_vapi_assistants(user, tenant_id)

@router.post("/twilio/refresh-numbers", response_model=list[IntegrationAssetRead])
async def refresh_twilio_numbers(tenant_id: str, user: CurrentUser, service: Annotated[IntegrationService, Depends(integration_service)]):
    return await service.refresh_twilio_numbers(user, tenant_id)

@router.post("/make/register-webhook", response_model=IntegrationRead, status_code=201)
async def register_make_webhook(tenant_id: str, payload: IntegrationConnect, user: CurrentUser, service: Annotated[IntegrationService, Depends(integration_service)]):
    return await service.register_make_webhook(user, tenant_id, payload)

@router.post("/make/trigger", response_model=WebhookLogRead, status_code=202)
async def trigger_make_scenario(tenant_id: str, payload: MakeScenarioTrigger, user: CurrentUser, service: Annotated[IntegrationService, Depends(integration_service)]):
    return await service.trigger_make_scenario(user, tenant_id, payload)

@router.get("/{provider}/assets", response_model=list[IntegrationAssetRead])
async def list_assets(tenant_id: str, provider: IntegrationProvider, user: CurrentUser, service: Annotated[IntegrationService, Depends(integration_service)]):
    return await service.assets(user, tenant_id, provider)

@router.get("/webhook-logs", response_model=list[WebhookLogRead])
async def webhook_logs(tenant_id: str, user: CurrentUser, service: Annotated[IntegrationService, Depends(integration_service)], provider: IntegrationProvider | None = None):
    return await service.webhook_logs(user, tenant_id, provider)
