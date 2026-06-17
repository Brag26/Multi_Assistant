"""
infrastructure/db/models.py — extended with visual workflow builder columns
and new monitoring / lead-activity / analytics tables.
"""
from datetime import datetime
from uuid import uuid4

from sqlalchemy import (
    Boolean, DateTime, Enum, ForeignKey, Index, Integer,
    String, Text, UniqueConstraint, func,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.security import Role
from app.domain.enums import (
    AppointmentStatus,
    CallOutcome,
    CallStatus,
    CampaignStatus,
    IntegrationProvider,
    LeadStatus,
    NotificationType,
    WorkflowRunStatus,
    WorkflowRunStepStatus,
    WorkflowStatus,
)
from app.infrastructure.db.base import Base


# ─── Core Tenant / Membership ────────────────────────────────────────────────

class TenantModel(Base):
    __tablename__ = "tenants"
    id: Mapped[str] = mapped_column(UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid4()))
    name: Mapped[str] = mapped_column(String(160), nullable=False)
    slug: Mapped[str] = mapped_column(String(80), unique=True, nullable=False, index=True)
    settings: Mapped[dict] = mapped_column(JSONB, default=dict, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class MembershipModel(Base):
    __tablename__ = "memberships"
    id: Mapped[str] = mapped_column(UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid4()))
    tenant_id: Mapped[str] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), index=True)
    user_id: Mapped[str] = mapped_column(UUID(as_uuid=False), index=True)
    email: Mapped[str] = mapped_column(String(320), nullable=False)
    role: Mapped[Role] = mapped_column(
        Enum(Role, values_callable=lambda e: [x.value for x in e], name="app_role"),
        nullable=False,
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    tenant = relationship("TenantModel")
    __table_args__ = (UniqueConstraint("tenant_id", "user_id", name="uq_membership_tenant_user"),)


# ─── Tags / Contacts / Segments ─────────────────────────────────────────────

class TagModel(Base):
    __tablename__ = "tags"
    id: Mapped[str] = mapped_column(UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid4()))
    tenant_id: Mapped[str] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), index=True)
    name: Mapped[str] = mapped_column(String(80), nullable=False)
    color: Mapped[str | None] = mapped_column(String(24))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    __table_args__ = (UniqueConstraint("tenant_id", "name", name="uq_tags_tenant_name"),)


class ContactModel(Base):
    __tablename__ = "contacts"
    id: Mapped[str] = mapped_column(UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid4()))
    tenant_id: Mapped[str] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), index=True)
    first_name: Mapped[str | None] = mapped_column(String(100))
    last_name: Mapped[str | None] = mapped_column(String(100))
    phone: Mapped[str] = mapped_column(String(40), nullable=False)
    email: Mapped[str | None] = mapped_column(String(320))
    company: Mapped[str | None] = mapped_column(String(160))
    title: Mapped[str | None] = mapped_column(String(160))
    timezone: Mapped[str | None] = mapped_column(String(80))
    source: Mapped[str | None] = mapped_column(String(120))
    custom_fields: Mapped[dict] = mapped_column(JSONB, default=dict, nullable=False)
    duplicate_key: Mapped[str] = mapped_column(String(128), nullable=False, index=True)
    lead_status: Mapped[LeadStatus] = mapped_column(
        Enum(LeadStatus, values_callable=lambda e: [x.value for x in e], name="lead_status"),
        default=LeadStatus.NEW,
        nullable=False,
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    __table_args__ = (UniqueConstraint("tenant_id", "duplicate_key", name="uq_contacts_tenant_duplicate_key"),)


class ContactTagModel(Base):
    __tablename__ = "contact_tags"
    contact_id: Mapped[str] = mapped_column(ForeignKey("contacts.id", ondelete="CASCADE"), primary_key=True)
    tag_id: Mapped[str] = mapped_column(ForeignKey("tags.id", ondelete="CASCADE"), primary_key=True)


class SegmentModel(Base):
    __tablename__ = "segments"
    id: Mapped[str] = mapped_column(UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid4()))
    tenant_id: Mapped[str] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), index=True)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    filters: Mapped[dict] = mapped_column(JSONB, default=dict, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    __table_args__ = (UniqueConstraint("tenant_id", "name", name="uq_segments_tenant_name"),)


# ─── Integrations ────────────────────────────────────────────────────────────

class IntegrationModel(Base):
    __tablename__ = "integrations"
    id: Mapped[str] = mapped_column(UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid4()))
    tenant_id: Mapped[str] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), index=True)
    provider: Mapped[IntegrationProvider] = mapped_column(
        Enum(IntegrationProvider, values_callable=lambda e: [x.value for x in e], name="integration_provider"),
        nullable=False,
    )
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    config: Mapped[dict] = mapped_column(JSONB, default=dict, nullable=False)
    secret_ref: Mapped[str | None] = mapped_column(String(255))
    connected_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    disconnected_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    __table_args__ = (Index("ix_integrations_tenant_provider", "tenant_id", "provider"),)


