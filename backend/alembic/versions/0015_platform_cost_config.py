"""platform_cost_config — superadmin's real ₹/min cost, used to compute margins

Revision ID: 0015_platform_cost_config
Revises: 0014_notification_targeting
Create Date: 2026-07-23
"""
from alembic import op

revision = "0015_platform_cost_config"
down_revision = "0014_notification_targeting"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""
        create table platform_cost_config (
          tenant_id uuid primary key references tenants(id) on delete cascade,
          cost_per_minute_inr numeric(10,4) not null default 6.0,
          updated_at timestamptz not null default now()
        )
    """)


def downgrade() -> None:
    op.execute("drop table if exists platform_cost_config cascade")
