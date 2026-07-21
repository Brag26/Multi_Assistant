"""api/v1/leadgen.py — Apify-powered lead generation.

Connecting the Apify account itself reuses the existing generic integration
connect flow (POST /tenants/{tid}/integrations/apify/connect with api_key).
This router covers running the scraper, checking status, viewing usage, and
importing scraped rows straight into CRM contacts.
"""
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import func, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_db_session
from app.core.security import CurrentUser, Role, require_tenant_access
from app.domain.enums import IntegrationProvider
from app.infrastructure.db.models import ContactModel, IntegrationModel, LeadgenRunModel
from app.infrastructure.integrations.apify import ApifyClient
from app.infrastructure.repositories.contacts import duplicate_key

router = APIRouter(prefix="/tenants/{tenant_id}/leadgen", tags=["leadgen"])


async def _get_apify_client(session: AsyncSession, tenant_id: str) -> ApifyClient:
    result = await session.execute(
        select(IntegrationModel).where(
            IntegrationModel.tenant_id == tenant_id,
            IntegrationModel.provider == IntegrationProvider.APIFY,
            IntegrationModel.disconnected_at.is_(None),
        )
    )
    integration = result.scalars().first()
    if not integration or not integration.config.get("api_key"):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Apify isn't connected yet — connect it from the Setup Wizard first")
    return ApifyClient(integration.config["api_key"])


@router.get("/actors")
async def list_actors(tenant_id: str, user: CurrentUser, session: AsyncSession = Depends(get_db_session)):
    require_tenant_access(user, tenant_id)
    client = await _get_apify_client(session, tenant_id)
    actors = await client.list_actors()
    return [{"id": a.get("id"), "name": a.get("name"), "title": a.get("title")} for a in actors]


class RunActorRequest(BaseModel):
    actor_id: str
    run_input: dict = {}


@router.post("/run")
async def run_actor(
    tenant_id: str,
    body: RunActorRequest,
    user: CurrentUser,
    session: AsyncSession = Depends(get_db_session),
):
    require_tenant_access(user, tenant_id)
    client = await _get_apify_client(session, tenant_id)
    run = await client.run_actor(body.actor_id, body.run_input)

    row = LeadgenRunModel(
        id=str(uuid4()), tenant_id=tenant_id, triggered_by_user_id=user.user_id,
        actor_id=body.actor_id, apify_run_id=run.get("id", ""),
        dataset_id=run.get("defaultDatasetId"), status=run.get("status", "running"),
    )
    session.add(row)
    await session.commit()
    return {"run_id": row.id, "apify_run_id": row.apify_run_id, "status": row.status}


@router.get("/runs")
async def list_runs(tenant_id: str, user: CurrentUser, session: AsyncSession = Depends(get_db_session)):
    """Superadmin sees every run; resellers/clients see only their own."""
    require_tenant_access(user, tenant_id)
    query = select(LeadgenRunModel).where(LeadgenRunModel.tenant_id == tenant_id)
    if user.role != Role.SUPER_ADMIN:
        query = query.where(LeadgenRunModel.triggered_by_user_id == user.user_id)
    query = query.order_by(LeadgenRunModel.started_at.desc()).limit(50)
    result = await session.execute(query)
    return [
        {
            "id": r.id, "actor_id": r.actor_id, "status": r.status, "item_count": r.item_count,
            "compute_units": float(r.compute_units), "imported_contact_count": r.imported_contact_count,
            "started_at": r.started_at, "finished_at": r.finished_at,
        }
        for r in result.scalars().all()
    ]


@router.post("/runs/{run_id}/refresh")
async def refresh_run_status(tenant_id: str, run_id: str, user: CurrentUser, session: AsyncSession = Depends(get_db_session)):
    """Poll Apify for this run's latest status/stats."""
    require_tenant_access(user, tenant_id)
    result = await session.execute(select(LeadgenRunModel).where(LeadgenRunModel.id == run_id, LeadgenRunModel.tenant_id == tenant_id))
    row = result.scalar_one_or_none()
    if not row:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Run not found")
    if user.role != Role.SUPER_ADMIN and row.triggered_by_user_id != user.user_id:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Not your run")

    client = await _get_apify_client(session, tenant_id)
    live = await client.get_run(row.apify_run_id)
    row.status = live.get("status", row.status)
    row.dataset_id = live.get("defaultDatasetId", row.dataset_id)
    stats = live.get("stats") or {}
    if "computeUnits" in stats:
        row.compute_units = stats["computeUnits"]
    if live.get("status") == "SUCCEEDED" and row.dataset_id and row.item_count == 0:
        items = await client.get_dataset_items(row.dataset_id, limit=1000)
        row.item_count = len(items)
    if live.get("finishedAt"):
        from datetime import datetime
        row.finished_at = datetime.fromisoformat(live["finishedAt"].replace("Z", "+00:00"))
    await session.commit()
    return {"id": row.id, "status": row.status, "item_count": row.item_count, "compute_units": float(row.compute_units)}


