"""Data fix: campaigns created before the scheduler-status bugfix were left
in status='draft' even when they had a scheduled_at set, because
CampaignCreate never set status explicitly and the column default is
'draft'. The scheduler task only ever launches rows where
status = 'scheduled', so those campaigns were silently stuck forever,
regardless of how far in the past their scheduled_at had already passed.

This migration promotes any pre-existing draft campaign that still has a
scheduled_at to 'scheduled', so the scheduler will pick it up on its next
run. Campaigns without a scheduled_at (genuine drafts) are left untouched,
as are campaigns already running/paused/completed/canceled.

Revision ID: 0019_fix_stuck_draft_campaigns
Revises: 0018_asset_kind
Create Date: 2026-08-12
"""
from alembic import op

revision = "0019_fix_stuck_draft_campaigns"
down_revision = "0018_asset_kind"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        update campaigns
        set status = 'scheduled'
        where status = 'draft'
          and scheduled_at is not null
        """
    )


def downgrade() -> None:
    # Not reversible in a meaningful way — we can't tell which of these rows
    # were "genuinely" scheduled vs. originally stuck drafts. No-op.
    pass
