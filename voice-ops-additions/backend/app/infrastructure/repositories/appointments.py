from uuid import UUID
from datetime import datetime
from sqlalchemy import select, delete
from sqlalchemy.ext.asyncio import AsyncSession
from app.application.schemas import AppointmentCreate, AppointmentUpdate
from app.infrastructure.db.models import AppointmentModel

class SqlAlchemyAppointmentRepository:
    def __init__(self, session: AsyncSession):
        self.session = session

    async def list_for_tenant(self, tenant_id: str, contact_id: UUID | None = None):
        stmt = select(AppointmentModel).where(AppointmentModel.tenant_id == tenant_id)
        if contact_id:
            stmt = stmt.where(AppointmentModel.contact_id == str(contact_id))
        result = await self.session.execute(stmt.order_by(AppointmentModel.scheduled_at.asc()))
        return result.scalars().all()

    async def get_for_tenant(self, tenant_id: str, appointment_id: UUID):
        result = await self.session.execute(
            select(AppointmentModel).where(
                AppointmentModel.tenant_id == tenant_id,
                AppointmentModel.id == str(appointment_id)
            )
        )
        return result.scalar_one_or_none()

    async def create(self, tenant_id: str, data: AppointmentCreate):
        appointment = AppointmentModel(
            tenant_id=tenant_id,
            contact_id=str(data.contact_id) if data.contact_id else None,
            title=data.title,
            description=data.description,
            scheduled_at=data.scheduled_at,
            status=data.status
        )
        self.session.add(appointment)
        await self.session.commit()
        await self.session.refresh(appointment)
        return appointment

    async def update(self, tenant_id: str, appointment_id: UUID, data: AppointmentUpdate):
        appointment = await self.get_for_tenant(tenant_id, appointment_id)
        if not appointment:
            return None
        
        update_data = data.model_dump(exclude_unset=True)
        for key, value in update_data.items():
            if key == "scheduled_at" and value is not None:
                appointment.scheduled_at = value
            elif key == "status" and value is not None:
                appointment.status = value
            elif value is not None or key in {"description", "contact_id"}:
                setattr(appointment, key, value)
                
        appointment.updated_at = datetime.now()
        await self.session.commit()
        await self.session.refresh(appointment)
        return appointment

    async def delete(self, tenant_id: str, appointment_id: UUID):
        appointment = await self.get_for_tenant(tenant_id, appointment_id)
        if appointment:
            await self.session.delete(appointment)
            await self.session.commit()
            return True
        return False
