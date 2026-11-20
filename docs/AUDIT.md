# Phase 0 Audit — mind-AI prototype (Flask + SQLite) → full-stack migration

Read-only audit of the repository before migration. Date: 2026-11-20.
Baseline git tag: `v0-prototype` (commit `5e8d1e6`).

---

## a) What each file actually does today

### Backend (Flask)

| File | What it actually does |
|---|---|
| `app.py` | App factory. Registers 2 blueprints, creates the SQLite table on startup, strips legacy disclaimers from stored replies, **seeds sample data by default** (`SEED_SAMPLE_DATA=true`), injects `alert_count` into all templates, serves on `127.0.0.1:5001`. Docstring references `run.bat`/`run.ps1` — **these files do not exist**. |
| `main.py` | `print("Hello from...")` stub. Unused, untracked. |
| `routes/chat_routes.py` | `GET /` → landing; `GET /workspace` and `GET /chat` → workspace page; `POST /predict` → emotion detect → risk score → template reply → SQLite insert → optional email alert. **No authentication of any kind** — every visitor reads/writes one shared conversation log. |
| `routes/dashboard_routes.py` | `GET /dashboard` → redirect to workspace anchor; `GET /analytics` → JSON aggregates + **invented `wellness_score`** (`100 − avg_risk×40 − emergency_rate×50`). |
| `models/emotion_model.py` | Lazy-loads HF `j-hartmann/emotion-english-distilroberta-base`, maps 7 labels → 5 emotions, keyword fallback if transformers missing. **With `requirements.txt` alone (flask only), transformers is never installed → the keyword fallback always runs in the default install.** |
| `utils/risk_analyzer.py` | Regex keyword scoring: 9 high-risk phrases (×0.45 each), 9 medium phrases (×0.2 each), +0.1 distress-emotion boost, +0.05 long-message boost, optional MentalBERT boost. Threshold 0.65 → "high". Levels: `minimal/low/medium/high`. |
| `utils/response_generator.py` | Rule/template-based replies: emotion openers, reflection heuristics, topic lines, random follow-ups. **`HIGH_RISK_RESPONSE` hardcodes 988 (US-only)**. Also provides `strip_disclaimer()` used to scrub stored replies. |
| `utils/workspace_context.py` | Template context builder; **duplicates** the wellness-score formula. |
| `utils/mentalbert_optional.py` | Optional `USE_MENTALBERT=true` classifier boost. Dead code by default (env off, deps not installed). |
| `database/db.py` | SQLite helpers; special-cases `VERCEL` by copying the `.db` to `/tmp`. One flat `conversations` table (message, emotion, risk score, reply, flag, timestamp). **No user column at all.** |
| `database/sample_data.py` | Seeds 8 hardcoded + 7×(1–3) random rows on first run when the table is empty. |
| `alerts/email_alert.py` | Builds alert payload; with `SMTP_ENABLED=false` (default) just logs `CRITICAL` and returns `sent: False`. If enabled, sends via env SMTP to `admin@example.com`. **"Emergency alert system" = a log line by default.** |

### Frontend (Jinja2 + Bootstrap 5.3 + Chart.js 4 via CDN)

| File | What it actually does |
|---|---|
| `templates/landing.html` | Marketing landing (rendered at `/`). Claims "Private & supportive", "Wellness dashboard... mental wellness score". |
| `templates/workspace.html` + `includes/chat_panel.html` | The real main screen: chat + live insights (wellness ring, stats, emotion pie) + full analytics + alerts + history. Crisis panel **hardcodes 988 US**. |
| `templates/chat.html`, `templates/dashboard.html`, `templates/base.html` | **Orphaned** — no route renders them (`dashboard_page` redirects instead). |
| `templates/base_app.html`, `includes/sidebar.html` | App shell + anchor nav with alert badge. |
| `static/js/chat.js` | POSTs to `/predict`, simulated typing delay, emotion badges, toggles risk panel, **strips disclaimer client-side too**. |
| `static/js/dashboard.js` | Chart.js: emotion trend, doughnut, risk timeline, plus a **synthetic "Mood wellness" chart** derived from risk (`100 − risk×100`), metrics incl. wellness score, history/alert cards. |
| `static/js/workspace.js`, `app.js`, `landing.js` | Mobile tabs, insights refresh after message, sidebar/scroll-reveal, smooth anchors. |
| `static/css/style.css` | 819 lines of custom glassmorphism CSS. |

