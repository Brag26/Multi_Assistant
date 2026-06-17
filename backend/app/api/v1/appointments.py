from typing import Annotated
from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException, status
from app.api.deps import appointment_repository, workflow_engine
from app.application.schemas import AppointmentCreate, AppointmentRead, AppointmentUpdate
from app.infrastructure.repositories.appointments import SqlAlchemyAppointmentRepository
from app.application.engine import WorkflowExecutionEngine
from app.core.security import CurrentUser, require_tenant_access

router = APIRouter(prefix="/tenants/{tenant_id}/appointments", tags=["appointments"])

@router.get("", response_model=list[AppointmentRead])
async def list_appointments(
    tenant_id: str,
    user: CurrentUser,
    repo: Annotated[SqlAlchemyAppointmentRepository, Depends(appointment_repository)],
    contact_id: UUID | None = None
):
    require_tenant_access(user, tenant_id)
    return await repo.list_for_tenant(tenant_id, contact_id=contact_id)

@router.post("", response_model=AppointmentRead, status_code=201)
async def create_appointment(
    tenant_id: str,
    payload: AppointmentCreate,
    user: CurrentUser,
    repo: Annotated[SqlAlchemyAppointmentRepository, Depends(appointment_repository)],
    engine: Annotated[WorkflowExecutionEngine, Depends(workflow_engine)]
):
    require_tenant_access(user, tenant_id)
    appointment = await repo.create(tenant_id, payload)
    
    # Trigger workflow for Appointment Booked
    await engine.trigger_workflows(tenant_id, "Appointment Booked", {
        "appointment_id": str(appointment.id),
        "contact_id": str(appointment.contact_id) if appointment.contact_id else None,
        "title": appointment.title,
        "scheduled_at": appointment.scheduled_at.isoformat()
    })
    
    return appointment

@router.get("/{appointment_id}", response_model=AppointmentRead)
async def get_appointment(
    tenant_id: str,
    appointment_id: UUID,
    user: CurrentUser,
    repo: Annotated[SqlAlchemyAppointmentRepository, Depends(appointment_repository)]
):
    require_tenant_access(user, tenant_id)
    appointment = await repo.get_for_tenant(tenant_id, appointment_id)
    if not appointment:
        raise HTTPException(status_code=404, detail="Appointment not found")
    return appointment

@router.put("/{appointment_id}", response_model=AppointmentRead)
async def update_appointment(
    tenant_id: str,
    appointment_id: UUID,
    payload: AppointmentUpdate,
    user: CurrentUser,
    repo: Annotated[SqlAlchemyAppointmentRepository, Depends(appointment_repository)]
):
    require_tenant_access(user, tenant_id)
    appointment = await repo.update(tenant_id, appointment_id, payload)
    if not appointment:
        raise HTTPException(status_code=404, detail="Appointment not found")
    return appointment

@router.delete("/{appointment_id}", status_code=204)
async def delete_appointment(
    tenant_id: str,
    appointment_id: UUID,
    user: CurrentUser,
    repo: Annotated[SqlAlchemyAppointmentRepository, Depends(appointment_repository)]
):
    require_tenant_access(user, tenant_id)
    deleted = await repo.delete(tenant_id, appointment_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Appointment not found")