class IntegrationAssetModel(Base):
    __tablename__ = "integration_assets"
    id: Mapped[str] = mapped_column(UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid4()))
    tenant_id: Mapped[str] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), index=True)
    provider: Mapped[IntegrationProvider] = mapped_column(
        Enum(IntegrationProvider, values_callable=lambda e: [x.value for x in e], name="integration_provider"),
        nullable=False,
    )
    external_id: Mapped[str] = mapped_column(String(180), nullable=False)
    label: Mapped[str] = mapped_column(String(180), nullable=False)
    payload: Mapped[dict] = mapped_column(JSONB, default=dict, nullable=False)
    synced_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    __table_args__ = (UniqueConstraint("tenant_id", "provider", "external_id", name="uq_integration_assets_external"),)


class WebhookLogModel(Base):
    __tablename__ = "webhook_logs"
    id: Mapped[str] = mapped_column(UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid4()))
    tenant_id: Mapped[str | None] = mapped_column(ForeignKey("tenants.id", ondelete="SET NULL"), index=True)
    provider: Mapped[IntegrationProvider] = mapped_column(
        Enum(IntegrationProvider, values_callable=lambda e: [x.value for x in e], name="integration_provider"),
        nullable=False,
    )
    direction: Mapped[str] = mapped_column(String(20), nullable=False)
    status_code: Mapped[int | None] = mapped_column(Integer)
    event_type: Mapped[str | None] = mapped_column(String(120))
    payload: Mapped[dict] = mapped_column(JSONB, default=dict, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


# ─── Visual Workflow Builder ──────────────────────────────────────────────────

class WorkflowModel(Base):
    __tablename__ = "voice_workflows"
    id: Mapped[str] = mapped_column(UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid4()))
    tenant_id: Mapped[str] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), index=True)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    status: Mapped[WorkflowStatus] = mapped_column(
        Enum(WorkflowStatus, values_callable=lambda e: [x.value for x in e], name="workflow_status"),
        default=WorkflowStatus.DRAFT,
    )
    vapi_assistant_id: Mapped[str | None] = mapped_column(String(120))
    twilio_phone_number: Mapped[str | None] = mapped_column(String(40))
    make_webhook_url: Mapped[str | None] = mapped_column(Text)
    # Builder-specific
    trigger_type: Mapped[str | None] = mapped_column(String(60))
    cron_expression: Mapped[str | None] = mapped_column(String(100))
    nodes: Mapped[list] = mapped_column(JSONB, default=list, nullable=False)
    edges: Mapped[list] = mapped_column(JSONB, default=list, nullable=False)
    builder_version: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    # Legacy flat config
    config: Mapped[dict] = mapped_column(JSONB, default=dict, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class WorkflowVersionModel(Base):
    __tablename__ = "workflow_versions"
    id: Mapped[str] = mapped_column(UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid4()))
    tenant_id: Mapped[str] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), index=True)
    workflow_id: Mapped[str] = mapped_column(ForeignKey("voice_workflows.id", ondelete="CASCADE"), index=True)
    version: Mapped[int] = mapped_column(Integer, nullable=False)
    config: Mapped[dict] = mapped_column(JSONB, default=dict, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    workflow = relationship("WorkflowModel")


class WorkflowRunModel(Base):
    __tablename__ = "workflow_runs"
    id: Mapped[str] = mapped_column(UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid4()))
    tenant_id: Mapped[str] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), index=True)
    workflow_id: Mapped[str] = mapped_column(ForeignKey("voice_workflows.id", ondelete="CASCADE"), index=True)
    version_id: Mapped[str | None] = mapped_column(ForeignKey("workflow_versions.id", ondelete="SET NULL"))
    trigger_event: Mapped[str] = mapped_column(String(80), nullable=False)
    status: Mapped[WorkflowRunStatus] = mapped_column(
        Enum(WorkflowRunStatus, values_callable=lambda e: [x.value for x in e], name="workflow_run_status"),
        default=WorkflowRunStatus.RUNNING,
        nullable=False,
    )
    variables: Mapped[dict] = mapped_column(JSONB, default=dict, nullable=False)
    error_message: Mapped[str | None] = mapped_column(Text)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    workflow = relationship("WorkflowModel")


