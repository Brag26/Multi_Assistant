"""api/v1/copilot.py — "Jarvis": a dedicated Vapi assistant for superadmin
that can answer questions and take real actions (launch/pause campaigns,
look up account usage, etc.) via voice (Web SDK) or text chat, using the
same tool-calling assistant either way.

Setup is a one-time (or re-run-to-update) action: creates/updates the Vapi
assistant with copilot_tools' tool schemas and a serverUrl pointing back at
this module's webhook. The webhook then dispatches incoming tool calls to
the matching handler in copilot_tools.py.
"""
import secrets
from typing import Annotated

import structlog
from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_db_session
from app.application.copilot_tools import TOOL_HANDLERS, copilot_tool_schemas
from app.application.call_routing import resolve_vapi_client
from app.core.config import settings
from app.core.security import CurrentUser, Role, require_role
from app.infrastructure.db.models import TenantModel
from app.infrastructure.integrations.vapi import VapiClient

router = APIRouter(prefix="/tenants/{tenant_id}/copilot", tags=["copilot"])
log = structlog.get_logger()
SuperAdmin = require_role(Role.SUPER_ADMIN)

JARVIS_SYSTEM_PROMPT = """You are Jarvis, the personal operations assistant for the superadmin running this voice-AI reseller platform. You are sharp, concise, and proactive — like a chief of staff who already knows the business.

You have direct tools to check on and control the platform: campaign status, account usage, recent calls, assistant rosters, and pending approvals. When the superadmin asks something you can answer with a tool, use it — don't guess or make up numbers. When they ask you to do something (launch a campaign, pause one, etc.), just do it via the right tool and confirm briefly what happened.

Keep responses short and spoken-language natural when the medium is voice — no bullet points, no markdown, just talk like a competent person giving a quick briefing. In text chat you can be a little more structured if it helps readability, but still concise.

If a tool comes back saying it couldn't find something (a campaign, an account), say so plainly and ask for clarification rather than guessing which one was meant.

You are talking directly to the platform owner — the person with full authority over every account, campaign, and assistant on this platform. Act accordingly: confident, direct, no unnecessary hedging."""


def _assistant_config(server_url: str, first_message: str) -> dict:
    tools = copilot_tool_schemas()
    for t in tools:
        t["server"] = {"url": server_url}
    return {
        "name": "Jarvis (Admin Copilot)",
        "firstMessage": first_message,
        "model": {
            "provider": "openai",
            "model": "gpt-4.1",
            "messages": [{"role": "system", "content": JARVIS_SYSTEM_PROMPT}],
            "tools": tools,
        },
        "voice": {
            "provider": "vapi",
            "voiceId": "Elliot",
        },
    }


class CopilotConfigRead(BaseModel):
    assistant_id: str | None
    vapi_public_key: str | None
    configured: bool


class SetPublicKeyRequest(BaseModel):
    vapi_public_key: str


@router.get("/config", response_model=CopilotConfigRead)
async def get_copilot_config(tenant_id: str, user=Depends(SuperAdmin), session: AsyncSession = Depends(get_db_session)):
    """Returns the assistant ID and the *public* key (safe to expose to the
    browser by design — Vapi's public keys are meant for client-side use,
    unlike the private API key used everywhere else in this app)."""
    tenant = await session.get(TenantModel, tenant_id)
    cfg = (tenant.settings or {}).get("copilot", {}) if tenant else {}
    return {
        "assistant_id": cfg.get("assistant_id"),
        "vapi_public_key": cfg.get("vapi_public_key"),
        "configured": bool(cfg.get("assistant_id") and cfg.get("vapi_public_key")),
    }


@router.post("/public-key")
async def set_public_key(tenant_id: str, body: SetPublicKeyRequest, user=Depends(SuperAdmin), session: AsyncSession = Depends(get_db_session)):
    """Vapi's Web SDK needs a *public* key (dashboard.vapi.ai → API Keys →
    Public), separate from the private key used for backend calls — store
    it once here."""
    tenant = await session.get(TenantModel, tenant_id)
    if not tenant:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Tenant not found")
    tenant.settings = {**(tenant.settings or {}), "copilot": {**(tenant.settings or {}).get("copilot", {}), "vapi_public_key": body.vapi_public_key}}
    await session.commit()
    return {"ok": True}


