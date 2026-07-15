"""plan_configs — superadmin-editable pricing, seeded from core/plans.py

Revision ID: 0005_plan_configs
Revises: 0004_call_structured_data
Create Date: 2026-07-15
"""
from alembic import op

revision = "0005_plan_configs"
down_revision = "0004_call_structured_data"
branch_labels = None
depends_on = None

SQL = '''alter table payments alter column gateway drop not null;

create table plan_configs (
  plan billing_plan primary key,
  name text not null,
  price_inr numeric(10,2),
  minutes_limit integer,
  description text not null default '',
  updated_at timestamptz not null default now()
);

insert into plan_configs (plan, name, price_inr, minutes_limit, description) values
  ('starter', 'Starter', 999, 60, 'For individuals getting started with AI voice calls.'),
  ('growth', 'Growth', 2999, 250, 'For growing teams running regular campaigns.'),
  ('pro', 'Pro', 7999, 800, 'For agencies and resellers at scale.'),
  ('enterprise', 'Enterprise', null, null, 'Custom volume, SLAs, and dedicated support.');

-- Backend uses the service-role DB connection (bypasses RLS) for all billing
-- reads/writes today, so we skip RLS policies here for simplicity — access
-- control is enforced in the API layer (require_role(SUPER_ADMIN)).
'''


def upgrade() -> None:
    op.execute(SQL)


def downgrade() -> None:
    op.execute("drop table if exists plan_configs cascade")