class WorkflowRunStepModel(Base):
    __tablename__ = "workflow_run_steps"
    id: Mapped[str] = mapped_column(UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid4()))
    tenant_id: Mapped[str] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), index=True)
    run_id: Mapped[str] = mapped_column(ForeignKey("workflow_runs.id", ondelete="CASCADE"), index=True)
    node_id: Mapped[str] = mapped_column(String(100), nullable=False)
    node_type: Mapped[str] = mapped_column(String(50), nullable=False)
    node_name: Mapped[str] = mapped_column(String(120), nullable=False)
    status: Mapped[WorkflowRunStepStatus] = mapped_column(
        Enum(WorkflowRunStepStatus, values_callable=lambda e: [x.value for x in e], name="workflow_run_step_status"),
        nullable=False,
    )
    input_data: Mapped[dict] = mapped_column(JSONB, default=dict, nullable=False)
    output_data: Mapped[dict] = mapped_column(JSONB, default=dict, nullable=False)
    error_message: Mapped[str | None] = mapped_column(Text)
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    duration_ms: Mapped[int | None] = mapped_column(Integer)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    run = relationship("WorkflowRunModel")


# ─── Campaigns / Calls ───────────────────────────────────────────────────────

class CampaignModel(Base):
    __tablename__ = "campaigns"
    id: Mapped[str] = mapped_column(UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid4()))
    tenant_id: Mapped[str] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), index=True)
    name: Mapped[str] = mapped_column(String(140), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    status: Mapped[CampaignStatus] = mapped_column(
        Enum(CampaignStatus, values_callable=lambda e: [x.value for x in e], name="campaign_status"),
        default=CampaignStatus.DRAFT,
    )
    vapi_assistant_id: Mapped[str | None] = mapped_column(String(180))
    twilio_phone_number: Mapped[str | None] = mapped_column(String(40))
    make_webhook_url: Mapped[str | None] = mapped_column(Text)
    scheduled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    config: Mapped[dict] = mapped_column(JSONB, default=dict, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class CampaignContactModel(Base):
    __tablename__ = "campaign_contacts"
    campaign_id: Mapped[str] = mapped_column(ForeignKey("campaigns.id", ondelete="CASCADE"), primary_key=True)
    contact_id: Mapped[str] = mapped_column(ForeignKey("contacts.id", ondelete="CASCADE"), primary_key=True)
    assigned_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class CallModel(Base):
    __tablename__ = "voice_calls"
    id: Mapped[str] = mapped_column(UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid4()))
    tenant_id: Mapped[str] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), index=True)
    workflow_id: Mapped[str | None] = mapped_column(ForeignKey("voice_workflows.id", ondelete="SET NULL"), index=True)
    contact_id: Mapped[str | None] = mapped_column(ForeignKey("contacts.id", ondelete="SET NULL"), index=True)
    campaign_id: Mapped[str | None] = mapped_column(ForeignKey("campaigns.id", ondelete="SET NULL"), index=True)
    assistant_id: Mapped[str | None] = mapped_column(String(180))
    customer_phone: Mapped[str] = mapped_column(String(40), nullable=False)
    status: Mapped[CallStatus] = mapped_column(
        Enum(CallStatus, values_callable=lambda e: [x.value for x in e], name="call_status"),
        default=CallStatus.QUEUED,
    )
    outcome: Mapped[CallOutcome] = mapped_column(
        Enum(CallOutcome, values_callable=lambda e: [x.value for x in e], name="call_outcome"),
        default=CallOutcome.UNKNOWN,
    )
    provider_call_id: Mapped[str | None] = mapped_column(String(160), index=True)
    duration_seconds: Mapped[int | None] = mapped_column(Integer)
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    ended_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    transcript: Mapped[str | None] = mapped_column(Text)
    transcript_url: Mapped[str | None] = mapped_column(Text)
    recording_url: Mapped[str | None] = mapped_column(Text)
    summary: Mapped[str | None] = mapped_column(Text)
    metadata_: Mapped[dict] = mapped_column("metadata", JSONB, default=dict, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


# ─── Call Monitoring ──────────────────────────────────────────────────────────

class CallMonitoringModel(Base):
    __tablename__ = "call_monitoring"
    id: Mapped[str] = mapped_column(UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid4()))
    tenant_id: Mapped[str] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), index=True)
    call_id: Mapped[str] = mapped_column(ForeignKey("voice_calls.id", ondelete="CASCADE"), index=True)
    event_type: Mapped[str] = mapped_column(String(60), nullable=False)
    event_data: Mapped[dict] = mapped_column(JSONB, default=dict, nullable=False)
    recorded_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    call = relationship("CallModel")


