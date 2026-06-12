# AI Voice Operations Platform — Feature Addition Guide

## What was added

### Visual Workflow Builder (n8n-style)
- Drag-and-drop SVG canvas with no extra graph library dependency
- Resizable node inspector panel
- Full palette of 11 triggers, 11 actions, 6 logic nodes
- Bezier edges drawn as SVG with click-to-delete
- If/Else nodes with `true`/`false` output ports
- Version history with one-click restore
- Activate / Deactivate toggle
- Clone workflow
- Export to JSON / Import from JSON file

### Real-Time Dashboard
- Supabase Realtime subscriptions with polling fallback
- Live active-call feed refreshing every 8 s
- Connection status badge (Live / Polling)
- Recent calls table
- Four KPI stat cards (Active Calls, Calls Today, Leads Today, Appts Today)

### Call Monitoring
- Full call list with status filter tabs
- Per-call event timeline (status_update, transcript_chunk, latency_ping)
- AI summary display
- In-browser audio player for recordings

### Lead Tracking
- Searchable contact list with lead-status funnel filter buttons
- Per-contact activity timeline (call, note, status_change, appointment)
- One-click API to log new activities

### Appointment Tracking
- Status-filtered list (scheduled / completed / canceled)
- Complete / Cancel actions inline

### Notification Center
- Unread badge on Bell icon in shell header
- Click-to-mark-read per notification
- Mark All Read button
- Full-page `/notifications` route + compact widget for dashboard

### Analytics Dashboard
- Day-range selector (7 / 14 / 30 / 90 days)
- Line chart: calls over time
- Horizontal bar chart: lead funnel
- Pie chart: call outcomes
- KPI cards + summary stats grid
- Powered by `recharts`

### Audit Logs
- Filterable by resource type
- Expandable rows showing raw metadata JSON
- Collapsible row detail

### Workflow Execution Engine (extended)
- Supports both new `nodes[]`/`edges[]` format and legacy `config.connections`
- All 11 action types fully implemented
- All 6 logic types (if_else, switch, wait, merge, parallel, stop)
- If/Else `__true`/`__false` virtual edge handle resolution

---

## File map — drop each file into the corresponding path

```
voice-ops-platform/
├── supabase/migrations/
│   └── 0004_workflow_builder_realtime.sql        ← NEW migration
│
├── backend/
│   ├── pytest.ini                                ← NEW
│   ├── tests/
│   │   ├── conftest.py                           ← NEW
│   │   ├── test_workflows.py                     ← NEW  (47 tests)
│   │   ├── test_monitoring.py                    ← NEW  (14 tests)
│   │   └── test_engine.py                        ← NEW  (28 tests)
│   └── app/
│       ├── domain/
│       │   └── enums.py                          ← REPLACE
│       ├── application/
│       │   ├── schemas.py                        ← REPLACE
│       │   ├── services.py                       ← REPLACE
│       │   └── engine.py                         ← REPLACE
│       ├── infrastructure/
│       │   ├── db/
│       │   │   └── models.py                     ← REPLACE
│       │   └── repositories/
│       │       ├── workflows.py                  ← REPLACE
│       │       ├── calls.py                      ← REPLACE
│       │       ├── notifications.py              ← REPLACE
│       │       ├── monitoring.py                 ← NEW
│       │       └── audit.py                      ← NEW
│       └── api/
│           ├── deps.py                           ← REPLACE
│           └── v1/
│               ├── workflows.py                  ← REPLACE
│               ├── monitoring.py                 ← NEW
│               └── router.py                     ← REPLACE
│
└── frontend/
    ├── package.json                              ← REPLACE (adds recharts)
    ├── store/
    │   └── session.ts                            ← NEW (if not present)
    ├── lib/
    │   ├── api.ts                                ← REPLACE
    │   └── useRealtimeDashboard.ts               ← NEW
    ├── components/
    │   ├── dashboard/
    │   │   ├── shell.tsx                         ← REPLACE (new nav links)
    │   │   ├── WorkflowList.tsx                  ← REPLACE
    │   │   └── NotificationCenter.tsx            ← NEW
    │   └── workflow-builder/
    │       └── WorkflowBuilder.tsx               ← NEW
    └── app/(dashboard)/
        ├── dashboard/page.tsx                    ← REPLACE
        ├── workflows/page.tsx                    ← REPLACE
        ├── monitoring/page.tsx                   ← NEW
        ├── leads/page.tsx                        ← NEW
        ├── appointments/page.tsx                 ← NEW
        ├── notifications/page.tsx                ← NEW
        ├── analytics/page.tsx                    ← NEW
        └── audit-logs/page.tsx                   ← NEW
```

---

## Integration steps

### 1. Apply the database migration

In your Supabase project SQL editor, run:
```
supabase/migrations/0004_workflow_builder_realtime.sql
```

Or via CLI:
```bash
supabase db push
```

### 2. Install frontend dependency

```bash
cd frontend
npm install recharts
# or: npm install  (package.json already includes it)
```

### 3. Run backend tests

```bash
cd backend
pip install pytest pytest-asyncio
pytest tests/ -v
```

Expected: **89 tests passing** across test_workflows, test_monitoring, test_engine.

### 4. Enable Supabase Realtime

In the Supabase dashboard → Database → Replication, enable Realtime for:
- `voice_calls`
- `notifications`
- `appointments`
- `workflow_runs`
- `lead_activities`

The migration script attempts this automatically but it requires the
`supabase_realtime` publication to exist first.

### 5. Environment variables

No new env vars required. Existing `.env`:
```
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
NEXT_PUBLIC_API_URL=http://localhost:8000/api/v1
NEXT_PUBLIC_DEMO_TENANT_ID=...   # optional: skips auth for local dev
```

---

## Architecture decisions

### Why pure SVG for the workflow builder?
Avoids adding ReactFlow (~500 kB) as a dependency. The SVG canvas supports
all required interactions: drag, pan, connect ports, delete. Switching to
ReactFlow later is straightforward — the `WorkflowNode`/`WorkflowEdge` types
are already compatible with ReactFlow's node/edge format.

### Why both `nodes[]` on the model AND inside `config`?
Backwards compatibility. Existing workflows store their graph in `config`.
New builder workflows use top-level `nodes`/`edges` columns added by the 0004
migration. The engine and repositories transparently merge both.

### Supabase Realtime + polling fallback
The `useRealtimeDashboard` hook subscribes via websocket and degrades to
10-second polling if the channel drops or is unavailable (e.g. Realtime
disabled in a self-hosted Supabase instance).

### Version snapshots
Every time the user clicks **Save** in the builder, the graph is persisted to
`voice_workflows.nodes`/`edges` AND a snapshot is written to
`workflow_versions`. Restore reverts the live workflow to any prior snapshot.
