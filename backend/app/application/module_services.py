import csv
from io import StringIO
from uuid import UUID

from fastapi import HTTPException, UploadFile, status

from app.application.schemas import CampaignCreate, CampaignUpdate, ContactCreate, ContactUpdate, IntegrationConnect, MakeScenarioTrigger, SegmentCreate, TagCreate
from app.core.security import Principal, Role, require_tenant_access
from app.domain.enums import CampaignStatus, IntegrationProvider
from app.infrastructure.integrations.make import MakeClient
from app.infrastructure.integrations.twilio import TwilioClient
from app.infrastructure.integrations.vapi import VapiClient
from app.infrastructure.repositories.campaigns import SqlAlchemyCampaignRepository
from app.infrastructure.repositories.contacts import SqlAlchemyContactRepository
from app.infrastructure.repositories.integrations import SqlAlchemyIntegrationRepository

WRITE_ROLES = {Role.SUPER_ADMIN, Role.TENANT_ADMIN, Role.MANAGER}
CALL_ROLES = {Role.SUPER_ADMIN, Role.TENANT_ADMIN, Role.MANAGER, Role.AGENT}

class ContactService:
    def __init__(self, contacts: SqlAlchemyContactRepository):
        self.contacts = contacts

    async def list_contacts(self, user: Principal, tenant_id: str, q: str | None, tag_id: str | None, source: str | None):
        require_tenant_access(user, tenant_id)
        return await self.contacts.list(tenant_id, q=q, tag_id=tag_id, source=source)

    async def create_contact(self, user: Principal, tenant_id: str, data: ContactCreate):
        self._can_write(user, tenant_id)
        try:
            return await self.contacts.create(tenant_id, data)
        except ValueError as exc:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc)) from exc

    async def update_contact(self, user: Principal, tenant_id: str, contact_id: UUID, data: ContactUpdate):
        self._can_write(user, tenant_id)
        return await self.contacts.update(tenant_id, contact_id, data)

    async def delete_contact(self, user: Principal, tenant_id: str, contact_id: UUID):
        self._can_write(user, tenant_id)
        await self.contacts.delete(tenant_id, contact_id)

    async def import_csv(self, user: Principal, tenant_id: str, file: UploadFile):
        self._can_write(user, tenant_id)
        text = (await file.read()).decode("utf-8-sig")
        reader = csv.DictReader(StringIO(text))
        created = duplicates = 0
        errors: list[str] = []
        for row_number, row in enumerate(reader, start=2):
            try:
                payload = ContactCreate(
                    first_name=row.get("first_name") or row.get("First Name"),
                    last_name=row.get("last_name") or row.get("Last Name"),
                    phone=row.get("phone") or row.get("Phone") or "",
                    email=row.get("email") or row.get("Email"),
                    company=row.get("company") or row.get("Company"),
                    source=file.filename,
                    custom_fields={k: v for k, v in row.items() if k not in {"first_name", "First Name", "last_name", "Last Name", "phone", "Phone", "email", "Email", "company", "Company"}},
                )
                await self.contacts.create(tenant_id, payload)
                created += 1
            except ValueError:
                duplicates += 1
            except Exception as exc:
                errors.append(f"row {row_number}: {exc}")
        return {"created": created, "duplicates": duplicates, "errors": errors}

    async def duplicates(self, user: Principal, tenant_id: str):
        require_tenant_access(user, tenant_id)
        return await self.contacts.duplicates(tenant_id)

    async def create_tag(self, user: Principal, tenant_id: str, data: TagCreate):
        self._can_write(user, tenant_id)
        return await self.contacts.create_tag(tenant_id, data)

    async def list_tags(self, user: Principal, tenant_id: str):
        require_tenant_access(user, tenant_id)
        return await self.contacts.list_tags(tenant_id)

    async def create_segment(self, user: Principal, tenant_id: str, data: SegmentCreate):
        self._can_write(user, tenant_id)
        return await self.contacts.create_segment(tenant_id, data)

    async def list_segments(self, user: Principal, tenant_id: str):
        require_tenant_access(user, tenant_id)
        return await self.contacts.list_segments(tenant_id)

    def _can_write(self, user: Principal, tenant_id: str) -> None:
        require_tenant_access(user, tenant_id)
        if user.role not in WRITE_ROLES:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Cannot manage contacts")

