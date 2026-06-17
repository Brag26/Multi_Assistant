import re
from typing import List
from uuid import UUID
from sqlalchemy import delete, func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.application.schemas import ContactCreate, ContactUpdate, SegmentCreate, TagCreate
from app.infrastructure.db.models import ContactModel, ContactTagModel, SegmentModel, TagModel

PHONE_RE = re.compile(r"\D+")

def duplicate_key(phone: str, email: str | None = None) -> str:
    normalized_phone = PHONE_RE.sub("", phone)
    return (email or normalized_phone).strip().lower()

class SqlAlchemyContactRepository:
    def __init__(self, session: AsyncSession):
        self.session = session

    async def list(self, tenant_id: str, q: str | None = None, tag_id: str | None = None, source: str | None = None):
        stmt = select(ContactModel).where(ContactModel.tenant_id == tenant_id)
        if q:
            term = f"%{q.lower()}%"
            stmt = stmt.where(or_(func.lower(ContactModel.first_name).like(term), func.lower(ContactModel.last_name).like(term), func.lower(ContactModel.email).like(term), ContactModel.phone.like(f"%{q}%")))
        if source:
            stmt = stmt.where(ContactModel.source == source)
        if tag_id:
            stmt = stmt.join(ContactTagModel, ContactTagModel.contact_id == ContactModel.id).where(ContactTagModel.tag_id == tag_id)
        result = await self.session.execute(stmt.order_by(ContactModel.created_at.desc()))
        return result.scalars().all()

    async def create(self, tenant_id: str, data: ContactCreate):
        payload = data.model_dump(exclude={"tag_ids"})
        contact = ContactModel(tenant_id=tenant_id, duplicate_key=duplicate_key(data.phone, data.email), **payload)
        self.session.add(contact)
        try:
            await self.session.flush()
            await self._sync_tags(contact.id, data.tag_ids)
            await self.session.commit()
        except IntegrityError:
            await self.session.rollback()
            raise ValueError("Duplicate contact")
        await self.session.refresh(contact)
        return contact

    async def update(self, tenant_id: str, contact_id: UUID, data: ContactUpdate):
        contact = await self.get(tenant_id, contact_id)
        values = data.model_dump(exclude_unset=True, exclude={"tag_ids"})
        for key, value in values.items():
            setattr(contact, key, value)
        if contact.phone:
            contact.duplicate_key = duplicate_key(contact.phone, contact.email)
        if data.tag_ids is not None:
            await self._sync_tags(contact.id, data.tag_ids)
        await self.session.commit()
        await self.session.refresh(contact)
        return contact

    async def delete(self, tenant_id: str, contact_id: UUID) -> None:
        await self.session.execute(delete(ContactModel).where(ContactModel.tenant_id == tenant_id, ContactModel.id == str(contact_id)))
        await self.session.commit()

    async def get(self, tenant_id: str, contact_id: UUID):
        result = await self.session.execute(select(ContactModel).where(ContactModel.tenant_id == tenant_id, ContactModel.id == str(contact_id)))
        contact = result.scalar_one_or_none()
        if contact is None:
            raise LookupError("Contact not found")
        return contact

    async def duplicates(self, tenant_id: str):
        grouped = await self.session.execute(select(ContactModel.duplicate_key, func.count(ContactModel.id)).where(ContactModel.tenant_id == tenant_id).group_by(ContactModel.duplicate_key).having(func.count(ContactModel.id) > 1))
        output = []
        for key, count in grouped.all():
            contacts = await self.session.execute(select(ContactModel).where(ContactModel.tenant_id == tenant_id, ContactModel.duplicate_key == key))
            output.append({"duplicate_key": key, "count": count, "contacts": contacts.scalars().all()})
        return output

    async def create_tag(self, tenant_id: str, data: TagCreate):
        tag = TagModel(tenant_id=tenant_id, **data.model_dump())
        self.session.add(tag)
        await self.session.commit()
        await self.session.refresh(tag)
        return tag

    async def list_tags(self, tenant_id: str):
        result = await self.session.execute(select(TagModel).where(TagModel.tenant_id == tenant_id).order_by(TagModel.name))
        return result.scalars().all()

    async def create_segment(self, tenant_id: str, data: SegmentCreate):
        segment = SegmentModel(tenant_id=tenant_id, **data.model_dump())
        self.session.add(segment)
        await self.session.commit()
        await self.session.refresh(segment)
        return segment

    async def list_segments(self, tenant_id: str):
        result = await self.session.execute(select(SegmentModel).where(SegmentModel.tenant_id == tenant_id).order_by(SegmentModel.created_at.desc()))
        return result.scalars().all()

    async def _sync_tags(self, contact_id: str, tag_ids: List[UUID]) -> None:
        await self.session.execute(delete(ContactTagModel).where(ContactTagModel.contact_id == contact_id))
        for tag_id in tag_ids:
            self.session.add(ContactTagModel(contact_id=contact_id, tag_id=str(tag_id)))
