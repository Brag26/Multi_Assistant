"""feature_access — superadmin controls which nav features each reseller/client can see

By default, resellers (tenant_admin) and clients (agent) see NOTHING outside
a small always-visible core (Dashboard, Calls, Campaigns, Contacts, Billing,
Settings) until superadmin explicitly grants a feature. Superadmin always
sees everything, unrestricted.

Revision ID: 0012_feature_access
Revises: 0011_phone_number_tracking
Create Date: 2026-07-20
"""
from alembic import op

revision = "0012_feature_access"
down_revision = "0011_phone_number_tracking"
branch_labels = None
depends_on = None

SQL = '''alter type integration_provider add value if not exists 'apify';

create table feature_access (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  user_id uuid not null,
  feature_key text not null,
  allowed boolean not null default true,
  granted_by_user_id uuid,
  created_at timestamptz not null default now(),
  unique (tenant_id, user_id, feature_key)
);
create index ix_feature_access_tenant_id on feature_access (tenant_id);
create index ix_feature_access_user_id on feature_access (user_id);

create table leadgen_runs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  triggered_by_user_id uuid not null,
  actor_id text not null,
  apify_run_id text not null,
  dataset_id text,
  status text not null default 'running',
  item_count integer not null default 0,
  compute_units numeric(10,4) not null default 0,
  imported_contact_count integer not null default 0,
  started_at timestamptz not null default now(),
  finished_at timestamptz
);
create index ix_leadgen_runs_tenant_id on leadgen_runs (tenant_id);
create index ix_leadgen_runs_triggered_by on leadgen_runs (triggered_by_user_id);
'''


def upgrade() -> None:
    op.execute(SQL)


def downgrade() -> None:
    op.execute("drop table if exists leadgen_runs cascade")
    op.execute("drop table if exists feature_access cascade")
