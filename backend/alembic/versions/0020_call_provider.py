"""voice_calls.provider — which voice-AI platform placed the call.

Everything up to now is Vapi-only, so this defaults every existing row to
'vapi' and every new call also sets it explicitly. Exists so recording
retrieval (and anything else provider-specific) can dispatch correctly
once a second platform gets added, instead of assuming Vapi everywhere.

Revision ID: 0020_call_provider
Revises: 0019_call_ended_reason
Create Date: 2026-08-18
"""
from alembic import op

revision = "0020_call_provider"
down_revision = "0019_call_ended_reason"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("alter table voice_calls add column if not exists provider varchar(20) not null default 'vapi'")
    op.execute("create index if not exists ix_voice_calls_provider on voice_calls (provider)")


def downgrade() -> None:
    op.execute("drop index if exists ix_voice_calls_provider")
    op.execute("alter table voice_calls drop column if exists provider")
