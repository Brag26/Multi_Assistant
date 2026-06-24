"""
api/v1/approval.py — Superadmin approval flow for new users.
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import CurrentUser, Role, require_role
from app.infrastructure.db.session import get_session

router = APIRouter(prefix="/admin/approvals", tags=["approvals"])

SuperAdmin = require_role(Role.SUPER_ADMIN)


@router.post("/register")
async def register_user(
    body: dict,
    user: CurrentUser,
    db: AsyncSession = Depends(get_session),
):
    """Called on first login — creates membership + approval request if new user."""

    # Check if membership already exists
    existing = await db.execute(
        text("SELECT id FROM memberships WHERE user_id = :uid LIMIT 1"),
        {"uid": user.user_id},
    )
    if existing.fetchone():
        return {"message": "Already registered"}

    # Get or create a default tenant
    tenant = await db.execute(
        text("SELECT id FROM tenants LIMIT 1")
    )
    tenant_row = tenant.fetchone()

    if not tenant_row:
        # Create default tenant
        result = await db.execute(
            text("""
                INSERT INTO tenants (name, slug, settings)
                VALUES ('Default', 'default', '{}')
                RETURNING id
            """)
        )
        tenant_id = str(result.fetchone()[0])
    else:
        tenant_id = str(tenant_row[0])

    # Create membership with pending status
    await db.execute(
        text("""
            INSERT INTO memberships (tenant_id, user_id, email, role, status, display_name)
            VALUES (:tenant_id, :user_id, :email, 'agent', 'pending', :display_name)
            ON CONFLICT (tenant_id, user_id) DO NOTHING
        """),
        {
            "tenant_id": tenant_id,
            "user_id": user.user_id,
            "email": user.email,
            "display_name": body.get("display_name", user.email),
        },
    )

    # Create approval request
    await db.execute(
        text("""
            INSERT INTO approval_requests (user_id, email, display_name, requested_role, tenant_id)
            VALUES (:user_id, :email, :display_name, 'agent', :tenant_id)
            ON CONFLICT DO NOTHING
        """),
        {
            "user_id": user.user_id,
            "email": user.email,
            "display_name": body.get("display_name", user.email),
            "tenant_id": tenant_id,
        },
    )

    await db.commit()
    return {"message": "Registration submitted, awaiting approval"}


@router.get("/me/status")
async def get_my_approval_status(
    user: CurrentUser,
    db: AsyncSession = Depends(get_session),
):
    """Check current user's approval status."""
    result = await db.execute(
        text("""
            SELECT status, role, rejected_reason
            FROM memberships
            WHERE user_id = :uid
            LIMIT 1
        """),
        {"uid": user.user_id},
    )
    row = result.mappings().fetchone()
    if not row:
        return {"status": "pending", "role": None}
    return dict(row)


@router.get("")
async def list_approval_requests(
    user=Depends(SuperAdmin),
    status_filter: str = "pending",
    db: AsyncSession = Depends(get_session),
):
    """List all approval requests. Superadmin only."""
    result = await db.execute(
        text("""
            SELECT id, user_id::text, email, display_name, requested_role,
                   tenant_id::text, status, created_at, reviewed_at, rejected_reason
            FROM approval_requests
            WHERE (:status = 'all' OR status = :status)
            ORDER BY created_at DESC
        """),
        {"status": status_filter},
    )
    rows = result.mappings().all()
    return [dict(r) for r in rows]


@router.post("/{request_id}/approve")
async def approve_user(
    request_id: str,
    body: dict,
    user=Depends(SuperAdmin),
    db: AsyncSession = Depends(get_session),
):
    """Approve a user and assign role. Superadmin only."""
    role = body.get("role", "agent")

    result = await db.execute(
        text("SELECT * FROM approval_requests WHERE id = :id"),
        {"id": request_id},
    )
    req = result.mappings().fetchone()
    if not req:
        raise HTTPException(status_code=404, detail="Request not found")

    await db.execute(
        text("""
            UPDATE approval_requests
            SET status = 'approved', reviewed_by = :reviewer, reviewed_at = now()
            WHERE id = :id
        """),
        {"id": request_id, "reviewer": user.user_id},
    )

    await db.execute(
        text("""
            UPDATE memberships
            SET status = 'approved', role = :role,
                approved_by = :approver, approved_at = now(), updated_at = now()
            WHERE user_id = :user_id
        """),
        {"user_id": req["user_id"], "role": role, "approver": user.user_id},
    )

    await db.commit()
    return {"message": "User approved", "role": role}


@router.post("/{request_id}/reject")
async def reject_user(
    request_id: str,
    body: dict,
    user=Depends(SuperAdmin),
    db: AsyncSession = Depends(get_session),
):
    """Reject a user. Superadmin only."""
    reason = body.get("reason", "")

    result = await db.execute(
        text("SELECT * FROM approval_requests WHERE id = :id"),
        {"id": request_id},
    )
    req = result.mappings().fetchone()
    if not req:
        raise HTTPException(status_code=404, detail="Request not found")

    await db.execute(
        text("""
            UPDATE approval_requests
            SET status = 'rejected', reviewed_by = :reviewer,
                reviewed_at = now(), rejected_reason = :reason
            WHERE id = :id
        """),
        {"id": request_id, "reviewer": user.user_id, "reason": reason},
    )

    await db.execute(
        text("""
            UPDATE memberships
            SET status = 'rejected', rejected_reason = :reason, updated_at = now()
            WHERE user_id = :user_id
        """),
        {"user_id": req["user_id"], "reason": reason},
    )

    await db.commit()
    return {"message": "User rejected"}