@router.post("/runs/{run_id}/import")
async def import_run_to_contacts(
    tenant_id: str,
    run_id: str,
    user: CurrentUser,
    session: AsyncSession = Depends(get_db_session),
):
    """Pull the scraped dataset and create/update CRM contacts from it.
    Expects the Apify actor's output rows to have at least a phone-ish field
    (phone/phoneNumber) — rows without one are skipped."""
    require_tenant_access(user, tenant_id)
    result = await session.execute(select(LeadgenRunModel).where(LeadgenRunModel.id == run_id, LeadgenRunModel.tenant_id == tenant_id))
    row = result.scalar_one_or_none()
    if not row or not row.dataset_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Run or dataset not found")
    if user.role != Role.SUPER_ADMIN and row.triggered_by_user_id != user.user_id:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Not your run")

    client = await _get_apify_client(session, tenant_id)
    items = await client.get_dataset_items(row.dataset_id, limit=1000)

    imported = 0
    for item in items:
        phone = item.get("phone") or item.get("phoneNumber") or item.get("phone_number")
        if not phone:
            continue
        email = item.get("email")
        name = item.get("name") or item.get("fullName") or ""
        first, _, last = name.partition(" ")
        contact = ContactModel(
            tenant_id=tenant_id,
            first_name=item.get("firstName") or first or None,
            last_name=item.get("lastName") or last or None,
            phone=phone,
            email=email,
            company=item.get("company") or item.get("companyName"),
            title=item.get("title") or item.get("jobTitle"),
            source=f"apify:{row.actor_id}",
            duplicate_key=duplicate_key(phone, email),
        )
        session.add(contact)
        imported += 1

    row.imported_contact_count = imported
    await session.commit()
    return {"imported": imported}


@router.get("/usage")
async def leadgen_usage(tenant_id: str, user: CurrentUser, session: AsyncSession = Depends(get_db_session)):
    """Run counts / compute units / leads imported — per-user for
    resellers/clients, or a full breakdown by user for superadmin."""
    require_tenant_access(user, tenant_id)

    if user.role == Role.SUPER_ADMIN:
        result = await session.execute(text("""
            SELECT triggered_by_user_id::text as user_id, COUNT(*) as run_count,
                   COALESCE(SUM(compute_units), 0) as total_compute_units,
                   COALESCE(SUM(imported_contact_count), 0) as total_leads_imported
            FROM leadgen_runs WHERE tenant_id = :tid
            GROUP BY triggered_by_user_id ORDER BY run_count DESC
        """), {"tid": tenant_id})
        rows = [dict(r) for r in result.mappings().all()]
        for r in rows:
            info = await session.execute(text("SELECT email, display_name FROM memberships WHERE user_id = :uid LIMIT 1"), {"uid": r["user_id"]})
            m = info.mappings().first()
            r["email"] = m["email"] if m else None
            r["display_name"] = m["display_name"] if m else None
            r["total_compute_units"] = float(r["total_compute_units"])
        return {"by_user": rows}

    result = await session.execute(
        select(
            func.count(LeadgenRunModel.id),
            func.coalesce(func.sum(LeadgenRunModel.compute_units), 0),
            func.coalesce(func.sum(LeadgenRunModel.imported_contact_count), 0),
        ).where(LeadgenRunModel.tenant_id == tenant_id, LeadgenRunModel.triggered_by_user_id == user.user_id)
    )
    run_count, total_compute, total_leads = result.one()
    return {"run_count": run_count, "total_compute_units": float(total_compute), "total_leads_imported": total_leads}
