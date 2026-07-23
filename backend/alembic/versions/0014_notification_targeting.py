"""notifications.user_id (targeted notifications) + support_escalations reply

Revision ID: 0014_notification_targeting
Revises: 0013_support_chatbot
Create Date: 2026-07-22
"""
from alembic import op

revision = "0014_notification_targeting"
down_revision = "0013_support_chatbot"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("alter table notifications add column if not exists user_id uuid")
    op.execute("create index if not exists ix_notifications_user_id on notifications (user_id)")
    op.execute("alter table support_escalations add column if not exists reply text")
    op.execute("alter table support_escalations add column if not exists replied_at timestamptz")


def downgrade() -> None:
    op.execute("alter table support_escalations drop column if exists replied_at")
    op.execute("alter table support_escalations drop column if exists reply")
    op.execute("drop index if exists ix_notifications_user_id")
    op.execute("alter table notifications drop column if exists user_id")
