"""call structured data + success evaluation

Revision ID: 0004_call_structured_data
Revises: 0003_billing
Create Date: 2026-07-15
"""
from alembic import op

revision = "0004_call_structured_data"
down_revision = "0003_billing"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("alter table voice_calls add column if not exists structured_data jsonb")
    op.execute("alter table voice_calls add column if not exists success_evaluation text")


def downgrade() -> None:
    op.execute("alter table voice_calls drop column if exists structured_data")
    op.execute("alter table voice_calls drop column if exists success_evaluation")