### Repo hygiene

- **Tracked in git:** `__pycache__/*.pyc` (14 files), `database/mental_health.db` (24.5 KB binary). **No `.gitignore` exists** (`.venv` only escapes because it contains its own ignore file).
- **Untracked:** `main.py`, `pyproject.toml` (empty metadata, no deps), `.python-version` (3.11).
- **No tests, no auth, no users, no roles, no CI.** Git history: 2 commits ("Add files via upload", "Create README.md").
- `requirements.txt` = flask only; `requirements-local.txt` = flask + torch/transformers (needed for the HF model).

---

## b) README claims vs. reality

| README claim | Reality |
|---|---|
| Transformer NLP (`j-hartmann/emotion-english-distilroberta-base`) | Only if you install `requirements-local.txt`. Default install → keyword fallback only. |
| "Emergency alert triggering / Crisis monitoring" | Keyword flag + `logger.critical` line. No email by default, no monitoring, no notifications. |
| "Mood improvement analysis" | Synthetic chart computed from risk score — not measured mood. |
| "Mental wellness score" | **Invented formula**, unvalidated, presented as `/100` on dashboards. |
| "Private" / conversation history | **No auth, no user concept** — all visitors share one global conversation table. Anyone sees everyone's messages and risk scores. |
| "Full Stack Web Development" | Server-rendered Flask + vanilla JS. |
| Badge: Python 3.10 | `.python-version` says 3.11; `pyproject.toml` says `>=3.11`. |
| Run instructions (`run.bat` / `run.ps1`) | Files don't exist; README itself ends mid-diagram with **no install/run steps at all**. |
| "Emergency Alert System" (architecture diagram) | Log-only unless `SMTP_ENABLED=true`. |

---

## c) Demo / sample data

1. **`database/mental_health.db`** — committed to git: 34 rows, timestamps `2026-05-17 → 2026-05-23`, 1 emergency-flagged. Demo data in version control.
2. **`database/sample_data.py`** — auto-seeds hardcoded + random conversations on first run (default ON).
3. Landing page mock chat bubbles (static HTML), `RESPONSES` dict of canned replies in `sample_data.py`.

---

## d) Porting decisions

**Port (with translation):**
- `risk_analyzer.py` keyword logic → `/api/services/risk_rules.py` as an independent second signal.
  Level mapping to `low|elevated|high`: rules `high`→`high`, `medium`→`elevated`, `low`/`minimal`→`low`.
  Final risk = the higher of (LLM risk_level, rules risk_level).
- Disclaimer intent → persistent UI disclaimer in `/web`.
- Crisis-resources intent → region-based (Tele-MANAS for `region=IN`, 988 for `US`, etc.) instead of hardcoded 988.

**Rewrite:**
- `response_generator.py` → LLM system prompt (supportive/reflective; no diagnosing, no medication advice,
  never claims therapist status or promises confidentiality).
- All routes → the Phase 3 FastAPI endpoints; SQLite → Supabase + RLS; Jinja/vanilla JS → Next.js;
  analytics → check-in-based charts only.

**Drop:**
- HF emotion model + `mentalbert_optional.py` (LLM structured output provides `emotion`).
- `alerts/email_alert.py` auto-sending → `risk_events` row + psychologist queue. No outbound email/SMS.
- **Wellness score** and the synthetic "Mood wellness" chart (both `_calculate_wellness_score` copies + `dashboard.js` `renderMood`).
- SQLite, the `.db` file (from git tracking), sample-data seeder (replaced by labeled `supabase/seed.sql`),
  orphaned templates (`chat.html`, `dashboard.html`, `base.html`), `main.py`, empty `pyproject.toml`.

---

## Proposed folder tree

