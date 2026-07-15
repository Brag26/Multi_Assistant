"""addon_configs — one-time minute top-up packs

Revision ID: 0007_addons
Revises: 0006_integration_profiles
Create Date: 2026-07-15
"""
from alembic import op

revision = "0007_addons"
down_revision = "0006_integration_profiles"
branch_labels = None
depends_on = None

SQL = '''alter table payments add column if not exists addon_key text;

create table addon_configs (
  key text primary key,
  name text not null,
  price_inr numeric(10,2) not null,
  minutes integer not null,
  description text not null default '',
  updated_at timestamptz not null default now()
);

insert into addon_configs (key, name, price_inr, minutes, description) values
  ('extra_minutes', 'Extra Minutes Pack', 5000, 100, '+100 minutes added instantly to your current plan.');
'''


def upgrade() -> None:
    op.execute(SQL)


def downgrade() -> None:
    op.execute("drop table if exists addon_configs cascade")
    op.execute("alter table payments drop column if exists addon_key")
