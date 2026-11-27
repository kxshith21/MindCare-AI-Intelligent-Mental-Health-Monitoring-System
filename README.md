# MindCare AI — migration in progress

Mental-wellness app with two roles: **patients** (mood check-ins, supportive AI
chat, own trends) and **psychologists** (linked patients' progress, consent-based,
risk-flag review).

> **This is not a crisis service or a substitute for professional care.**

The original Flask + SQLite prototype lives unchanged in [`legacy/`](legacy/) for
reference only — see [`docs/AUDIT.md`](docs/AUDIT.md) for the Phase 0 audit.
The current codebase is a fresh stack being built in phases (see [`AGENTS.md`](AGENTS.md)).

## Stack

| Layer | Tech |
|---|---|
| Frontend (`/web`) | Next.js 16 (App Router) + TypeScript + Tailwind CSS + shadcn/ui + Recharts |
| Backend (`/api`) | FastAPI (Python 3.11+) + Pydantic v2 |
| Database + Auth | Supabase (Postgres, Supabase Auth, Row Level Security) |
| AI | Provider-agnostic LLM service layer (`api/app/services/llm.py`, Phase 3) |

## Repository layout

```
/web          Next.js frontend
/api          FastAPI backend
/supabase     SQL migrations + seed (Phase 2)
/legacy       Old Flask prototype — reference only, never edited
/docs         Audit, data model, deploy notes
```

## Local setup

Prerequisites: Node.js 20+, Python 3.11+, npm.

### Frontend (`/web`)

```bash
cd web
npm install
cp .env.example .env.local   # fill in values (Supabase from Phase 2)
npm run dev                  # http://localhost:3000
```

Tests / checks:

```bash
npm test        # vitest (route-guard tests)
npm run lint    # eslint
npm run build   # production build
```

### Backend (`/api`)

```bash
cd api
python -m venv .venv
.venv\Scripts\activate       # Windows; on macOS/Linux: source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env         # fill in SUPABASE_URL etc.
uvicorn app.main:app --reload --port 8000
```

Health check: `GET http://localhost:8000/health`

Tests:

```bash
pytest
```

## Status

- **Phase 0** — read-only audit: [`docs/AUDIT.md`](docs/AUDIT.md) ✅
- **Phase 1** — repo cleanup + `/web` and `/api` scaffolding ✅
- **Phase 2** — Supabase schema, auth, RLS ✅ ([RLS.md](docs/RLS.md), [DATA_MODEL.md](docs/DATA_MODEL.md))
- **Phase 3** — AI + risk logic in FastAPI ⏳
- **Phase 4** — connect the frontend ⏳
- **Phase 5** — docs and deploy readiness ⏳

## Known limits (by design)

- No outbound email/SMS alerts — risk flags surface in the psychologist's queue.
- No diagnosis, no medication advice, no invented "wellness score".
- Charts use only check-in scores and mood values.