```
/
├── README.md                  # rewritten: local setup (Phase 1, refined Phase 5)
├── AGENTS.md                  # stack, layout, rules
├── .gitignore                 # python, node, .env*, .next, .venv, *.db
├── web/                       # Next.js (App Router) + TS + Tailwind + shadcn/ui + Recharts
│   ├── src/proxy.ts            # route protection (Next 16 renamed middleware.ts → proxy.ts)
│   ├── src/app/
│   │   ├── (public)/           # landing, login, signup
│   │   ├── (patient)/          # patient/dashboard, patient/chat, patient/checkin
│   │   └── (psychologist)/     # psychologist/dashboard, psychologist/patients/[id]
│   ├── components/  lib/api.ts  lib/supabase.ts
│   └── .env.example
├── api/                       # FastAPI (Py 3.11+, Pydantic v2)
│   ├── app/main.py  routers/  services/ (llm.py, risk_rules.py)
│   ├── schemas/  core/ (config.py, auth.py)
│   ├── tests/
│   └── .env.example
├── supabase/
│   ├── migrations/            # profiles, care_links, checkins, messages, risk_events, ...
│   └── seed.sql               # clearly labeled fake data, local dev only
├── legacy/                    # old Flask prototype, moved unchanged, never edited again
│   ├── app.py  routes/  models/  utils/  database/  templates/  static/  alerts/
│   ├── requirements*.txt  README.md (old)  ...
└── docs/
    ├── AUDIT.md               # this audit
    └── (Phase 5) DATA_MODEL.md, RLS.md, ENV.md, DEPLOY.md, TODO.md
```

---

## Phase 1 plan (files to create/change)

Revised per review feedback before execution.

1. **Tag:** `git tag v0-prototype` on current HEAD (`5e8d1e6`). ✅ done during Phase 0.
2. **Delete (do NOT move to `/legacy`):** `main.py`, `pyproject.toml`, `.python-version` —
   prototype artifacts that never belonged in the frozen snapshot.
3. **Delete cache/binary:** all `__pycache__/` dirs and `database/mental_health.db` are removed from
   disk entirely — they must never be committed again, and never appear at a `legacy/` path in history.
   (The "never edit `/legacy`" rule applies to **source code** only; removing cache/binary files is fine.)
4. **Move source to `/legacy` (unchanged):** `app.py`, `routes/`, `models/`, `utils/`,
   `database/` (`.py` only), `templates/`, `static/`, `alerts/`, `requirements.txt`,
   `requirements-local.txt`, and the old `README.md` (→ `legacy/README.md`).
5. **Create `.gitignore`** (Python, Node, `.env*` with `!.env.example`, `.next`, `.venv`, `*.db`, `__pycache__`).
6. **Scaffold `/web`:** create-next-app (App Router, TS, Tailwind, `src/`), shadcn/ui, Recharts, vitest;
   route groups `(public)` / `(patient)` / `(psychologist)` with placeholder pages and per-role layouts;
   `src/proxy.ts` (Next 16 renamed `middleware.ts` → `proxy.ts`) using `@supabase/ssr`:
   Phase 1 only checks **session existence** (no session on `/patient/*` or `/psychologist/*` → `/login`);
   `lib/guards.ts` reads the role **only from `app_metadata`** (never `user_metadata`) with a Phase 2 TODO
   that signup must not let clients self-assign the psychologist role.
7. **Scaffold `/api`:** `app/main.py`, `routers/`, `services/`, `schemas/`, `core/config.py` (pydantic-settings),
   `core/auth.py` (Supabase JWKS JWT verification; `extract_role` reads **only `app_metadata.role`**),
   `GET /health`, one health smoke test + invalid-JWT rejection tests; `requirements.txt` with **pinned `==` versions**.
8. **Docs/env:** `/web/.env.example`, `/api/.env.example`, new root `README.md` (local setup commands),
   root `AGENTS.md` (stack, layout, rules — legacy rule is source-only).

**Commits (one per logical step, in this order):**
1. `docs: add phase 0 audit`
2. `chore: add gitignore, untrack cache and db` — staged deletions at the **original** paths only,
   so `*.pyc`/`*.db` never exist at a `legacy/` path in history
3. `chore: move flask prototype to legacy` — source only
4. `web: scaffold nextjs app (ts, tailwind, shadcn, recharts)`
5. `web: add route groups, role layouts, auth proxy`
6. `api: scaffold fastapi app with health endpoint and auth guards`
7. `docs: root readme, agents.md, env examples`