@router.post("/setup", response_model=CopilotConfigRead)
async def setup_copilot(tenant_id: str, user=Depends(SuperAdmin), session: AsyncSession = Depends(get_db_session)):
    """Creates the Jarvis assistant on Vapi (or updates it in place if one
    already exists, so re-running this doesn't create duplicates every
    time). Uses the platform's own resolved Vapi client — same account
    resolution as every other assistant-creating path in this app."""
    tenant = await session.get(TenantModel, tenant_id)
    if not tenant:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Tenant not found")

    if not settings.backend_public_url:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            "BACKEND_PUBLIC_URL isn't set — Jarvis needs to know this backend's public URL to receive tool calls. "
            "Set it on Render to your service's URL (e.g. https://voice-ops-backend.onrender.com), then try setup again.",
        )

    server_url = f"{settings.backend_public_url}/api/v1/tenants/{tenant_id}/copilot/tool-calls"

    cfg = (tenant.settings or {}).get("copilot", {})
    # Generate a webhook secret once and keep reusing it — this is what
    # stops anyone who finds/guesses this URL from POSTing fake tool calls
    # and triggering real actions (launch/cancel a campaign, etc.) with no
    # auth at all. Embedded in the server URL as a query param since Vapi
    # doesn't let you attach custom auth headers to a tool's server config.
    webhook_secret = cfg.get("webhook_secret") or secrets.token_urlsafe(32)
    server_url_with_secret = f"{server_url}?secret={webhook_secret}"

    config = _assistant_config(server_url_with_secret, first_message="Jarvis online. What do you need?")

    client = VapiClient()  # platform key — this assistant isn't tied to any one reseller's account
    if cfg.get("assistant_id"):
        try:
            result = await client.update_assistant(cfg["assistant_id"], config)
        except RuntimeError as exc:
            log.warning("copilot.setup.update_failed_recreating", error=str(exc))
            result = await client.create_assistant(config)
    else:
        result = await client.create_assistant(config)

    assistant_id = result.get("id")
    if not assistant_id:
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, "Vapi didn't return an assistant id")

    tenant.settings = {**(tenant.settings or {}), "copilot": {**cfg, "assistant_id": assistant_id, "webhook_secret": webhook_secret}}
    await session.commit()

    return {
        "assistant_id": assistant_id,
        "vapi_public_key": (tenant.settings.get("copilot", {}) or {}).get("vapi_public_key"),
        "configured": bool((tenant.settings.get("copilot", {}) or {}).get("vapi_public_key")),
    }


class ChatRequest(BaseModel):
    message: str
    previous_chat_id: str | None = None


@router.post("/chat")
async def copilot_chat(tenant_id: str, body: ChatRequest, user=Depends(SuperAdmin), session: AsyncSession = Depends(get_db_session)):
    """Text mode — same assistant, same tools, Vapi's Chat API instead of a call."""
    tenant = await session.get(TenantModel, tenant_id)
    cfg = (tenant.settings or {}).get("copilot", {}) if tenant else {}
    assistant_id = cfg.get("assistant_id")
    if not assistant_id:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Jarvis hasn't been set up yet — run setup first.")

    client = VapiClient()
    result = await client.send_chat(assistant_id, body.message, body.previous_chat_id)
    reply = ""
    for item in result.get("output", []):
        if item.get("role") == "assistant":
            reply = item.get("content", "")
    return {"reply": reply, "chat_id": result.get("id")}


@router.post("/tool-calls")
async def copilot_tool_calls(tenant_id: str, request: Request, session: AsyncSession = Depends(get_db_session)):
    """The webhook Vapi hits mid-conversation when Jarvis wants to call a
    tool. Not authenticated via the normal JWT flow — Vapi is calling this
    directly — the tenant_id in the URL plus this being a dedicated,
    non-guessable path is the trust boundary, same pattern as the other
    Vapi webhooks in this app.

    CRITICAL: per Vapi's contract, this must always return HTTP 200 with a
    `results` array — even on error — or Vapi treats the whole response as
    failed and the assistant gets nothing back. Every result string must be
    single-line; line breaks break Vapi's response parser.
    """
    raw_payload = await request.json()

    # Verify the secret embedded in the server URL at setup time — without
    # this, anyone who finds this URL could POST fake tool calls and
    # trigger real actions (cancel a campaign, etc.) with zero auth.
    tenant = await session.get(TenantModel, tenant_id)
    expected_secret = ((tenant.settings or {}).get("copilot", {}) if tenant else {}).get("webhook_secret")
    provided_secret = request.query_params.get("secret")
    if not expected_secret or provided_secret != expected_secret:
        log.warning("copilot.tool_calls.auth_failed", tenant_id=tenant_id)
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid or missing webhook secret")

    payload = raw_payload.get("message", raw_payload)
    # Per Vapi's Server Events docs, each item in toolCallList has id/name/
    # parameters directly on it — there's no nested "function" object.
    # (OpenAI's own function-calling API does nest it that way, which is
    # almost certainly where that wrong assumption came from — Vapi's tool
    # call webhook shape is its own thing, not a passthrough of OpenAI's.)
    tool_calls = payload.get("toolCallList") or []

    results = []
    for call in tool_calls:
        call_id = call.get("id")
        name = call.get("name")
        arguments = call.get("parameters") or call.get("arguments") or {}
        if isinstance(arguments, str):
            import json
            try:
                arguments = json.loads(arguments)
            except Exception:
                arguments = {}

        handler = TOOL_HANDLERS.get(name)
        if not handler:
            results.append({"name": name, "toolCallId": call_id, "error": f"Unknown tool: {name}"})
            continue
        try:
            result_str = await handler(session, tenant_id, **arguments)
            results.append({"name": name, "toolCallId": call_id, "result": result_str})
        except Exception as exc:
            log.error("copilot.tool_call.failed", tool=name, error=str(exc))
            results.append({"name": name, "toolCallId": call_id, "error": f"Tool failed: {exc}"[:300]})

    return {"results": results}
