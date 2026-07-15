"""assistant_assignments — superadmin -> reseller -> client assignment chain

Revision ID: 0008_assistant_assignments
Revises: 0007_addons
Create Date: 2026-07-15
"""
from alembic import op

revision = "0008_assistant_assignments"
down_revision = "0007_addons"
branch_labels = None
depends_on = None

SQL = '''create table assistant_assignments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  assistant_external_id text not null,
  assistant_label text not null,
  assigned_to_user_id uuid not null,
  assigned_by_user_id uuid not null,
  created_at timestamptz not null default now(),
  unique (assistant_external_id, assigned_to_user_id)
);
create index ix_assistant_assignments_tenant_id on assistant_assignments (tenant_id);
create index ix_assistant_assignments_assigned_to on assistant_assignments (assigned_to_user_id);
create index ix_assistant_assignments_assistant on assistant_assignments (assistant_external_id);
'''


def upgrade() -> None:
    op.execute(SQL)


def downgrade() -> None:
    op.execute("drop table if exists assistant_assignments cascade")
