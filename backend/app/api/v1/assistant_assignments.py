"""api/v1/assistant_assignments.py — who can use which Vapi assistant.

Hierarchy:
- Superadmin: sees every synced Vapi assistant, assigns to anyone (reseller or client).
- Reseller (tenant_admin): sees only assistants assigned to them; can re-assign
  those (and only those) to their own clients.
- Client (agent/manager/viewer): sees only assistants assigned directly to them.
"""
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_db_session
from app.core.security import CurrentUser, Role, require_tenant_access
from app.domain.enums import IntegrationProvider
from app.infrastructure.db.models import AssistantAssignmentModel, IntegrationAssetModel

router = APIRouter(prefix="/tenants/{tenant_id}/assistants", tags=["assistant-assignments"])


async def _get_display_name(session: AsyncSession, user_id: str) -> dict:
    result = await session.execute(
        text("SELECT email, display_name, role FROM memberships WHERE user_id = :uid LIMIT 1"),
        {"uid": user_id},
    )
    row = result.mappings().fetchone()
    return dict(row) if row else {"email": None, "display_name": None, "role": None}


@router.get("")
async def list_assistants_for_me(
    tenant_id: str,
    user: CurrentUser,
    session: AsyncSession = Depends(get_db_session),
):
    """Role-aware: superadmin gets every synced assistant + who has access;
    everyone else gets only the assistants assigned to them."""
    require_tenant_access(user, tenant_id)

    if user.role == Role.SUPER_ADMIN:
        assets_result = await session.execute(
            select(IntegrationAssetModel).where(
                IntegrationAssetModel.tenant_id == tenant_id,
                IntegrationAssetModel.provider == IntegrationProvider.VAPI,
            )
        )
        assets = assets_result.scalars().all()
        assign_result = await session.execute(
            select(AssistantAssignmentModel).where(AssistantAssignmentModel.tenant_id == tenant_id)
        )
        assignments = assign_result.scalars().all()
        by_assistant: dict[str, list] = {}
        for a in assignments:
            by_assistant.setdefault(a.assistant_external_id, []).append(a)

        out = []
        for asset in assets:
            holders = []
            for a in by_assistant.get(asset.external_id, []):
                info = await _get_display_name(session, a.assigned_to_user_id)
                holders.append({
                    "assignment_id": a.id, "user_id": a.assigned_to_user_id,
                    "email": info["email"], "display_name": info["display_name"], "role": info["role"],
                    "phone_number": a.phone_number,
                })
            out.append({
                "external_id": asset.external_id, "label": asset.label,
                "first_message": (asset.payload or {}).get("firstMessage"),
                "model": ((asset.payload or {}).get("model") or {}).get("model"),
                "assigned_to": holders,
            })
        return out

    # Reseller or client: only what's been assigned to them
    result = await session.execute(
        select(AssistantAssignmentModel).where(
            AssistantAssignmentModel.tenant_id == tenant_id,
            AssistantAssignmentModel.assigned_to_user_id == user.user_id,
        )
    )
    return [
        {"external_id": a.assistant_external_id, "label": a.assistant_label, "assignment_id": a.id, "phone_number": a.phone_number}
        for a in result.scalars().all()
    ]


class AssignAssistantRequest(BaseModel):
    assistant_external_id: str
    assistant_label: str
    assigned_to_user_id: str
    phone_number: str | None = None


@router.post("/assign")
async def assign_assistant(
    tenant_id: str,
    body: AssignAssistantRequest,
    user: CurrentUser,
    session: AsyncSession = Depends(get_db_session),
):
    require_tenant_access(user, tenant_id)

    if user.role == Role.SUPER_ADMIN:
        pass  # can assign any assistant to anyone

    elif user.role == Role.TENANT_ADMIN:
        # Must already have this assistant themselves...
        own = await session.execute(
            select(AssistantAssignmentModel).where(
                AssistantAssignmentModel.tenant_id == tenant_id,
                AssistantAssignmentModel.assistant_external_id == body.assistant_external_id,
                AssistantAssignmentModel.assigned_to_user_id == user.user_id,
            )
        )
        if not own.scalar_one_or_none():
            raise HTTPException(status.HTTP_403_FORBIDDEN, "You can only assign assistants that were assigned to you")

        # ...and can only hand it to their own clients
        target = await session.execute(
            text("SELECT created_by::text FROM memberships WHERE user_id = :uid LIMIT 1"),
            {"uid": body.assigned_to_user_id},
        )
        row = target.fetchone()
        if not row or row[0] != user.user_id:
            raise HTTPException(status.HTTP_403_FORBIDDEN, "You can only assign to your own clients")

    else:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Not allowed to assign assistants")

    existing = await session.execute(
        select(AssistantAssignmentModel).where(
            AssistantAssignmentModel.tenant_id == tenant_id,
            AssistantAssignmentModel.assistant_external_id == body.assistant_external_id,
            AssistantAssignmentModel.assigned_to_user_id == body.assigned_to_user_id,
        )
    )
    existing_row = existing.scalar_one_or_none()
    if existing_row:
        if body.phone_number is not None:
            existing_row.phone_number = body.phone_number
            await session.commit()
        return {"ok": True, "note": "already assigned"}

    session.add(AssistantAssignmentModel(
        id=str(uuid4()), tenant_id=tenant_id, assistant_external_id=body.assistant_external_id,
        assistant_label=body.assistant_label, assigned_to_user_id=body.assigned_to_user_id,
        assigned_by_user_id=user.user_id, phone_number=body.phone_number,
    ))
    await session.commit()
    return {"ok": True}


@router.delete("/assign/{assignment_id}")
async def revoke_assistant_assignment(
    tenant_id: str,
    assignment_id: str,
    user: CurrentUser,
    session: AsyncSession = Depends(get_db_session),
):
    require_tenant_access(user, tenant_id)
    result = await session.execute(
        select(AssistantAssignmentModel).where(
            AssistantAssignmentModel.id == assignment_id,
            AssistantAssignmentModel.tenant_id == tenant_id,
        )
    )
    assignment = result.scalar_one_or_none()
    if not assignment:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Assignment not found")

    if user.role == Role.SUPER_ADMIN:
        pass
    elif user.role == Role.TENANT_ADMIN and assignment.assigned_by_user_id == user.user_id:
        pass
    else:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Not allowed to revoke this assignment")

    await session.delete(assignment)
    await session.commit()
    return {"ok": True}


@router.get("/phone-usage")
async def phone_number_usage(
    tenant_id: str,
    user: CurrentUser,
    session: AsyncSession = Depends(get_db_session),
):
    """Call volume and minutes per phone number, so superadmin can see how
    heavily each assigned number is being used."""
    require_tenant_access(user, tenant_id)
    if user.role != Role.SUPER_ADMIN:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Only superadmin can view phone usage")

    result = await session.execute(text("""
        SELECT
            from_phone_number,
            COUNT(*) AS call_count,
            COALESCE(SUM(duration_seconds), 0) AS total_seconds
        FROM voice_calls
        WHERE tenant_id = :tid AND from_phone_number IS NOT NULL
        GROUP BY from_phone_number
        ORDER BY call_count DESC
    """), {"tid": tenant_id})
    rows = result.mappings().all()
    return [
        {
            "phone_number": r["from_phone_number"],
            "call_count": r["call_count"],
            "total_minutes": round((r["total_seconds"] or 0) / 60, 1),
        }
        for r in rows
    ]
