# AGENTS.md — MindCare AI

Instructions for AI agents (and humans) working in this repository.

## What this project is

A mental-wellness app migrating from a Flask + SQLite prototype (now frozen in
`/legacy`) to a full-stack system with two roles:

- **Patient** — mood check-ins, chats with a supportive AI, sees own trends.
- **Psychologist** — sees linked patients' progress over time (consent-based,
  via `care_links`), reviews risk flags.

This is **not** a crisis service. Never add diagnosis, medication advice,
auto-emailing/SMS, or an invented "wellness score". Charts use only check-in
scores and mood values.

## Stack

- **Frontend**: Next.js (App Router) + TypeScript + Tailwind CSS + shadcn/ui +
  Recharts, in `/web`. Note: Next.js 16 renames `middleware.ts` → `proxy.ts`
  and enables Cache Components; read `web/node_modules/next/dist/docs/` before
  writing frontend code (see `web/AGENTS.md`).
- **Backend**: FastAPI (Python 3.11+) + Pydantic v2, in `/api`.
- **Database + Auth**: Supabase (Postgres, Supabase Auth, Row Level Security).
  No SQLite. Auth uses Supabase Auth with a role claim (`patient` |
  `psychologist`) — no hand-rolled login.
- **AI**: provider-agnostic LLM service layer in `api/app/services/llm.py`
  (env-configured provider/key), returning structured JSON
  (`reply, emotion, themes, risk_level, risk_reason`).
- **Hosting plan**: Vercel (`web`), Railway or Render (`api`). Do not rely on
  local filesystem for storage.

## Folder layout

```
/web          Next.js frontend (route groups: (public), (patient), (psychologist))
/api          FastAPI backend (app/routers, app/services, app/schemas, app/core)
/supabase     SQL migrations + seed (Phase 2)
/legacy       Old Flask prototype — reference ONLY
/docs         AUDIT.md, data model, RLS rules, env vars, deploy notes, TODO
```

## Rules

1. **Work in phases.** At the end of each phase, STOP, summarize what changed,
   list files touched, and wait for approval before continuing.
2. Before writing code in each phase, show a short plan (files to create/change).
   Wait for OK only for Phase 0; for later phases, proceed after the plan but
   stop at the end of the phase.
3. **Never commit secrets.** Provide `.env.example` files only. Read config from
   env vars.
4. **Never edit or delete source code in `/legacy` after it is moved there.** Removing
   cache/binary artifacts (`__pycache__/`, `*.pyc`, `*.db`) from `/legacy` is fine — they
   must not be committed anywhere in the repo.
5. Add basic tests for anything with logic (risk rules, auth guards, RLS
   expectations).
6. Keep commits small, one per logical step, with clear messages.
7. If something is ambiguous, ask instead of guessing.

## Phase status

| Phase | Scope | Status |
|---|---|---|
| 0 | Read-only audit → `docs/AUDIT.md` | ✅ done |
| 1 | Repo cleanup, `/web` + `/api` scaffolding | ✅ done |
| 2 | Supabase schema, auth, RLS, care-link flow | ✅ done |
| 3 | Port AI + risk logic into FastAPI | ✅ done |
| 4 | Connect the frontend | ⏳ |
| 5 | Docs + deploy readiness | ⏳ |

## Commands

```bash
# frontend
cd web && npm install && npm run dev      # dev server on :3000
cd web && npm test && npm run lint        # checks

# backend
cd api && pip install -r requirements.txt
cd api && uvicorn app.main:app --reload --port 8000
cd api && pytest                          # tests
```

## Porting decisions (from docs/AUDIT.md)

- HF emotion model → dropped; the LLM structured-output call provides `emotion`.
- `utils/risk_analyzer.py` keyword logic → `api/app/services/risk_rules.py` as an
  **independent second signal**; final risk = the higher of LLM vs. rules.
- `response_generator.py` → rewritten as an LLM system prompt (supportive and
  reflective; no diagnosing, no medication advice, never claims to be a
  therapist or promises confidentiality).
- `alerts/email_alert.py` auto-sending → **dropped**; replaced by a `risk_events`
  row the psychologist sees in their dashboard queue. No outbound email/SMS.
- Wellness score / synthetic mood chart → **dropped**.
