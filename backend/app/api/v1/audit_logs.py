from typing import Annotated
from fastapi import APIRouter, Depends
from sqlalchemy import select
from app.api.deps import SessionDep
from app.application.schemas import AuditLogRead
from app.infrastructure.db.models import AuditLogModel
from app.core.security import CurrentUser, require_tenant_access

router = APIRouter(prefix="/tenants/{tenant_id}/audit-logs", tags=["audit-logs"])

@router.get("", response_model=list[AuditLogRead])
async def list_audit_logs(
    tenant_id: str,
    user: CurrentUser,
    session: SessionDep,
    resource_type: str | None = None,
    limit: int = 100
):
    require_tenant_access(user, tenant_id)
    
    stmt = select(AuditLogModel).where(AuditLogModel.tenant_id == tenant_id)
    if resource_type:
        stmt = stmt.where(AuditLogModel.resource_type == resource_type)
    
    stmt = stmt.order_by(AuditLogModel.created_at.desc()).limit(limit)
    result = await session.execute(stmt)
    return result.scalars().all()
