"""integration_assets.kind — distinguish synced assistants from synced phone
numbers now that Vapi numbers are synced into the same table as Vapi
assistants (both provider='vapi').

Revision ID: 0018_asset_kind
Revises: 0017_autopilot
Create Date: 2026-08-10
"""
from alembic import op

revision = "0018_asset_kind"
down_revision = "0017_autopilot"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("alter table integration_assets add column if not exists kind varchar(20) not null default 'assistant'")
    op.execute("create index if not exists ix_integration_assets_kind on integration_assets (kind)")


def downgrade() -> None:
    op.execute("drop index if exists ix_integration_assets_kind")
    op.execute("alter table integration_assets drop column if exists kind")