class CampaignService:
    def __init__(self, campaigns: SqlAlchemyCampaignRepository):
        self.campaigns = campaigns

    async def list_campaigns(self, user: Principal, tenant_id: str):
        require_tenant_access(user, tenant_id)
        return await self.campaigns.list(tenant_id)

    async def create_campaign(self, user: Principal, tenant_id: str, data: CampaignCreate):
        self._can_manage(user, tenant_id)
        return await self.campaigns.create(tenant_id, data)

    async def update_campaign(self, user: Principal, tenant_id: str, campaign_id: UUID, data: CampaignUpdate):
        self._can_manage(user, tenant_id)
        return await self.campaigns.update(tenant_id, campaign_id, data)

    async def delete_campaign(self, user: Principal, tenant_id: str, campaign_id: UUID):
        self._can_manage(user, tenant_id)
        await self.campaigns.delete(tenant_id, campaign_id)

    async def get_campaign_contact_ids(self, user: Principal, tenant_id: str, campaign_id: UUID):
        require_tenant_access(user, tenant_id)
        return await self.campaigns.get_contact_ids(tenant_id, campaign_id)

    async def pause(self, user: Principal, tenant_id: str, campaign_id: UUID):
        self._can_manage(user, tenant_id)
        return await self.campaigns.set_status(tenant_id, campaign_id, CampaignStatus.PAUSED)

    async def resume(self, user: Principal, tenant_id: str, campaign_id: UUID):
        self._can_manage(user, tenant_id)
        return await self.campaigns.set_status(tenant_id, campaign_id, CampaignStatus.RUNNING)

    async def cancel(self, user: Principal, tenant_id: str, campaign_id: UUID):
        self._can_manage(user, tenant_id)
        return await self.campaigns.set_status(tenant_id, campaign_id, CampaignStatus.CANCELED)

    async def clone(self, user: Principal, tenant_id: str, campaign_id: UUID):
        self._can_manage(user, tenant_id)
        return await self.campaigns.clone(tenant_id, campaign_id)

    async def launch_now(self, user: Principal, tenant_id: str, campaign_id: UUID, background_tasks=None):
        """Start dialing immediately. Dials directly via Vapi in the background
        of this request — does NOT depend on a separate Celery worker/broker,
        since that infra often isn't deployed. Skips numbers on the DNC list."""
        self._can_manage(user, tenant_id)
        campaign = await self.campaigns.set_status(tenant_id, campaign_id, CampaignStatus.RUNNING)
        if background_tasks is not None:
            background_tasks.add_task(_dial_campaign_now, str(campaign_id), tenant_id)
        else:
            import asyncio
            asyncio.create_task(_dial_campaign_now(str(campaign_id), tenant_id))
        return campaign

    def _can_manage(self, user: Principal, tenant_id: str) -> None:
        require_tenant_access(user, tenant_id)
        if user.role not in WRITE_ROLES:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Cannot manage campaigns")

class IntegrationService:
    def __init__(self, integrations: SqlAlchemyIntegrationRepository):
        self.integrations = integrations

    async def list_integrations(self, user: Principal, tenant_id: str):
        require_tenant_access(user, tenant_id)
        return await self.integrations.list(tenant_id)

    async def connect(self, user: Principal, tenant_id: str, provider: IntegrationProvider, data: IntegrationConnect):
        self._can_manage(user, tenant_id)
        return await self.integrations.connect(tenant_id, provider, data)

    async def disconnect(self, user: Principal, tenant_id: str, provider: IntegrationProvider):
        self._can_manage(user, tenant_id)
        return await self.integrations.disconnect(tenant_id, provider)

    async def delete_profile(self, user: Principal, tenant_id: str, name: str, owner_user_id: str | None):
        require_tenant_access(user, tenant_id)
        if user.role != Role.SUPER_ADMIN:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only superadmin can delete a setup profile")
        deleted = await self.integrations.delete_profile(tenant_id, name, owner_user_id)
        if deleted == 0:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Setup profile not found")
        return {"ok": True, "deleted_connections": deleted}

    async def refresh_vapi_assistants(self, user: Principal, tenant_id: str):
        self._can_manage(user, tenant_id)
        assistants = await VapiClient().fetch_assistants()
        assets = [{"external_id": item.get("id"), "label": item.get("name") or item.get("id"), "payload": item} for item in assistants if item.get("id")]
        return await self.integrations.upsert_assets(tenant_id, IntegrationProvider.VAPI, assets)

    async def refresh_twilio_numbers(self, user: Principal, tenant_id: str):
        self._can_manage(user, tenant_id)
        numbers = await TwilioClient().fetch_phone_numbers()
        assets = [{"external_id": item.get("sid"), "label": item.get("phone_number") or item.get("friendly_name") or item.get("sid"), "payload": item} for item in numbers if item.get("sid")]
        return await self.integrations.upsert_assets(tenant_id, IntegrationProvider.TWILIO, assets)

    async def register_make_webhook(self, user: Principal, tenant_id: str, data: IntegrationConnect):
        self._can_manage(user, tenant_id)
        return await self.integrations.connect(tenant_id, IntegrationProvider.MAKE, data)

    async def trigger_make_scenario(self, user: Principal, tenant_id: str, data: MakeScenarioTrigger):
        require_tenant_access(user, tenant_id)
        if user.role not in CALL_ROLES:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Cannot trigger scenarios")
        await MakeClient().trigger_workflow(str(data.webhook_url), data.payload)
        return await self.integrations.log_webhook(tenant_id, IntegrationProvider.MAKE, "outbound", data.payload, 202, "scenario.triggered")

    async def assets(self, user: Principal, tenant_id: str, provider: IntegrationProvider):
        require_tenant_access(user, tenant_id)
        return await self.integrations.list_assets(tenant_id, provider)

    async def webhook_logs(self, user: Principal, tenant_id: str, provider: IntegrationProvider | None):
        require_tenant_access(user, tenant_id)
        return await self.integrations.list_webhook_logs(tenant_id, provider)

    def _can_manage(self, user: Principal, tenant_id: str) -> None:
        require_tenant_access(user, tenant_id)
        if user.role not in {Role.SUPER_ADMIN, Role.TENANT_ADMIN}:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Cannot manage integrations")


