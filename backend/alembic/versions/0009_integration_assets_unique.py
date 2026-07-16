"""integration_assets: add missing unique constraint

The ORM model has always declared this constraint (tenant_id, provider,
external_id), but the original migration (0002) that created the table
never actually added it — so any upsert using ON CONFLICT ON CONSTRAINT
has been broken since day one. This only surfaced once assistant syncing
started exercising that code path.

Revision ID: 0009_integration_assets_unique
Revises: 0008_assistant_assignments
Create Date: 2026-07-16
"""
from alembic import op

revision = "0009_integration_assets_unique"
down_revision = "0008_assistant_assignments"
branch_labels = None
depends_on = None

SQL = '''-- De-dupe first in case any rows already collided under the intended key
delete from integration_assets a using integration_assets b
where a.id < b.id
  and a.tenant_id = b.tenant_id
  and a.provider = b.provider
  and a.external_id = b.external_id;

alter table integration_assets
  add constraint uq_integration_assets_external unique (tenant_id, provider, external_id);
'''


def upgrade() -> None:
    op.execute(SQL)


def downgrade() -> None:
    op.execute("alter table integration_assets drop constraint if exists uq_integration_assets_external")
