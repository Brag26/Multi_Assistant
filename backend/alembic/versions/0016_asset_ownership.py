"""integration_assets.owner_user_id — per-reseller Vapi account resolution

Lets calls actually use the specific reseller's own Vapi API key for an
assistant they synced, instead of always falling back to the platform's
shared/global key.

Revision ID: 0016_asset_ownership
Revises: 0015_platform_cost_config
Create Date: 2026-07-27
"""
from alembic import op

revision = "0016_asset_ownership"
down_revision = "0015_platform_cost_config"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("alter table integration_assets add column if not exists owner_user_id uuid")
    op.execute("create index if not exists ix_integration_assets_owner_user_id on integration_assets (owner_user_id)")


def downgrade() -> None:
    op.execute("drop index if exists ix_integration_assets_owner_user_id")
    op.execute("alter table integration_assets drop column if exists owner_user_id")
