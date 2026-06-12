from typing import Annotated
from uuid import UUID
from fastapi import APIRouter, Depends, File, Query, UploadFile

from app.api.deps import contact_service
from app.application.module_services import ContactService
from app.application.schemas import ContactCreate, ContactImportResult, ContactRead, ContactUpdate, DuplicateContactRead, SegmentCreate, SegmentRead, TagCreate, TagRead
from app.core.security import CurrentUser

router = APIRouter(prefix="/tenants/{tenant_id}/contacts", tags=["contacts"])

@router.get("", response_model=list[ContactRead])
async def list_contacts(tenant_id: str, user: CurrentUser, service: Annotated[ContactService, Depends(contact_service)], q: str | None = None, tag_id: str | None = None, source: str | None = None):
    return await service.list_contacts(user, tenant_id, q, tag_id, source)

@router.post("", response_model=ContactRead, status_code=201)
async def create_contact(tenant_id: str, payload: ContactCreate, user: CurrentUser, service: Annotated[ContactService, Depends(contact_service)]):
    return await service.create_contact(user, tenant_id, payload)

@router.patch("/{contact_id}", response_model=ContactRead)
async def update_contact(tenant_id: str, contact_id: UUID, payload: ContactUpdate, user: CurrentUser, service: Annotated[ContactService, Depends(contact_service)]):
    return await service.update_contact(user, tenant_id, contact_id, payload)

@router.delete("/{contact_id}", status_code=204)
async def delete_contact(tenant_id: str, contact_id: UUID, user: CurrentUser, service: Annotated[ContactService, Depends(contact_service)]):
    await service.delete_contact(user, tenant_id, contact_id)

@router.post("/import", response_model=ContactImportResult)
async def import_contacts(tenant_id: str, user: CurrentUser, service: Annotated[ContactService, Depends(contact_service)], file: UploadFile = File(...)):
    return await service.import_csv(user, tenant_id, file)

@router.get("/duplicates", response_model=list[DuplicateContactRead])
async def duplicates(tenant_id: str, user: CurrentUser, service: Annotated[ContactService, Depends(contact_service)]):
    return await service.duplicates(user, tenant_id)

@router.get("/tags", response_model=list[TagRead])
async def list_tags(tenant_id: str, user: CurrentUser, service: Annotated[ContactService, Depends(contact_service)]):
    return await service.list_tags(user, tenant_id)

@router.post("/tags", response_model=TagRead, status_code=201)
async def create_tag(tenant_id: str, payload: TagCreate, user: CurrentUser, service: Annotated[ContactService, Depends(contact_service)]):
    return await service.create_tag(user, tenant_id, payload)

@router.get("/segments", response_model=list[SegmentRead])
async def list_segments(tenant_id: str, user: CurrentUser, service: Annotated[ContactService, Depends(contact_service)]):
    return await service.list_segments(user, tenant_id)

@router.post("/segments", response_model=SegmentRead, status_code=201)
async def create_segment(tenant_id: str, payload: SegmentCreate, user: CurrentUser, service: Annotated[ContactService, Depends(contact_service)]):
    return await service.create_segment(user, tenant_id, payload)