async def _dial_campaign_now(campaign_id: str, tenant_id: str) -> None:
    """Runs in the background after 'Start Now' — dials every contact
    attached to the campaign via Vapi directly (no Celery dependency)."""
    import structlog
    from sqlalchemy import select
    from app.domain.enums import CallStatus, CampaignStatus
    from app.infrastructure.db.models import CallModel, CampaignContactModel, CampaignModel, ContactModel, DncListModel
    from app.infrastructure.db.session import SessionLocal
    from app.infrastructure.integrations.vapi import VapiClient

    log = structlog.get_logger()
    vapi = VapiClient()

    async with SessionLocal() as session:
        campaign = await session.get(CampaignModel, campaign_id)
        if not campaign:
            log.warning("campaign.launch_now.not_found", campaign_id=campaign_id)
            return
        if not campaign.vapi_assistant_id:
            log.warning("campaign.launch_now.no_assistant", campaign_id=campaign_id)
            campaign.status = CampaignStatus.COMPLETED
            await session.commit()
            return

        from app.infrastructure.db.models import AssistantAssignmentModel
        from_number = campaign.twilio_phone_number
        if not from_number:
            assignment_result = await session.execute(
                select(AssistantAssignmentModel.phone_number).where(
                    AssistantAssignmentModel.tenant_id == tenant_id,
                    AssistantAssignmentModel.assistant_external_id == campaign.vapi_assistant_id,
                ).limit(1)
            )
            from_number = assignment_result.scalar_one_or_none()

        contacts_result = await session.execute(
            select(ContactModel)
            .join(CampaignContactModel, CampaignContactModel.contact_id == ContactModel.id)
            .where(CampaignContactModel.campaign_id == campaign_id)
        )
        contacts = contacts_result.scalars().all()

        dnc_result = await session.execute(select(DncListModel.phone).where(DncListModel.tenant_id == tenant_id))
        dnc_phones = {row[0] for row in dnc_result.all()}

        queued = 0
        for contact in contacts:
            if contact.phone in dnc_phones:
                continue
            call = CallModel(
                tenant_id=tenant_id,
                campaign_id=campaign_id,
                contact_id=contact.id,
                customer_phone=contact.phone,
                assistant_id=campaign.vapi_assistant_id,
                from_phone_number=from_number,
                status=CallStatus.QUEUED,
            )
            session.add(call)
            await session.flush()
            try:
                provider_call_id = await vapi.start_call(
                    contact.phone, campaign.vapi_assistant_id,
                    {"call_id": str(call.id), "campaign_id": campaign_id},
                )
                call.provider_call_id = provider_call_id
                call.status = CallStatus.IN_PROGRESS
                queued += 1
            except Exception as exc:
                call.status = CallStatus.FAILED
                log.warning("campaign.launch_now.dial_failed", contact_id=str(contact.id), error=str(exc))
            await session.commit()

        if queued == 0:
            campaign.status = CampaignStatus.COMPLETED
            await session.commit()
        log.info("campaign.launch_now.done", campaign_id=campaign_id, queued=queued)
