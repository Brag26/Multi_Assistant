from datetime import UTC, datetime
from typing import List
from uuid import UUID
from sqlalchemy import delete, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.application.schemas import IntegrationConnect
from app.domain.enums import IntegrationProvider
from app.infrastructure.db.models import IntegrationAssetModel, IntegrationModel, WebhookLogModel

class SqlAlchemyIntegrationRepository:
    def __init__(self, session: AsyncSession):
        self.session = session

    async def list(self, tenant_id: str):
        result = await self.session.execute(select(IntegrationModel).where(IntegrationModel.tenant_id == tenant_id).order_by(IntegrationModel.created_at.desc()))
        return result.scalars().all()

    async def connect(self, tenant_id: str, provider: IntegrationProvider, data: IntegrationConnect):
        merged_config = {
            **data.config,
            **({"api_key": data.api_key} if data.api_key else {}),
            **({"account_sid": data.account_sid} if data.account_sid else {}),
            **({"auth_token": data.auth_token} if data.auth_token else {}),
            "webhook_url": str(data.webhook_url) if data.webhook_url else None,
        }
        profile_name = data.name or provider.value.title()

        # Upsert: if this exact profile (same name + owner) already has an
        # active connection for this provider, update it in place instead of
        # creating a duplicate row — this is what makes a saved setup editable.
        existing_result = await self.session.execute(
            select(IntegrationModel).where(
                IntegrationModel.tenant_id == tenant_id,
                IntegrationModel.provider == provider,
                IntegrationModel.name == profile_name,
                IntegrationModel.owner_user_id == data.owner_user_id,
                IntegrationModel.disconnected_at.is_(None),
            )
        )
        existing = existing_result.scalar_one_or_none()
        if existing:
            existing.config = merged_config
            existing.connected_at = datetime.now(UTC)
            await self.session.commit()
            await self.session.refresh(existing)
            return existing

        integration = IntegrationModel(
            tenant_id=tenant_id,
            provider=provider,
            name=profile_name,
            owner_user_id=data.owner_user_id,
            config=merged_config,
            secret_ref=f"{tenant_id}/{provider.value}",
            connected_at=datetime.now(UTC),
            disconnected_at=None,
        )
        self.session.add(integration)
        await self.session.commit()
        await self.session.refresh(integration)
        return integration

    async def delete_profile(self, tenant_id: str, name: str, owner_user_id: str | None):
        """Hard-delete every provider connection saved under one profile name
        (e.g. deleting "Setup 2" removes its Vapi row, Twilio row, etc. together)."""
        result = await self.session.execute(
            select(IntegrationModel).where(
                IntegrationModel.tenant_id == tenant_id,
                IntegrationModel.name == name,
                IntegrationModel.owner_user_id == owner_user_id,
            )
        )
        rows = result.scalars().all()
        for row in rows:
            await self.session.delete(row)
        await self.session.commit()
        return len(rows)

    async def disconnect(self, tenant_id: str, provider: IntegrationProvider):
        result = await self.session.execute(select(IntegrationModel).where(IntegrationModel.tenant_id == tenant_id, IntegrationModel.provider == provider, IntegrationModel.disconnected_at.is_(None)).order_by(IntegrationModel.created_at.desc()))
        integration = result.scalars().first()
        if integration:
            integration.disconnected_at = datetime.now(UTC)
            await self.session.commit()
            await self.session.refresh(integration)
        return integration

    async def upsert_assets(self, tenant_id: str, provider: IntegrationProvider, assets: List[dict]):
        for asset in assets:
            stmt = insert(IntegrationAssetModel).values(
                tenant_id=tenant_id,
                provider=provider,
                external_id=asset["external_id"],
                label=asset["label"],
                payload=asset.get("payload", {}),
                synced_at=datetime.now(UTC),
            ).on_conflict_do_update(
                constraint="uq_integration_assets_external",
                set_={"label": asset["label"], "payload": asset.get("payload", {}), "synced_at": datetime.now(UTC)},
            )
            await self.session.execute(stmt)
        await self.session.commit()
        return await self.list_assets(tenant_id, provider)

    async def list_assets(self, tenant_id: str, provider: IntegrationProvider):
        result = await self.session.execute(select(IntegrationAssetModel).where(IntegrationAssetModel.tenant_id == tenant_id, IntegrationAssetModel.provider == provider).order_by(IntegrationAssetModel.label))
        return result.scalars().all()

    async def log_webhook(self, tenant_id: str | None, provider: IntegrationProvider, direction: str, payload: dict, status_code: int | None = None, event_type: str | None = None):
        log = WebhookLogModel(tenant_id=tenant_id, provider=provider, direction=direction, payload=payload, status_code=status_code, event_type=event_type)
        self.session.add(log)
        await self.session.commit()
        await self.session.refresh(log)
        return log

    async def list_webhook_logs(self, tenant_id: str, provider: IntegrationProvider | None = None):
        stmt = select(WebhookLogModel).where(WebhookLogModel.tenant_id == tenant_id)
        if provider:
            stmt = stmt.where(WebhookLogModel.provider == provider)
        result = await self.session.execute(stmt.order_by(WebhookLogModel.created_at.desc()))
        return result.scalars().all()
