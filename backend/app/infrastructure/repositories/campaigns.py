from typing import List
from uuid import UUID
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.application.schemas import CampaignCreate, CampaignUpdate
from app.domain.enums import CampaignStatus
from app.infrastructure.db.models import CampaignContactModel, CampaignModel

class SqlAlchemyCampaignRepository:
    def __init__(self, session: AsyncSession):
        self.session = session

    async def list(self, tenant_id: str):
        result = await self.session.execute(select(CampaignModel).where(CampaignModel.tenant_id == tenant_id).order_by(CampaignModel.created_at.desc()))
        return result.scalars().all()

    async def create(self, tenant_id: str, data: CampaignCreate):
        campaign = CampaignModel(tenant_id=tenant_id, **data.model_dump(exclude={"contact_ids"}))
        self.session.add(campaign)
        await self.session.flush()
        await self.assign_contacts(campaign.id, data.contact_ids, commit=False)
        await self.session.commit()
        await self.session.refresh(campaign)
        return campaign

    async def update(self, tenant_id: str, campaign_id: UUID, data: CampaignUpdate):
        campaign = await self.get(tenant_id, campaign_id)
        values = data.model_dump(exclude_unset=True, exclude={"contact_ids"})
        for key, value in values.items():
            setattr(campaign, key, value)
        if data.contact_ids is not None:
            await self.assign_contacts(campaign.id, data.contact_ids, commit=False)
        await self.session.commit()
        await self.session.refresh(campaign)
        return campaign

    async def get(self, tenant_id: str, campaign_id: UUID):
        result = await self.session.execute(select(CampaignModel).where(CampaignModel.tenant_id == tenant_id, CampaignModel.id == str(campaign_id)))
        campaign = result.scalar_one_or_none()
        if campaign is None:
            raise LookupError("Campaign not found")
        return campaign

    async def set_status(self, tenant_id: str, campaign_id: UUID, status: CampaignStatus):
        campaign = await self.get(tenant_id, campaign_id)
        campaign.status = status
        await self.session.commit()
        await self.session.refresh(campaign)
        return campaign

    async def clone(self, tenant_id: str, campaign_id: UUID):
        source = await self.get(tenant_id, campaign_id)
        clone = CampaignModel(
            tenant_id=tenant_id,
            name=f"{source.name} Copy",
            description=source.description,
            status=CampaignStatus.DRAFT,
            vapi_assistant_id=source.vapi_assistant_id,
            twilio_phone_number=source.twilio_phone_number,
            make_webhook_url=source.make_webhook_url,
            scheduled_at=source.scheduled_at,
            config=source.config,
        )
        self.session.add(clone)
        await self.session.flush()
        contacts = await self.session.execute(select(CampaignContactModel.contact_id).where(CampaignContactModel.campaign_id == str(campaign_id)))
        await self.assign_contacts(clone.id, [UUID(c) for c in contacts.scalars().all()], commit=False)
        await self.session.commit()
        await self.session.refresh(clone)
        return clone

    async def assign_contacts(self, campaign_id: str, contact_ids: List[UUID], commit: bool = True) -> None:
        await self.session.execute(delete(CampaignContactModel).where(CampaignContactModel.campaign_id == campaign_id))
        for contact_id in contact_ids:
            self.session.add(CampaignContactModel(campaign_id=campaign_id, contact_id=str(contact_id)))
        if commit:
            await self.session.commit()