# ─── Lead Activities ──────────────────────────────────────────────────────────

class LeadActivityModel(Base):
    __tablename__ = "lead_activities"
    id: Mapped[str] = mapped_column(UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid4()))
    tenant_id: Mapped[str] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), index=True)
    contact_id: Mapped[str] = mapped_column(ForeignKey("contacts.id", ondelete="CASCADE"), index=True)
    activity_type: Mapped[str] = mapped_column(String(60), nullable=False)
    summary: Mapped[str | None] = mapped_column(Text)
    metadata_: Mapped[dict] = mapped_column("metadata", JSONB, default=dict, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    contact = relationship("ContactModel")


# ─── Appointments / Notifications / Audit ────────────────────────────────────

class AppointmentModel(Base):
    __tablename__ = "appointments"
    id: Mapped[str] = mapped_column(UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid4()))
    tenant_id: Mapped[str] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), index=True)
    contact_id: Mapped[str | None] = mapped_column(ForeignKey("contacts.id", ondelete="CASCADE"), index=True)
    title: Mapped[str] = mapped_column(String(160), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    scheduled_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    status: Mapped[AppointmentStatus] = mapped_column(
        Enum(AppointmentStatus, values_callable=lambda e: [x.value for x in e], name="appointment_status"),
        default=AppointmentStatus.SCHEDULED,
        nullable=False,
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    contact = relationship("ContactModel")


class NotificationModel(Base):
    __tablename__ = "notifications"
    id: Mapped[str] = mapped_column(UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid4()))
    tenant_id: Mapped[str] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), index=True)
    title: Mapped[str] = mapped_column(String(160), nullable=False)
    message: Mapped[str] = mapped_column(Text, nullable=False)
    type: Mapped[NotificationType] = mapped_column(
        Enum(NotificationType, values_callable=lambda e: [x.value for x in e], name="notification_type"),
        default=NotificationType.INFO,
        nullable=False,
    )
    read: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class AuditLogModel(Base):
    __tablename__ = "audit_logs"
    id: Mapped[str] = mapped_column(UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid4()))
    tenant_id: Mapped[str | None] = mapped_column(ForeignKey("tenants.id", ondelete="SET NULL"), index=True)
    actor_user_id: Mapped[str | None] = mapped_column(UUID(as_uuid=False), index=True)
    action: Mapped[str] = mapped_column(String(160), nullable=False)
    resource_type: Mapped[str] = mapped_column(String(80), nullable=False)
    resource_id: Mapped[str | None] = mapped_column(UUID(as_uuid=False))
    metadata_: Mapped[dict] = mapped_column("metadata", JSONB, default=dict, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


# ─── Analytics Snapshots ─────────────────────────────────────────────────────

class AnalyticsSnapshotModel(Base):
    __tablename__ = "analytics_snapshots"
    id: Mapped[str] = mapped_column(UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid4()))
    tenant_id: Mapped[str] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), index=True)
    snapshot_date: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    metrics: Mapped[dict] = mapped_column(JSONB, default=dict, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


# ─── Phase 2 feature models (imported for Alembic/metadata registration) ────
from app.infrastructure.db.new_models import (  # noqa: E402,F401
    DncListModel,
    CallRetryQueueModel,
    SlackConfigModel,
    CalendarConfigModel,
    CampaignReportModel,
)
from app.api.v1.outbound_webhooks import OutboundWebhookModel  # noqa: E402,F401
