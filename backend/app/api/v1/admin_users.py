"""
api/v1/admin_users.py — User management for Superadmin and Resellers.

Rules:
- Superadmin: full access, sees all users, can create resellers + clients
- Reseller: can create/delete only their own clients, cannot see other resellers or superadmin accounts
- Import data: only superadmin can view imported files
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
ResellerOrAbove = require_role(Role.TENANT_ADMIN)  # tenant_admin = reseller

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


async def delete_supabase_user(user_id: str) -> None:
    """Delete a user from Supabase Auth using service role key."""
    async with httpx.AsyncClient() as client:
        await client.delete(
            f"{SUPABASE_URL}/auth/v1/admin/users/{user_id}",
            headers={
                "apikey": SUPABASE_SERVICE_KEY,
                "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}",
            },
        )


async def reset_supabase_user_password(user_id: str, new_password: str) -> None:
    """Directly set a new password for a user via Supabase Admin API.
    Used by superadmin to reset a reseller's or client's password on request
    — no email flow, the new password is handed back to superadmin to share."""
    async with httpx.AsyncClient() as client:
        res = await client.put(
            f"{SUPABASE_URL}/auth/v1/admin/users/{user_id}",
            headers={
                "apikey": SUPABASE_SERVICE_KEY,
                "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}",
                "Content-Type": "application/json",
            },
            json={"password": new_password},
        )
        if res.status_code not in (200, 201):
            raise HTTPException(status_code=400, detail=res.json().get("message", "Failed to reset password"))


@router.get("")
async def list_users(
    user: CurrentUser,
    db: AsyncSession = Depends(get_session),
):
    """
    List users based on role:
    - Superadmin: sees ALL users
    - Reseller: sees only their own created clients (created_by = reseller's user_id)
    """
    if user.role == Role.SUPER_ADMIN:
        # Superadmin sees everything
        result = await db.execute(
            text("""
                SELECT
                    m.user_id::text as id,
                    m.email,
                    m.display_name,
                    m.role,
                    m.status,
                    m.created_at,
                    m.tenant_id::text,
                    m.created_by::text
                FROM memberships m
                ORDER BY m.created_at DESC
            """)
        )
    elif user.role == Role.TENANT_ADMIN:
        # Reseller sees only clients they created
        result = await db.execute(
            text("""
                SELECT
                    m.user_id::text as id,
                    m.email,
                    m.display_name,
                    m.role,
                    m.status,
                    m.created_at,
                    m.tenant_id::text,
                    m.created_by::text
                FROM memberships m
                WHERE m.created_by = :creator_id
                  AND m.role = 'agent'
                ORDER BY m.created_at DESC
            """),
            {"creator_id": user.user_id},
        )
    else:
        raise HTTPException(status_code=403, detail="Insufficient role")

    rows = result.mappings().all()
    return [dict(r) for r in rows]


@router.post("")
async def create_user(
    body: dict,
    user: CurrentUser,
    db: AsyncSession = Depends(get_session),
):
    """
    Create a user:
    - Superadmin: can create resellers, clients, managers, viewers
    - Reseller: can only create clients (agents)
    """
    if user.role not in (Role.SUPER_ADMIN, Role.TENANT_ADMIN):
        raise HTTPException(status_code=403, detail="Insufficient role")

    email = body.get("email", "").strip()
    password = body.get("password", "")
    display_name = body.get("display_name", email)
    role = body.get("role", "agent")

    if not email or not password:
        raise HTTPException(status_code=400, detail="Email and password are required")

    if len(password) < 8:
        raise HTTPException(status_code=400, detail="Password must be at least 8 characters")

    # Reseller can only create clients
    if user.role == Role.TENANT_ADMIN:
        if role != "agent":
            raise HTTPException(status_code=403, detail="Resellers can only create client accounts")

    # Superadmin cannot be created by reseller
    if role == "super_admin" and user.role != Role.SUPER_ADMIN:
        raise HTTPException(status_code=403, detail="Only superadmin can create superadmin accounts")

    valid_roles = ["super_admin", "tenant_admin", "manager", "agent", "viewer"]
    if role not in valid_roles:
        raise HTTPException(status_code=400, detail=f"Invalid role")

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

    # Create membership — track who created this user via created_by
    await db.execute(
        text("""
            INSERT INTO memberships
              (tenant_id, user_id, email, role, status, display_name, approved_by, approved_at, created_by)
            VALUES
              (:tenant_id, :user_id, :email, :role, 'approved', :display_name, :approver, now(), :creator)
        """),
        {
            "tenant_id": tenant_id,
            "user_id": new_user_id,
            "email": email,
            "role": role,
            "display_name": display_name,
            "approver": user.user_id,
            "creator": user.user_id,
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


@router.post("/{user_id}/reset-password")
async def reset_user_password(
    user_id: str,
    user: CurrentUser,
    db: AsyncSession = Depends(get_session),
):
    """Superadmin resets any user's password — reseller, client, or another
    superadmin — and gets back a new temporary password to share with them.
    Only superadmin can do this; resellers cannot reset passwords even for
    their own clients."""
    if user.role != Role.SUPER_ADMIN:
        raise HTTPException(status_code=403, detail="Only superadmin can reset passwords")

    result = await db.execute(
        text("SELECT user_id, email FROM memberships WHERE user_id = :uid LIMIT 1"),
        {"uid": user_id},
    )
    target = result.mappings().fetchone()
    if not target:
        raise HTTPException(status_code=404, detail="User not found")

    import secrets
    import string
    alphabet = string.ascii_letters + string.digits
    new_password = "".join(secrets.choice(alphabet) for _ in range(12))

    await reset_supabase_user_password(user_id, new_password)
    return {"ok": True, "email": target["email"], "new_password": new_password}


@router.delete("/{user_id}")
async def delete_user(
    user_id: str,
    user: CurrentUser,
    db: AsyncSession = Depends(get_session),
):
    """
    Delete a user:
    - Superadmin: can delete anyone
    - Reseller: can only delete their own clients
    """
    if user.role not in (Role.SUPER_ADMIN, Role.TENANT_ADMIN):
        raise HTTPException(status_code=403, detail="Insufficient role")

    # Check the target user exists
    result = await db.execute(
        text("SELECT user_id, role, created_by::text FROM memberships WHERE user_id = :uid LIMIT 1"),
        {"uid": user_id},
    )
    target = result.mappings().fetchone()
    if not target:
        raise HTTPException(status_code=404, detail="User not found")

    # Reseller can only delete their own clients
    if user.role == Role.TENANT_ADMIN:
        if target["created_by"] != user.user_id:
            raise HTTPException(status_code=403, detail="You can only delete clients you created")
        if target["role"] != "agent":
            raise HTTPException(status_code=403, detail="Resellers can only delete client accounts")

    # Prevent deleting superadmin
    if target["role"] == "super_admin" and user.role != Role.SUPER_ADMIN:
        raise HTTPException(status_code=403, detail="Cannot delete superadmin account")

    # Delete from Supabase Auth
    await delete_supabase_user(user_id)

    # Delete from memberships
    await db.execute(
        text("DELETE FROM memberships WHERE user_id = :uid"),
        {"uid": user_id},
    )
    await db.commit()
    return {"message": "User deleted successfully"}


@router.post("/{user_id}/deactivate")
async def deactivate_user(
    user_id: str,
    user=Depends(SuperAdmin),
    db: AsyncSession = Depends(get_session),
):
    """Deactivate a user. Superadmin only."""
    await db.execute(
        text("UPDATE memberships SET status = 'rejected', updated_at = now() WHERE user_id = :uid"),
        {"uid": user_id},
    )
    await db.commit()
    return {"message": "User deactivated"}


@router.get("/imports/files")
async def list_imported_files(
    user=Depends(SuperAdmin),
    db: AsyncSession = Depends(get_session),
):
    """List all imported files. Superadmin only."""
    result = await db.execute(
        text("""
            SELECT id, tenant_id::text, file_name, file_type, status, created_at
            FROM import_logs
            ORDER BY created_at DESC
            LIMIT 100
        """)
    )
    rows = result.mappings().all()
    return [dict(r) for r in rows]
