"""api/v1/feature_access.py — superadmin controls which nav features each
reseller/client can see. Default is hidden for tenant_admin/agent roles;
superadmin is always unrestricted.
"""
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_db_session
from app.core.features import ALWAYS_VISIBLE, FEATURE_CATALOG
from app.core.security import CurrentUser, Role, require_role, require_tenant_access
from app.infrastructure.db.models import FeatureAccessModel

router = APIRouter(prefix="/tenants/{tenant_id}/features", tags=["feature-access"])
SuperAdmin = require_role(Role.SUPER_ADMIN)


@router.get("/catalog")
async def get_feature_catalog(tenant_id: str, user=Depends(SuperAdmin)):
    """Full list of gate-able features, for the superadmin's permission editor."""
    return {"features": FEATURE_CATALOG, "always_visible": sorted(ALWAYS_VISIBLE)}


@router.get("/me")
async def get_my_features(tenant_id: str, user: CurrentUser, session: AsyncSession = Depends(get_db_session)):
    """The effective, allowed feature list for the current user. Superadmin
    gets everything; everyone else gets ALWAYS_VISIBLE plus whatever's been
    explicitly granted."""
    require_tenant_access(user, tenant_id)
    if user.role == Role.SUPER_ADMIN:
        return {"features": [f["key"] for f in FEATURE_CATALOG], "unrestricted": True}

    result = await session.execute(
        select(FeatureAccessModel.feature_key).where(
            FeatureAccessModel.tenant_id == tenant_id,
            FeatureAccessModel.user_id == user.user_id,
            FeatureAccessModel.allowed.is_(True),
        )
    )
    granted = {row[0] for row in result.all()}
    return {"features": sorted(ALWAYS_VISIBLE | granted), "unrestricted": False}


@router.get("/accounts")
async def list_accounts_with_features(tenant_id: str, user=Depends(SuperAdmin), session: AsyncSession = Depends(get_db_session)):
    """Every reseller/client with their currently granted feature keys, for
    the superadmin permission-editor table."""
    result = await session.execute(text("""
        SELECT user_id::text as user_id, email, display_name, role
        FROM memberships
        WHERE tenant_id = :tid AND role IN ('tenant_admin', 'agent')
        ORDER BY role, created_at DESC
    """), {"tid": tenant_id})
    accounts = [dict(r) for r in result.mappings().all()]

    fa_result = await session.execute(
        select(FeatureAccessModel).where(FeatureAccessModel.tenant_id == tenant_id, FeatureAccessModel.allowed.is_(True))
    )
    by_user: dict[str, list[str]] = {}
    for row in fa_result.scalars().all():
        by_user.setdefault(row.user_id, []).append(row.feature_key)

    for acct in accounts:
        acct["granted_features"] = by_user.get(acct["user_id"], [])
    return accounts


class SetFeatureRequest(BaseModel):
    user_id: str
    feature_key: str
    allowed: bool


@router.post("/set")
async def set_feature_access(
    tenant_id: str,
    body: SetFeatureRequest,
    user=Depends(SuperAdmin),
    session: AsyncSession = Depends(get_db_session),
):
    if body.feature_key not in {f["key"] for f in FEATURE_CATALOG}:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Unknown feature key")

    result = await session.execute(
        select(FeatureAccessModel).where(
            FeatureAccessModel.tenant_id == tenant_id,
            FeatureAccessModel.user_id == body.user_id,
            FeatureAccessModel.feature_key == body.feature_key,
        )
    )
    row = result.scalar_one_or_none()
    if row:
        row.allowed = body.allowed
        row.granted_by_user_id = user.user_id
    else:
        session.add(FeatureAccessModel(
            tenant_id=tenant_id, user_id=body.user_id, feature_key=body.feature_key,
            allowed=body.allowed, granted_by_user_id=user.user_id,
        ))
    await session.commit()
    return {"ok": True}


class BulkSetFeaturesRequest(BaseModel):
    user_id: str
    feature_keys: list[str]


@router.post("/set-bulk")
async def set_features_bulk(
    tenant_id: str,
    body: BulkSetFeaturesRequest,
    user=Depends(SuperAdmin),
    session: AsyncSession = Depends(get_db_session),
):
    """Replace a user's entire granted-feature set in one call — used by the
    permission editor's checkbox grid so toggling multiple boxes is one save."""
    valid_keys = {f["key"] for f in FEATURE_CATALOG}
    requested = set(body.feature_keys) & valid_keys

    result = await session.execute(
        select(FeatureAccessModel).where(
            FeatureAccessModel.tenant_id == tenant_id,
            FeatureAccessModel.user_id == body.user_id,
        )
    )
    existing = {row.feature_key: row for row in result.scalars().all()}

    for key in requested:
        if key in existing:
            existing[key].allowed = True
            existing[key].granted_by_user_id = user.user_id
        else:
            session.add(FeatureAccessModel(
                tenant_id=tenant_id, user_id=body.user_id, feature_key=key,
                allowed=True, granted_by_user_id=user.user_id,
            ))
    for key, row in existing.items():
        if key not in requested:
            row.allowed = False

    await session.commit()
    return {"ok": True, "granted": sorted(requested)}
