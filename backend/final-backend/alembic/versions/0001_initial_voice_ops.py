"""initial voice ops schema

Revision ID: 0001_initial_voice_ops
Revises:
Create Date: 2026-06-11
"""
from alembic import op

revision = "0001_initial_voice_ops"
down_revision = None
branch_labels = None
depends_on = None

LOCAL_SQL = """
create extension if not exists "pgcrypto";

create type app_role as enum ('super_admin', 'tenant_admin', 'manager', 'agent', 'viewer');
create type integration_provider as enum ('vapi', 'twilio', 'make');
create type workflow_status as enum ('draft', 'active', 'paused', 'archived');
create type call_status as enum ('queued', 'in_progress', 'completed', 'failed', 'canceled');

create table tenants (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  settings jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table memberships (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  user_id uuid not null,
  email text not null,
  role app_role not null default 'viewer',
  created_at timestamptz not null default now(),
  unique (tenant_id, user_id)
);

create table integrations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  provider integration_provider not null,
  name text not null,
  config jsonb not null default '{}',
  secret_ref text,
  created_at timestamptz not null default now()
);

create table voice_workflows (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  name text not null,
  description text,
  status workflow_status not null default 'draft',
  vapi_assistant_id text,
  twilio_phone_number text,
  make_webhook_url text,
  config jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table voice_calls (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  workflow_id uuid not null references voice_workflows(id) on delete cascade,
  customer_phone text not null,
  status call_status not null default 'queued',
  provider_call_id text,
  started_at timestamptz,
  ended_at timestamptz,
  transcript_url text,
  recording_url text,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create table audit_logs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references tenants(id) on delete set null,
  actor_user_id uuid,
  action text not null,
  resource_type text not null,
  resource_id uuid,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create index ix_memberships_user on memberships(user_id);
create index ix_integrations_tenant_provider on integrations(tenant_id, provider);
create index ix_workflows_tenant_status on voice_workflows(tenant_id, status);
create index ix_calls_tenant_status on voice_calls(tenant_id, status);
create index ix_calls_provider_call_id on voice_calls(provider_call_id);
create index ix_audit_logs_tenant_created on audit_logs(tenant_id, created_at desc);
"""

def upgrade() -> None:
    op.execute(LOCAL_SQL)

def downgrade() -> None:
    op.execute("drop table if exists audit_logs cascade")
    op.execute("drop table if exists voice_calls cascade")
    op.execute("drop table if exists voice_workflows cascade")
    op.execute("drop table if exists integrations cascade")
    op.execute("drop table if exists memberships cascade")
    op.execute("drop table if exists tenants cascade")
    op.execute("drop type if exists call_status")
    op.execute("drop type if exists workflow_status")
    op.execute("drop type if exists integration_provider")
    op.execute("drop type if exists app_role")
