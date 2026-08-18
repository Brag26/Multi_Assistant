"""voice_calls.ended_reason — Vapi's raw endedReason, stored on the call row.

This column already existed in the SQLAlchemy model and every INSERT into
voice_calls (e.g. from _dial_campaign_now) already includes it — but the
migration for it was never created, so every attempt to dial a campaign
failed with UndefinedColumnError and the campaign silently stayed stuck in
"running" with nothing actually happening.

Revision ID: 0019_call_ended_reason
Revises: 0018_asset_kind
Create Date: 2026-08-18
"""
from alembic import op

revision = "0019_call_ended_reason"
down_revision = "0018_asset_kind"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("alter table voice_calls add column if not exists ended_reason varchar(60)")


def downgrade() -> None:
    op.execute("alter table voice_calls drop column if exists ended_reason")
