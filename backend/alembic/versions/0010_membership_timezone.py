"""memberships.timezone — per-user timezone preference

Revision ID: 0010_membership_timezone
Revises: 0009_integration_assets_unique
Create Date: 2026-07-17
"""
from alembic import op

revision = "0010_membership_timezone"
down_revision = "0009_integration_assets_unique"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("alter table memberships add column if not exists timezone text")


def downgrade() -> None:
    op.execute("alter table memberships drop column if exists timezone")
