"""assistant_assignments.phone_number + voice_calls.from_phone_number

Lets superadmin/reseller attach a specific Twilio number when assigning an
assistant, and lets us track usage (call volume/minutes) per number.

Revision ID: 0011_phone_number_tracking
Revises: 0010_membership_timezone
Create Date: 2026-07-18
"""
from alembic import op

revision = "0011_phone_number_tracking"
down_revision = "0010_membership_timezone"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("alter table assistant_assignments add column if not exists phone_number text")
    op.execute("alter table voice_calls add column if not exists from_phone_number text")
    op.execute("create index if not exists ix_voice_calls_from_phone_number on voice_calls (from_phone_number)")


def downgrade() -> None:
    op.execute("drop index if exists ix_voice_calls_from_phone_number")
    op.execute("alter table voice_calls drop column if exists from_phone_number")
    op.execute("alter table assistant_assignments drop column if exists phone_number")
