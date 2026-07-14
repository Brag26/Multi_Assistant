"""billing: subscriptions, payments, usage_logs

Revision ID: 0003_billing
Revises: 0002_contacts_campaigns_integrations
Create Date: 2026-07-14
"""
from alembic import op

revision = "0003_billing"
down_revision = "0002_contacts_campaigns_integrations"
branch_labels = None
depends_on = None

LOCAL_SQL = '''create type billing_plan as enum ('starter', 'growth', 'pro', 'enterprise');
create type subscription_status as enum ('trialing', 'active', 'past_due', 'canceled', 'expired');
create type payment_gateway as enum ('stripe', 'razorpay');
create type payment_status as enum ('pending', 'success', 'failed', 'refunded');

alter table voice_calls add column if not exists initiated_by_user_id uuid;
create index if not exists ix_voice_calls_initiated_by_user_id on voice_calls (initiated_by_user_id);

create table subscriptions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  user_id uuid not null,
  plan billing_plan not null,
  status subscription_status not null default 'trialing',
  gateway payment_gateway,
  gateway_customer_id text,
  gateway_subscription_id text,
  minutes_limit integer not null default 0,
  minutes_used integer not null default 0,
  warning_sent_at timestamptz,
  current_period_start timestamptz,
  renewal_date timestamptz,
  canceled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index ix_subscriptions_tenant_id on subscriptions (tenant_id);
create index ix_subscriptions_user_id on subscriptions (user_id);
create index ix_subscriptions_gateway_subscription_id on subscriptions (gateway_subscription_id);

create table payments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  user_id uuid not null,
  subscription_id uuid references subscriptions(id) on delete set null,
  gateway payment_gateway not null,
  gateway_payment_id text,
  gateway_order_id text,
  amount numeric(10,2) not null,
  currency text not null default 'INR',
  status payment_status not null default 'pending',
  plan billing_plan,
  receipt_url text,
  raw_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index ix_payments_tenant_id on payments (tenant_id);
create index ix_payments_user_id on payments (user_id);
create index ix_payments_subscription_id on payments (subscription_id);
create index ix_payments_gateway_payment_id on payments (gateway_payment_id);
create index ix_payments_gateway_order_id on payments (gateway_order_id);

create table usage_logs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  user_id uuid not null,
  subscription_id uuid references subscriptions(id) on delete set null,
  call_id uuid references voice_calls(id) on delete set null,
  minutes numeric(10,2) not null,
  created_at timestamptz not null default now()
);
create index ix_usage_logs_tenant_id on usage_logs (tenant_id);
create index ix_usage_logs_user_id on usage_logs (user_id);
create index ix_usage_logs_subscription_id on usage_logs (subscription_id);
create index ix_usage_logs_call_id on usage_logs (call_id);

alter table subscriptions enable row level security;
alter table payments enable row level security;
alter table usage_logs enable row level security;

-- Users can read their own subscription; tenant admins/managers can read all in tenant.
create policy "own subscription readable" on subscriptions for select
  using (user_id = auth.uid() or has_tenant_role(tenant_id, array['tenant_admin','manager']::app_role[]));
create policy "admins manage subscriptions" on subscriptions for all
  using (has_tenant_role(tenant_id, array['tenant_admin']::app_role[]))
  with check (has_tenant_role(tenant_id, array['tenant_admin']::app_role[]));

create policy "own payments readable" on payments for select
  using (user_id = auth.uid() or has_tenant_role(tenant_id, array['tenant_admin','manager']::app_role[]));
create policy "admins manage payments" on payments for all
  using (has_tenant_role(tenant_id, array['tenant_admin']::app_role[]))
  with check (has_tenant_role(tenant_id, array['tenant_admin']::app_role[]));

create policy "own usage readable" on usage_logs for select
  using (user_id = auth.uid() or has_tenant_role(tenant_id, array['tenant_admin','manager']::app_role[]));
create policy "admins manage usage" on usage_logs for all
  using (has_tenant_role(tenant_id, array['tenant_admin']::app_role[]))
  with check (has_tenant_role(tenant_id, array['tenant_admin']::app_role[]));
'''


def upgrade() -> None:
    op.execute(LOCAL_SQL)


def downgrade() -> None:
    op.execute("drop table if exists usage_logs cascade")
    op.execute("drop table if exists payments cascade")
    op.execute("drop table if exists subscriptions cascade")
    op.execute("alter table voice_calls drop column if exists initiated_by_user_id")
    op.execute("drop type if exists payment_status")
    op.execute("drop type if exists payment_gateway")
    op.execute("drop type if exists subscription_status")
    op.execute("drop type if exists billing_plan")
