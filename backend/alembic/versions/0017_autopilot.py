"""autopilot_runs, autopilot_actions, support_tool_calls

Powers the autonomous "Autopilot" ops agent (scheduled checks + an approval
queue for anything touching money/account status) and an audit trail for
real actions the Support chatbot takes via Vapi's native function-calling.

Revision ID: 0017_autopilot
Revises: 0016_asset_ownership
Create Date: 2026-07-30
"""
from alembic import op

revision = "0017_autopilot"
down_revision = "0016_asset_ownership"
branch_labels = None
depends_on = None

SQL = '''create table autopilot_runs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  checks_run text[] not null default '{}',
  findings_count integer not null default 0,
  actions_count integer not null default 0,
  status text not null default 'running',
  summary text
);
create index ix_autopilot_runs_tenant_id on autopilot_runs (tenant_id);

create table autopilot_actions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  run_id uuid references autopilot_runs(id) on delete set null,
  check_name text not null,
  action_type text not null,
  target_type text,
  target_id text,
  title text not null,
  detail text not null default '',
  requires_approval boolean not null default true,
  status text not null default 'pending',
  result text,
  created_at timestamptz not null default now(),
  decided_at timestamptz,
  decided_by_user_id uuid
);
create index ix_autopilot_actions_tenant_id on autopilot_actions (tenant_id);
create index ix_autopilot_actions_status on autopilot_actions (status);

create table support_tool_calls (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  user_id uuid,
  tool_name text not null,
  arguments jsonb not null default '{}'::jsonb,
  result jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index ix_support_tool_calls_tenant_id on support_tool_calls (tenant_id);
'''


def upgrade() -> None:
    op.execute(SQL)


def downgrade() -> None:
    op.execute("drop table if exists support_tool_calls cascade")
    op.execute("drop table if exists autopilot_actions cascade")
    op.execute("drop table if exists autopilot_runs cascade")
