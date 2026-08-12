"""voice_calls.ended_reason — stores Vapi's raw endedReason (e.g.
"call.start.error-get-transport") for every call, not just failed ones.
Previously the webhook handler read this value out of the Vapi payload but
never persisted it, so the app had no way to show *why* a call failed
without going to Vapi's own dashboard.

Revision ID: 0020_call_ended_reason
Revises: 0019_fix_stuck_draft_campaigns
Create Date: 2026-08-12
"""
from alembic import op

revision = "0020_call_ended_reason"
down_revision = "0019_fix_stuck_draft_campaigns"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("alter table voice_calls add column if not exists ended_reason varchar(120)")


def downgrade() -> None:
    op.execute("alter table voice_calls drop column if exists ended_reason")
