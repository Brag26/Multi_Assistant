from dataclasses import dataclass
from datetime import datetime
from uuid import UUID

from app.domain.enums import CallStatus, WorkflowStatus

@dataclass(frozen=True)
class Tenant:
    id: UUID
    name: str
    slug: str
    created_at: datetime

@dataclass(frozen=True)
class VoiceWorkflow:
    id: UUID
    tenant_id: UUID
    name: str
    status: WorkflowStatus
    vapi_assistant_id: str | None
    make_webhook_url: str | None

@dataclass(frozen=True)
class VoiceCall:
    id: UUID
    tenant_id: UUID
    workflow_id: UUID
    customer_phone: str
    status: CallStatus
    provider_call_id: str | None
