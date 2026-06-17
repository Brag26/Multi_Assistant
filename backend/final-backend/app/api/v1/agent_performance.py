"""
api/v1/agent_performance.py — Per-agent performance metrics.
Tracks calls, conversion, and handle time grouped by the agent
(membership user) who launched or is assigned to each call.
"""
from datetime import UTC, datetime, timedelta
from uuid import UUID

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_db_session
from app.core.security import CurrentUser
from app.infrastructure.db.models import CallModel, MembershipModel

router = APIRouter(prefix="/tenants/{tenant_id}/agent-performance", tags=["agent-performance"])


@router.get("")
async def get_agent_performance(
    tenant_id: str,
    user: CurrentUser,
    days: int = Query(30, ge=1, le=365),
    session: AsyncSession = Depends(get_db_session),
):
    """
    Aggregates call volume, completion rate, qualified rate, and average
    handle time per agent (membership), based on `metadata.assigned_agent_id`
    stored on each CallModel at launch time.
    """
    cutoff = datetime.now(UTC) - timedelta(days=days)

    calls_result = await session.execute(
        select(CallModel).where(
            CallModel.tenant_id == tenant_id,
            CallModel.created_at >= cutoff,
        )
    )
    calls = calls_result.scalars().all()

    members_result = await session.execute(
        select(MembershipModel).where(MembershipModel.tenant_id == tenant_id)
    )
    members = {m.user_id: m for m in members_result.scalars().all()}

    by_agent: dict[str, dict] = {}
    unassigned_calls = 0

    for call in calls:
        agent_id = (call.metadata_ or {}).get("assigned_agent_id")
        if not agent_id:
            unassigned_calls += 1
            continue

        bucket = by_agent.setdefault(agent_id, {
            "agent_id": agent_id,
            "email": members.get(agent_id).email if agent_id in members else "Unknown",
            "total_calls": 0,
            "completed_calls": 0,
            "qualified_calls": 0,
            "total_duration": 0,
        })
        bucket["total_calls"] += 1
        if call.status == "completed":
            bucket["completed_calls"] += 1
        if call.outcome == "qualified":
            bucket["qualified_calls"] += 1
        bucket["total_duration"] += call.duration_seconds or 0

    leaderboard = []
    for agent_id, b in by_agent.items():
        avg_handle = round(b["total_duration"] / b["total_calls"], 1) if b["total_calls"] else 0
        conversion_rate = round(b["qualified_calls"] / b["total_calls"], 4) if b["total_calls"] else 0
        completion_rate = round(b["completed_calls"] / b["total_calls"], 4) if b["total_calls"] else 0
        leaderboard.append({
            "agent_id": agent_id,
            "email": b["email"],
            "total_calls": b["total_calls"],
            "completed_calls": b["completed_calls"],
            "qualified_calls": b["qualified_calls"],
            "completion_rate": completion_rate,
            "conversion_rate": conversion_rate,
            "avg_handle_time_seconds": avg_handle,
        })

    leaderboard.sort(key=lambda x: x["qualified_calls"], reverse=True)

    return {
        "agents": leaderboard,
        "unassigned_calls": unassigned_calls,
        "period_days": days,
    }


@router.get("/{agent_id}")
async def get_agent_detail(
    tenant_id: str,
    agent_id: str,
    user: CurrentUser,
    days: int = Query(30, ge=1, le=365),
    session: AsyncSession = Depends(get_db_session),
):
    cutoff = datetime.now(UTC) - timedelta(days=days)
    calls_result = await session.execute(
        select(CallModel).where(
            CallModel.tenant_id == tenant_id,
            CallModel.created_at >= cutoff,
        )
    )
    calls = [c for c in calls_result.scalars().all()
             if (c.metadata_ or {}).get("assigned_agent_id") == agent_id]

    return {
        "agent_id": agent_id,
        "total_calls": len(calls),
        "calls": [
            {
                "id": c.id, "phone": c.customer_phone, "status": c.status,
                "outcome": c.outcome, "duration_seconds": c.duration_seconds,
                "created_at": c.created_at,
            }
            for c in calls[:50]
        ],
    }
