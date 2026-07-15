"""integrations.owner_user_id — setup profiles assignable to a client/reseller

Revision ID: 0006_integration_profiles
Revises: 0005_plan_configs
Create Date: 2026-07-15
"""
from alembic import op

revision = "0006_integration_profiles"
down_revision = "0005_plan_configs"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("alter table integrations add column if not exists owner_user_id uuid")
    op.execute("create index if not exists ix_integrations_owner_user_id on integrations (owner_user_id)")


def downgrade() -> None:
    op.execute("alter table integrations drop column if exists owner_user_id")
