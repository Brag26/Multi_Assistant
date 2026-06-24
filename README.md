# VoiceOps AI — Multi-Assistant Platform

An AI-powered voice operations platform for managing outbound/inbound call workflows, lead tracking, CRM, and real-time monitoring.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 15, React 19, TypeScript, Tailwind CSS |
| Backend | FastAPI, Python, SQLAlchemy, Alembic |
| Database | PostgreSQL via Supabase |
| Realtime | Supabase Realtime (websocket + polling fallback) |
| Auth | Supabase Auth |
| Task Queue | Celery + Redis |
| Deployment | Vercel (frontend), Docker (backend) |

---

## Project Structure

```
Multi_Assistant/
├── frontend/          # Next.js app (deployed to Vercel)
├── backend/           # FastAPI app (Docker)
│   ├── app/
│   │   ├── api/       # Route handlers
│   │   ├── application/  # Services, schemas, workflow engine
│   │   ├── domain/    # Enums, domain models
│   │   └── infrastructure/  # DB models, repositories
│   ├── alembic/       # DB migrations
│   └── tests/         # 89 tests across workflows, monitoring, engine
└── supabase/          # SQL migrations
```

---

## Features

- **Visual Workflow Builder** — drag-and-drop canvas with 11 triggers, 11 actions, 6 logic nodes (if/else, switch, wait, merge, parallel, stop), version history, and JSON import/export
- **Real-Time Dashboard** — live active-call feed, KPI cards, Supabase Realtime with polling fallback
- **Call Monitoring** — per-call event timelines, AI summaries, in-browser audio playback
- **CRM** — leads, contacts, lead scoring, appointments, DNC list
- **Analytics** — charts for calls over time, lead funnel, call outcomes (7/14/30/90 day ranges)
- **Campaigns** — outbound campaign management with scheduling
- **Notifications** — real-time notification center with unread badge
- **Audit Logs** — filterable, expandable log entries with raw metadata
- **Webhooks & Integrations** — calendar OAuth, webhook management

---

## Local Development

### Prerequisites

- Node.js 18+
- Python 3.11+
- PostgreSQL (or a Supabase project)
- Redis (for Celery)

### Frontend

```bash
cd frontend
npm install
cp .env.example .env.local   # fill in your Supabase + API URL
npm run dev
```

Runs at `http://localhost:3000`.

### Backend

```bash
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp env/.env.example env/.env   # fill in DB and Redis URLs
alembic upgrade head
uvicorn app.main:app --reload
```

Runs at `http://localhost:8000`.

### Run Tests

```bash
cd backend
pytest tests/ -v
# Expected: 89 tests passing
```

---

## Environment Variables

### Frontend (`frontend/.env.local`)

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
NEXT_PUBLIC_API_URL=http://localhost:8000/api/v1
NEXT_PUBLIC_DEMO_TENANT_ID=your-tenant-id   # optional, skips auth in dev
```

### Backend (`backend/env/.env`)

```env
DATABASE_URL=postgresql+asyncpg://user:password@localhost/voiceops
REDIS_URL=redis://localhost:6379
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_KEY=your-service-role-key
```

---

## Database Migrations

Migrations live in `backend/alembic/versions/` and `supabase/`.

Apply all migrations:
```bash
# Via Alembic
cd backend && alembic upgrade head

# Or via Supabase CLI
supabase db push
```

After applying `supabase/0004_workflow_builder_realtime.sql`, enable Realtime in the Supabase dashboard for these tables: `voice_calls`, `notifications`, `appointments`, `workflow_runs`, `lead_activities`.

---

## Deployment

### Frontend → Vercel

1. Connect your GitHub repo to Vercel
2. Set **Root Directory** to `frontend`
3. Set **Framework Preset** to `Next.js`
4. Add environment variables in Vercel project settings
5. Deploy

### Backend → Docker

```bash
cd backend
docker build -t voiceops-backend .
docker run -p 8000:8000 --env-file env/.env voiceops-backend
```

---

## Architecture Notes

- **Workflow builder** uses a pure SVG canvas (no ReactFlow dependency) — ~500 kB lighter. Node/edge types are ReactFlow-compatible if you want to migrate later.
- **Backwards compatibility** — workflows can store their graph either in top-level `nodes`/`edges` columns (new builder) or inside `config` (legacy). The engine merges both transparently.
- **Realtime** — `useRealtimeDashboard` subscribes via websocket and falls back to 10-second polling if the channel drops.
- **Version snapshots** — every Save in the workflow builder writes a snapshot to `workflow_versions`. Any prior version can be restored with one click.
