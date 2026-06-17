"""
schemas.py — extended with workflow builder, monitoring, lead tracking,
appointment tracking, notification center, analytics, and audit logs.
"""
from datetime import datetime
from typing import Any, Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, HttpUrl

from app.domain.enums import (
    AppointmentStatus,
    CallOutcome,
    CallStatus,
    CampaignStatus,
    IntegrationProvider,
    LeadStatus,
    NotificationType,
    WorkflowActionType,
    WorkflowLogicType,
    WorkflowNodeCategory,
    WorkflowRunStatus,
    WorkflowRunStepStatus,
    WorkflowStatus,
    WorkflowTriggerType,
)

# ─── Tenant / Membership ────────────────────────────────────────────────────

class TenantRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    name: str
    slug: str
    created_at: datetime


# ─── Tags ───────────────────────────────────────────────────────────────────

class TagCreate(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    color: str | None = None


class TagRead(TagCreate):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    tenant_id: UUID
    created_at: datetime


# ─── Contacts ───────────────────────────────────────────────────────────────

class ContactCreate(BaseModel):
    first_name: str | None = None
    last_name: str | None = None
    phone: str = Field(min_length=5, max_length=40)
    email: str | None = None
    company: str | None = None
    title: str | None = None
    timezone: str | None = None
    source: str | None = None
    custom_fields: dict = Field(default_factory=dict)
    tag_ids: list[UUID] = Field(default_factory=list)
    lead_status: LeadStatus = LeadStatus.NEW


class ContactUpdate(BaseModel):
    first_name: str | None = None
    last_name: str | None = None
    phone: str | None = None
    email: str | None = None
    company: str | None = None
    title: str | None = None
    timezone: str | None = None
    source: str | None = None
    custom_fields: dict | None = None
    tag_ids: list[UUID] | None = None
    lead_status: LeadStatus | None = None


class ContactRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    tenant_id: UUID
    first_name: str | None
    last_name: str | None
    phone: str
    email: str | None
    company: str | None
    title: str | None
    timezone: str | None
    source: str | None
    custom_fields: dict
    duplicate_key: str
    lead_status: LeadStatus
    created_at: datetime
    updated_at: datetime


class DuplicateContactRead(BaseModel):
    duplicate_key: str
    count: int
    contacts: list[ContactRead]


class ContactImportResult(BaseModel):
    created: int
    duplicates: int
    errors: list[str]


# ─── Segments ───────────────────────────────────────────────────────────────

class SegmentCreate(BaseModel):
    name: str = Field(min_length=2, max_length=120)
    filters: dict = Field(default_factory=dict)


class SegmentRead(SegmentCreate):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    tenant_id: UUID
    created_at: datetime


# ─── Visual Workflow Builder ─────────────────────────────────────────────────

class WorkflowNodeData(BaseModel):
    """Metadata stored inside each canvas node."""
    label: str
    category: WorkflowNodeCategory
    # trigger-specific
    trigger_type: WorkflowTriggerType | None = None
    cron_expression: str | None = None
    # action-specific
    action_type: WorkflowActionType | None = None
    # logic-specific
    logic_type: WorkflowLogicType | None = None
    # free-form config for the node (e.g. phone number, delay seconds, condition)
    config: dict[str, Any] = Field(default_factory=dict)
    description: str | None = None


class WorkflowNode(BaseModel):
    """React-Flow–compatible node."""
    id: str
    type: str                          # "trigger" | "action" | "logic"
    position: dict[str, float]         # {"x": 100, "y": 200}
    data: WorkflowNodeData


class WorkflowEdge(BaseModel):
    """React-Flow–compatible edge."""
    id: str
    source: str
    target: str
    source_handle: str | None = None
    target_handle: str | None = None
    label: str | None = None
    animated: bool = False


class WorkflowCreate(BaseModel):
    name: str = Field(min_length=2, max_length=120)
    description: str | None = None
    vapi_assistant_id: str | None = None
    twilio_phone_number: str | None = None
    make_webhook_url: str | None = None
    trigger_type: WorkflowTriggerType | None = None
    cron_expression: str | None = None
    # full builder graph stored in config for backwards compat
    config: dict = Field(default_factory=dict)
    nodes: list[WorkflowNode] = Field(default_factory=list)
    edges: list[WorkflowEdge] = Field(default_factory=list)


class WorkflowUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    status: WorkflowStatus | None = None
    vapi_assistant_id: str | None = None
    twilio_phone_number: str | None = None
    make_webhook_url: str | None = None
    trigger_type: WorkflowTriggerType | None = None
    cron_expression: str | None = None
    config: dict | None = None
    nodes: list[WorkflowNode] | None = None
    edges: list[WorkflowEdge] | None = None


class WorkflowRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    tenant_id: UUID
    name: str
    description: str | None
    status: WorkflowStatus
    vapi_assistant_id: str | None
    twilio_phone_number: str | None
    make_webhook_url: str | None
    trigger_type: WorkflowTriggerType | None = None
    cron_expression: str | None = None
    config: dict
    nodes: list[dict] = Field(default_factory=list)
    edges: list[dict] = Field(default_factory=list)
    builder_version: int = 1
    created_at: datetime
    updated_at: datetime


class WorkflowExportPayload(BaseModel):
    """Used for import/export JSON."""
    schema_version: str = "1.0"
    name: str
    description: str | None
    trigger_type: WorkflowTriggerType | None
    cron_expression: str | None
    nodes: list[WorkflowNode]
    edges: list[WorkflowEdge]
    config: dict = Field(default_factory=dict)


class WorkflowActivateRequest(BaseModel):
    active: bool  # True = activate, False = deactivate


# ─── Workflow Versions ───────────────────────────────────────────────────────

class WorkflowVersionRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    tenant_id: UUID
    workflow_id: UUID
    version: int
    config: dict
    created_at: datetime


# ─── Workflow Runs ───────────────────────────────────────────────────────────

class WorkflowRunRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    tenant_id: UUID
    workflow_id: UUID
    version_id: UUID | None
    trigger_event: str
    status: WorkflowRunStatus
    variables: dict
    error_message: str | None = None
    completed_at: datetime | None = None
    created_at: datetime
    updated_at: datetime


class WorkflowRunStepRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    tenant_id: UUID
    run_id: UUID
    node_id: str
    node_type: str
    node_name: str
    status: WorkflowRunStepStatus
    input_data: dict
    output_data: dict
    error_message: str | None
    started_at: datetime | None = None
    completed_at: datetime | None = None
    duration_ms: int | None = None
    created_at: datetime


# ─── Campaigns ───────────────────────────────────────────────────────────────

class CampaignCreate(BaseModel):
    name: str = Field(min_length=2, max_length=140)
    description: str | None = None
    vapi_assistant_id: str | None = None
    twilio_phone_number: str | None = None
    make_webhook_url: str | None = None
    scheduled_at: datetime | None = None
    config: dict = Field(default_factory=dict)
    contact_ids: list[UUID] = Field(default_factory=list)


class CampaignUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    vapi_assistant_id: str | None = None
    twilio_phone_number: str | None = None
    make_webhook_url: str | None = None
    scheduled_at: datetime | None = None
    config: dict | None = None
    contact_ids: list[UUID] | None = None


class CampaignRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    tenant_id: UUID
    name: str
    description: str | None
    status: CampaignStatus
    vapi_assistant_id: str | None
    twilio_phone_number: str | None
    make_webhook_url: str | None
    scheduled_at: datetime | None
    config: dict
    created_at: datetime
    updated_at: datetime


# ─── Calls ───────────────────────────────────────────────────────────────────

class LaunchCallRequest(BaseModel):
    customer_phone: str
    customer_name: str | None = None
    contact_id: UUID | None = None
    campaign_id: UUID | None = None
    metadata: dict = Field(default_factory=dict)


class CallRead(BaseModel):
    model_config = ConfigDict(from_attributes=True, populate_by_name=True)
    id: UUID
    tenant_id: UUID
    workflow_id: UUID | None
    contact_id: UUID | None
    campaign_id: UUID | None
    assistant_id: str | None
    customer_phone: str
    status: CallStatus
    outcome: CallOutcome
    provider_call_id: str | None
    duration_seconds: int | None
    started_at: datetime | None
    ended_at: datetime | None
    transcript: str | None
    transcript_url: str | None
    recording_url: str | None
    summary: str | None
    metadata: dict = Field(default_factory=dict, validation_alias="metadata_")
    created_at: datetime


# ─── Call Monitoring ─────────────────────────────────────────────────────────

class CallMonitoringEventCreate(BaseModel):
    event_type: Literal["status_update", "transcript_chunk", "latency_ping", "error"]
    event_data: dict = Field(default_factory=dict)


class CallMonitoringEventRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    tenant_id: UUID
    call_id: UUID
    event_type: str
    event_data: dict
    recorded_at: datetime


# ─── Lead Activities ──────────────────────────────────────────────────────────

class LeadActivityCreate(BaseModel):
    contact_id: UUID
    activity_type: Literal["call", "note", "status_change", "appointment"]
    summary: str | None = None
    metadata: dict = Field(default_factory=dict)


class LeadActivityRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    tenant_id: UUID
    contact_id: UUID
    activity_type: str
    summary: str | None
    metadata: dict
    created_at: datetime


# ─── Integrations ────────────────────────────────────────────────────────────

class IntegrationConnect(BaseModel):
    name: str | None = None
    api_key: str | None = None
    account_sid: str | None = None
    auth_token: str | None = None
    webhook_url: HttpUrl | None = None
    config: dict = Field(default_factory=dict)


class IntegrationRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    tenant_id: UUID
    provider: IntegrationProvider
    name: str
    config: dict
    connected_at: datetime | None
    disconnected_at: datetime | None
    created_at: datetime


class IntegrationAssetRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    tenant_id: UUID
    provider: IntegrationProvider
    external_id: str
    label: str
    payload: dict
    synced_at: datetime


class MakeScenarioTrigger(BaseModel):
    webhook_url: HttpUrl
    payload: dict = Field(default_factory=dict)


class WebhookLogRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    tenant_id: UUID | None
    provider: IntegrationProvider
    direction: str
    status_code: int | None
    event_type: str | None
    payload: dict
    created_at: datetime


# ─── Appointments ─────────────────────────────────────────────────────────────

class AppointmentCreate(BaseModel):
    contact_id: UUID | None = None
    title: str = Field(min_length=1, max_length=160)
    description: str | None = None
    scheduled_at: datetime
    status: AppointmentStatus = AppointmentStatus.SCHEDULED


class AppointmentUpdate(BaseModel):
    title: str | None = None
    description: str | None = None
    scheduled_at: datetime | None = None
    status: AppointmentStatus | None = None


class AppointmentRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    tenant_id: UUID
    contact_id: UUID | None
    title: str
    description: str | None
    scheduled_at: datetime
    status: AppointmentStatus
    created_at: datetime
    updated_at: datetime


# ─── Notifications ────────────────────────────────────────────────────────────

class NotificationCreate(BaseModel):
    title: str = Field(min_length=1, max_length=160)
    message: str
    type: NotificationType = NotificationType.INFO


class NotificationRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    tenant_id: UUID
    title: str
    message: str
    type: NotificationType
    read: bool
    created_at: datetime


class NotificationMarkRead(BaseModel):
    ids: list[UUID]


# ─── Audit Logs ───────────────────────────────────────────────────────────────

class AuditLogRead(BaseModel):
    model_config = ConfigDict(from_attributes=True, populate_by_name=True)
    id: UUID
    tenant_id: UUID | None
    actor_user_id: UUID | None
    action: str
    resource_type: str
    resource_id: UUID | None
    metadata: dict = Field(default_factory=dict, validation_alias="metadata_")
    created_at: datetime


# ─── Analytics ────────────────────────────────────────────────────────────────

class AnalyticsRead(BaseModel):
    total_calls: int
    completed_calls: int
    failed_calls: int
    completion_rate: float
    avg_duration_seconds: float
    total_contacts: int
    converted_leads: int
    scheduled_appointments: int
    active_workflows: int
    calls_by_day: list[dict]
    outcomes_breakdown: dict
    lead_funnel: dict
    workflow_run_stats: dict


class RealTimeDashboardRead(BaseModel):
    """Snapshot pushed via Supabase Realtime."""
    active_calls: int
    calls_today: int
    leads_today: int
    appointments_today: int
    recent_calls: list[CallRead]
    recent_notifications: list[NotificationRead]
