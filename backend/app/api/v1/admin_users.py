"""
api/v1/admin_users.py — Superadmin user management: create resellers & clients.
"""
import os
import httpx
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import CurrentUser, Role, require_role
from app.infrastructure.db.session import get_session

router = APIRouter(prefix="/admin/users", tags=["admin-users"])

SuperAdmin = require_role(Role.SUPER_ADMIN)

SUPABASE_URL = os.getenv("SUPABASE_URL", "")
SUPABASE_SERVICE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")


async def create_supabase_user(email: str, password: str, display_name: str) -> str:
    """Create a user in Supabase Auth using service role key."""
    async with httpx.AsyncClient() as client:
        res = await client.post(
            f"{SUPABASE_URL}/auth/v1/admin/users",
            headers={
                "apikey": SUPABASE_SERVICE_KEY,
                "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}",
                "Content-Type": "application/json",
            },
            json={
                "email": email,
                "password": password,
                "email_confirm": True,
                "user_metadata": {"full_name": display_name},
            },
        )
        if res.status_code not in (200, 201):
            raise HTTPException(status_code=400, detail=res.json().get("message", "Failed to create user"))
        return res.json()["id"]


@router.get("")
async def list_users(
    user=Depends(SuperAdmin),
    db: AsyncSession = Depends(get_session),
):
    """List all users with their roles. Superadmin only."""
    result = await db.execute(
        text("""
            SELECT
                m.user_id::text as id,
                m.email,
                m.display_name,
                m.role,
                m.status,
                m.created_at,
                m.tenant_id::text
            FROM memberships m
            ORDER BY m.created_at DESC
        """)
    )
    rows = result.mappings().all()
    return [dict(r) for r in rows]


@router.post("")
async def create_user(
    body: dict,
    user=Depends(SuperAdmin),
    db: AsyncSession = Depends(get_session),
):
    """Create a new reseller or client user. Superadmin only."""
    email = body.get("email", "").strip()
    password = body.get("password", "")
    display_name = body.get("display_name", email)
    role = body.get("role", "agent")

    if not email or not password:
        raise HTTPException(status_code=400, detail="Email and password are required")

    if len(password) < 8:
        raise HTTPException(status_code=400, detail="Password must be at least 8 characters")

    valid_roles = ["super_admin", "tenant_admin", "manager", "agent", "viewer"]
    if role not in valid_roles:
        raise HTTPException(status_code=400, detail=f"Invalid role. Must be one of: {valid_roles}")

    # Check if email already exists
    existing = await db.execute(
        text("SELECT id FROM memberships WHERE email = :email LIMIT 1"),
        {"email": email},
    )
    if existing.fetchone():
        raise HTTPException(status_code=400, detail="A user with this email already exists")

    # Get or create default tenant
    tenant = await db.execute(text("SELECT id FROM tenants LIMIT 1"))
    tenant_row = tenant.fetchone()
    if not tenant_row:
        result = await db.execute(
            text("INSERT INTO tenants (name, slug, settings) VALUES ('Default', 'default', '{}') RETURNING id")
        )
        tenant_id = str(result.fetchone()[0])
    else:
        tenant_id = str(tenant_row[0])

    # Create user in Supabase Auth
    new_user_id = await create_supabase_user(email, password, display_name)

    # Create membership (auto-approved since superadmin created it)
    await db.execute(
        text("""
            INSERT INTO memberships
              (tenant_id, user_id, email, role, status, display_name, approved_by, approved_at)
            VALUES
              (:tenant_id, :user_id, :email, :role, 'approved', :display_name, :approver, now())
        """),
        {
            "tenant_id": tenant_id,
            "user_id": new_user_id,
            "email": email,
            "role": role,
            "display_name": display_name,
            "approver": user.user_id,
        },
    )

    # Also create an approval request as approved
    await db.execute(
        text("""
            INSERT INTO approval_requests
              (user_id, email, display_name, requested_role, tenant_id, status, reviewed_by, reviewed_at)
            VALUES
              (:user_id, :email, :display_name, :role, :tenant_id, 'approved', :approver, now())
        """),
        {
            "user_id": new_user_id,
            "email": email,
            "display_name": display_name,
            "role": role,
            "tenant_id": tenant_id,
            "approver": user.user_id,
        },
    )

    await db.commit()
    return {"message": "User created successfully", "user_id": new_user_id, "email": email, "role": role}


@router.patch("/{user_id}/role")
async def update_user_role(
    user_id: str,
    body: dict,
    user=Depends(SuperAdmin),
    db: AsyncSession = Depends(get_session),
):
    """Update a user's role. Superadmin only."""
    new_role = body.get("role")
    valid_roles = ["super_admin", "tenant_admin", "manager", "agent", "viewer"]
    if new_role not in valid_roles:
        raise HTTPException(status_code=400, detail="Invalid role")

    await db.execute(
        text("UPDATE memberships SET role = :role, updated_at = now() WHERE user_id = :uid"),
        {"role": new_role, "uid": user_id},
    )
    await db.commit()
    return {"message": "Role updated"}


@router.post("/{user_id}/deactivate")
async def deactivate_user(
    user_id: str,
    user=Depends(SuperAdmin),
    db: AsyncSession = Depends(get_session),
):
    """Deactivate a user (set status to rejected). Superadmin only."""
    await db.execute(
        text("UPDATE memberships SET status = 'rejected', updated_at = now() WHERE user_id = :uid"),
        {"uid": user_id},
    )
    await db.commit()
    return {"message": "User deactivated"}