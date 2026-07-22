"""support_config + support_escalations — AI support chatbot + human escalation

Revision ID: 0013_support_chatbot
Revises: 0012_feature_access
Create Date: 2026-07-21
"""
from alembic import op

revision = "0013_support_chatbot"
down_revision = "0012_feature_access"
branch_labels = None
depends_on = None

SQL = '''create table support_config (
  tenant_id uuid primary key references tenants(id) on delete cascade,
  support_assistant_id text,
  updated_at timestamptz not null default now()
);

create table support_escalations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  user_id uuid not null,
  user_email text,
  message text not null,
  conversation jsonb not null default '[]'::jsonb,
  status text not null default 'open',
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);
create index ix_support_escalations_tenant_id on support_escalations (tenant_id);
create index ix_support_escalations_status on support_escalations (status);
'''


def upgrade() -> None:
    op.execute(SQL)


def downgrade() -> None:
    op.execute("drop table if exists support_escalations cascade")
    op.execute("drop table if exists support_config cascade")
