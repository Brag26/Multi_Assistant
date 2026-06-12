-- Migration 0004: Visual Workflow Builder + Realtime Dashboard
-- Extends voice_workflows with builder-specific columns
-- and adds all supporting tables for the feature set

-- ──────────────────────────────────────────────
-- 1. Extend voice_workflows for the visual builder
-- ──────────────────────────────────────────────
alter table voice_workflows
  add column if not exists trigger_type      text,
  add column if not exists cron_expression   text,
  add column if not exists nodes             jsonb not null default '[]',
  add column if not exists edges             jsonb not null default '[]',
  add column if not exists builder_version   int  not null default 1;

-- Trigger type constraint
alter table voice_workflows
  add constraint chk_workflows_trigger_type check (
    trigger_type is null or trigger_type in (
      'campaign_started','campaign_completed',
      'call_started','call_answered','call_completed','call_failed',
      'lead_qualified','intent_detected','appointment_booked',
      'incoming_make_webhook','cron'
    )
  );

-- ──────────────────────────────────────────────
-- 2. Workflow execution log with richer step data
-- ──────────────────────────────────────────────
-- (workflow_runs and workflow_run_steps created in 0003 — we extend them)
alter table workflow_runs
  add column if not exists error_message text,
  add column if not exists completed_at  timestamptz;

alter table workflow_run_steps
  add column if not exists started_at   timestamptz,
  add column if not exists completed_at timestamptz,
  add column if not exists duration_ms  int;

-- ──────────────────────────────────────────────
-- 3. Call monitoring snapshots
-- ──────────────────────────────────────────────
create table if not exists call_monitoring (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null references tenants(id) on delete cascade,
  call_id        uuid not null references voice_calls(id) on delete cascade,
  event_type     text not null,          -- 'status_update','transcript_chunk','latency_ping'
  event_data     jsonb not null default '{}',
  recorded_at    timestamptz not null default now()
);

create index if not exists ix_call_monitoring_call       on call_monitoring(call_id);
create index if not exists ix_call_monitoring_tenant_ts  on call_monitoring(tenant_id, recorded_at desc);

-- ──────────────────────────────────────────────
-- 4. Lead activity feed
-- ──────────────────────────────────────────────
create table if not exists lead_activities (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references tenants(id) on delete cascade,
  contact_id   uuid not null references contacts(id) on delete cascade,
  activity_type text not null,            -- 'call','note','status_change','appointment'
  summary      text,
  metadata     jsonb not null default '{}',
  created_at   timestamptz not null default now()
);

create index if not exists ix_lead_activities_contact    on lead_activities(contact_id);
create index if not exists ix_lead_activities_tenant_ts  on lead_activities(tenant_id, created_at desc);

-- ──────────────────────────────────────────────
-- 5. Analytics snapshots (pre-aggregated daily)
-- ──────────────────────────────────────────────
create table if not exists analytics_snapshots (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references tenants(id) on delete cascade,
  snapshot_date   date not null,
  metrics         jsonb not null default '{}',
  created_at      timestamptz not null default now(),
  unique (tenant_id, snapshot_date)
);

create index if not exists ix_analytics_snapshots_tenant_date on analytics_snapshots(tenant_id, snapshot_date desc);

-- ──────────────────────────────────────────────
-- 6. RLS policies for new tables
-- ──────────────────────────────────────────────
alter table call_monitoring    enable row level security;
alter table lead_activities    enable row level security;
alter table analytics_snapshots enable row level security;

-- call_monitoring
create policy "members read call monitoring" on call_monitoring for select
  using (has_tenant_role(tenant_id, array['tenant_admin','manager','agent','viewer']::app_role[]));
create policy "managers write call monitoring" on call_monitoring for all
  using (has_tenant_role(tenant_id, array['tenant_admin','manager','agent']::app_role[]))
  with check (has_tenant_role(tenant_id, array['tenant_admin','manager','agent']::app_role[]));

-- lead_activities
create policy "members read lead activities" on lead_activities for select
  using (has_tenant_role(tenant_id, array['tenant_admin','manager','agent','viewer']::app_role[]));
create policy "agents write lead activities" on lead_activities for all
  using (has_tenant_role(tenant_id, array['tenant_admin','manager','agent']::app_role[]))
  with check (has_tenant_role(tenant_id, array['tenant_admin','manager','agent']::app_role[]));

-- analytics_snapshots
create policy "members read analytics" on analytics_snapshots for select
  using (has_tenant_role(tenant_id, array['tenant_admin','manager','agent','viewer']::app_role[]));
create policy "managers write analytics" on analytics_snapshots for all
  using (has_tenant_role(tenant_id, array['tenant_admin','manager']::app_role[]))
  with check (has_tenant_role(tenant_id, array['tenant_admin','manager']::app_role[]));

-- ──────────────────────────────────────────────
-- 7. Enable Realtime on new tables
-- ──────────────────────────────────────────────
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table workflow_runs;
    alter publication supabase_realtime add table call_monitoring;
    alter publication supabase_realtime add table lead_activities;
    alter publication supabase_realtime add table notifications;
  end if;
exception when others then
  raise notice 'Realtime publication update skipped: %', sqlerrm;
end $$;
