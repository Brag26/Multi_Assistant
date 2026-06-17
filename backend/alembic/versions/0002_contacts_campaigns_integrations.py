"""contacts campaigns integrations

Revision ID: 0002_contacts_campaigns_integrations
Revises: 0001_initial_voice_ops
Create Date: 2026-06-11
"""
from alembic import op

revision = "0002_contacts_campaigns_integrations"
down_revision = "0001_initial_voice_ops"
branch_labels = None
depends_on = None

LOCAL_SQL = '''create type campaign_status as enum ('draft', 'scheduled', 'running', 'paused', 'completed', 'canceled');
create type call_outcome as enum ('unknown', 'qualified', 'not_interested', 'callback_requested', 'escalated', 'failed');

create table tags (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  name text not null,
  color text,
  created_at timestamptz not null default now(),
  unique (tenant_id, name)
);

create table contacts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  first_name text,
  last_name text,
  phone text not null,
  email text,
  company text,
  title text,
  timezone text,
  source text,
  custom_fields jsonb not null default '{}',
  duplicate_key text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, duplicate_key)
);

create table contact_tags (
  contact_id uuid not null references contacts(id) on delete cascade,
  tag_id uuid not null references tags(id) on delete cascade,
  primary key (contact_id, tag_id)
);

create table segments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  name text not null,
  filters jsonb not null default '{}',
  created_at timestamptz not null default now(),
  unique (tenant_id, name)
);

alter table integrations add column if not exists connected_at timestamptz;
alter table integrations add column if not exists disconnected_at timestamptz;

create table integration_assets (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  provider integration_provider not null,
  external_id text not null,
  label text not null,
  payload jsonb not null default '{}',
  synced_at timestamptz not null default now(),
  unique (tenant_id, provider, external_id)
);

create table webhook_logs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references tenants(id) on delete set null,
  provider integration_provider not null,
  direction text not null,
  status_code int,
  event_type text,
  payload jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create table campaigns (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  name text not null,
  description text,
  status campaign_status not null default 'draft',
  vapi_assistant_id text,
  twilio_phone_number text,
  make_webhook_url text,
  scheduled_at timestamptz,
  config jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table campaign_contacts (
  campaign_id uuid not null references campaigns(id) on delete cascade,
  contact_id uuid not null references contacts(id) on delete cascade,
  assigned_at timestamptz not null default now(),
  primary key (campaign_id, contact_id)
);

alter table voice_calls alter column workflow_id drop not null;
alter table voice_calls add column if not exists contact_id uuid references contacts(id) on delete set null;
alter table voice_calls add column if not exists campaign_id uuid references campaigns(id) on delete set null;
alter table voice_calls add column if not exists assistant_id text;
alter table voice_calls add column if not exists outcome call_outcome not null default 'unknown';
alter table voice_calls add column if not exists duration_seconds int;
alter table voice_calls add column if not exists transcript text;
alter table voice_calls add column if not exists summary text;

create index ix_contacts_tenant_name on contacts(tenant_id, last_name, first_name);
create index ix_contacts_tenant_phone on contacts(tenant_id, phone);
create index ix_contacts_duplicate on contacts(tenant_id, duplicate_key);
create index ix_tags_tenant on tags(tenant_id);
create index ix_segments_tenant on segments(tenant_id);
create index ix_campaigns_tenant_status on campaigns(tenant_id, status);
create index ix_integration_assets_tenant_provider on integration_assets(tenant_id, provider);
create index ix_webhook_logs_tenant_created on webhook_logs(tenant_id, created_at desc);
create index ix_calls_contact on voice_calls(contact_id);
create index ix_calls_campaign on voice_calls(campaign_id);

alter table tags enable row level security;
alter table contacts enable row level security;
alter table contact_tags enable row level security;
alter table segments enable row level security;
alter table integration_assets enable row level security;
alter table webhook_logs enable row level security;
alter table campaigns enable row level security;
alter table campaign_contacts enable row level security;

create policy "members read tags" on tags for select using (has_tenant_role(tenant_id, array['tenant_admin','manager','agent','viewer']::app_role[]));
create policy "managers write tags" on tags for all using (has_tenant_role(tenant_id, array['tenant_admin','manager']::app_role[])) with check (has_tenant_role(tenant_id, array['tenant_admin','manager']::app_role[]));

create policy "members read contacts" on contacts for select using (has_tenant_role(tenant_id, array['tenant_admin','manager','agent','viewer']::app_role[]));
create policy "managers write contacts" on contacts for all using (has_tenant_role(tenant_id, array['tenant_admin','manager']::app_role[])) with check (has_tenant_role(tenant_id, array['tenant_admin','manager']::app_role[]));

create policy "members read contact tags" on contact_tags for select using (exists (select 1 from contacts where contacts.id = contact_tags.contact_id and has_tenant_role(contacts.tenant_id, array['tenant_admin','manager','agent','viewer']::app_role[])));
create policy "managers write contact tags" on contact_tags for all using (exists (select 1 from contacts where contacts.id = contact_tags.contact_id and has_tenant_role(contacts.tenant_id, array['tenant_admin','manager']::app_role[])));

create policy "members read segments" on segments for select using (has_tenant_role(tenant_id, array['tenant_admin','manager','agent','viewer']::app_role[]));
create policy "managers write segments" on segments for all using (has_tenant_role(tenant_id, array['tenant_admin','manager']::app_role[])) with check (has_tenant_role(tenant_id, array['tenant_admin','manager']::app_role[]));

create policy "members read campaigns" on campaigns for select using (has_tenant_role(tenant_id, array['tenant_admin','manager','agent','viewer']::app_role[]));
create policy "managers write campaigns" on campaigns for all using (has_tenant_role(tenant_id, array['tenant_admin','manager']::app_role[])) with check (has_tenant_role(tenant_id, array['tenant_admin','manager']::app_role[]));

create policy "members read campaign contacts" on campaign_contacts for select using (exists (select 1 from campaigns where campaigns.id = campaign_contacts.campaign_id and has_tenant_role(campaigns.tenant_id, array['tenant_admin','manager','agent','viewer']::app_role[])));
create policy "managers write campaign contacts" on campaign_contacts for all using (exists (select 1 from campaigns where campaigns.id = campaign_contacts.campaign_id and has_tenant_role(campaigns.tenant_id, array['tenant_admin','manager']::app_role[])));

create policy "members read integration assets" on integration_assets for select using (has_tenant_role(tenant_id, array['tenant_admin','manager','agent','viewer']::app_role[]));
create policy "admins write integration assets" on integration_assets for all using (has_tenant_role(tenant_id, array['tenant_admin']::app_role[])) with check (has_tenant_role(tenant_id, array['tenant_admin']::app_role[]));

create policy "managers read webhook logs" on webhook_logs for select using (has_tenant_role(tenant_id, array['tenant_admin','manager']::app_role[]));'''

def upgrade() -> None:
    op.execute(LOCAL_SQL)

def downgrade() -> None:
    op.execute("alter table voice_calls drop column if exists summary")
    op.execute("alter table voice_calls drop column if exists transcript")
    op.execute("alter table voice_calls drop column if exists duration_seconds")
    op.execute("alter table voice_calls drop column if exists outcome")
    op.execute("alter table voice_calls drop column if exists assistant_id")
    op.execute("alter table voice_calls drop column if exists campaign_id")
    op.execute("alter table voice_calls drop column if exists contact_id")
    op.execute("drop table if exists campaign_contacts cascade")
    op.execute("drop table if exists campaigns cascade")
    op.execute("drop table if exists webhook_logs cascade")
    op.execute("drop table if exists integration_assets cascade")
    op.execute("drop table if exists segments cascade")
    op.execute("drop table if exists contact_tags cascade")
    op.execute("drop table if exists contacts cascade")
    op.execute("drop table if exists tags cascade")
    op.execute("drop type if exists call_outcome")
    op.execute("drop type if exists campaign_status")
