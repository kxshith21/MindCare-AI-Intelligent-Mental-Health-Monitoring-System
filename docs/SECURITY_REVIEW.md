# Security review (Phase 5)

**Date:** 2026-11-27
**Status:** reviewed for prototype use only — not cleared for real patients.
**Scope:** the current working tree (Phases 0–5). No remote Supabase, Vercel,
Railway, Render, or LLM account was contacted or modified.

This is a code-and-test review, not a penetration test or a legal audit. It
records what was checked, the evidence, and what remains open. See
[`LAUNCH_CHECKLIST.md`](LAUNCH_CHECKLIST.md) and [`TODO.md`](TODO.md) for the
launch gates.

## Summary

| Area | Result | Notes |
|---|---|---|
| Auth / role assignment | Pass (local) | Role comes from server-controlled `app_metadata`; client signup cannot choose `psychologist`. |
| Cookie sessions | Pass (local) | `@supabase/ssr` cookies; no browser token storage. |
| BFF / key isolation | Pass (local) | Browser calls only same-origin `/api/*`; service-role key stays in `/api`. |
| RLS and RPC authorization | Pass (local) | 14 SQL scenarios pass; every `public` table has RLS enabled. |
| Chat kill switch | Pass (tested) | `CHAT_ENABLED=false` performs no rate-limit, DB, LLM, or risk-event work. |
| Health probe | Pass (tested) | Generic 200/503 bodies; no URL, key, exception, or DB detail. |
| Structured logs | Pass (tested) | Request id, method, sanitized path, status, latency; no bodies or tokens. |
| Consent capture | Pass (local) | Signup acknowledgments are stamped once into `profiles`; not used for authorization. |
| Secret hygiene | Pass with history note | Only `.env.example` files are tracked; history contains legacy artifacts and placeholders, no real credentials found by regex scan. |
| Dependency audit | Open (low/moderate) | API clean; web has 4 moderate dev-dependency advisories with fixes available. |
| Clinical / legal / operational readiness | Open | See blockers below; these are launch gates, not code defects. |

## Implemented controls and evidence

### 1. Authentication and authorization

- Supabase Auth is authoritative. There is no hand-rolled login.
- `POST /auth/psychologist-signup` is the only path that assigns the
  `psychologist` role, using the service-role key via the Admin API. Patient
  signup has no role field.
- JWT verification uses JWKS (`RS256` / `ES256`); the API does not need the
  Supabase JWT secret at runtime.
- Role and verification are checked again in FastAPI dependencies and in the
  web proxy/layout guards.
- Care-link changes use the user's JWT and database triggers:
  `pending` → `active` is psychologist-only, revocation is either party,
  scope changes are patient-only, and revoked links are immutable.

Evidence: `python -m pytest -q` → `117 passed, 1 warning in 6.37s`; API tests
cover role guards, auth rejection, care-link transitions, and account deletion.
`npm run test:e2e` → `13 passed (49.2s)`, including unverified psychologists
being unable to reach patient data.

### 2. Row Level Security

- Every application table in `public` has RLS enabled. `anon` has no table
  privileges.
- Patient reads/writes are keyed to `auth.uid()`. Psychologists need an active
  care link and verified status; message text additionally requires
  `share_scope = 'full'`.
- Clinician notes have no patient read policy by product decision.
- Risk events cannot be inserted or deleted by clients; the API writes them
  with the service role. Reviewers can only change status/reviewer fields, and
  a trigger pins `reviewed_by` to the actor.
- `SECURITY DEFINER` helpers pin `search_path = ''` and use fully qualified
  names. `EXECUTE` is revoked from `PUBLIC` and `anon`.

Evidence (local):

```text
supabase db reset: applied 13 migrations + seed successfully
RLS_EXIT=0
=== ALL 14 RLS SCENARIOS PASSED ===
VERIFY_RLS_EXIT=0
VERIFY_RLS_ROWS=0
```

`supabase/verify_rls.sql` must still be run against the deployed database; it
is a release gate in [`DEPLOY.md`](DEPLOY.md).

### 3. Browser/API boundary and key isolation

- The browser never calls FastAPI directly. It calls same-origin `/api/*`.
- `web/src/app/api/[...path]/route.ts` is an explicit allowlist, forwards only
  the user's short-lived bearer token, applies a 15-second timeout, and does
  not retry (especially for chat, where a retry would duplicate writes).
- The service-role key and LLM key exist only in `/api` configuration.
  `API_URL` is server-only; `NEXT_PUBLIC_API_URL` is only a local fallback.
- Supabase sessions are kept in HttpOnly cookies by `@supabase/ssr`; no
  `localStorage` / `sessionStorage` token use was found in `web/src`.

Evidence from the final production build:

```text
API_SERVICE_ROLE_CONFIGURED=True
BUILD_SERVICE_ROLE_VALUE_HITS=0
BUILD_SERVICE_ROLE_NAME_HITS=0
```

`npm run build` compiled successfully and included `/privacy`, `/safety`, and
`/terms`.

### 4. Chat safety and logging

- `CHAT_ENABLED=false` returns HTTP 200 with a safe unavailable reply and
  crisis resources, short-circuiting before rate limiting, region lookup, DB
  work, LLM calls, and risk-event creation. A regression test asserts no data,
  LLM, or risk path is called.
- LLM failures fall back to the local rules engine; the final level is
  `max(LLM signal, rules signal)`, so a failed LLM cannot lower a flag.
- `risk_events.reason` stores category labels only, never message text.
- `/health` returns only
  `{"status":"ok","service":"mindcare-api"}` or
  `{"status":"degraded","service":"mindcare-api"}`; no internal details are
  exposed.
- JSON request logs include `request_id`, method, sanitized path, status, and
  `latency_ms`. Query strings, headers, tokens, bodies, and exception text are
  not logged.

Evidence: API test suite above; `api/tests/test_logging.py`,
`api/tests/test_health.py`, and `api/tests/test_chat.py` passed in that run.
Local API check: `API 200 {"status":"ok","service":"mindcare-api"}`.

### 5. Consent and legal/info pages

- Patient signup requires acceptance of the draft Terms/Privacy notice,
  acknowledgment that the app is not a crisis service, and a separate 18+
  confirmation. The metadata keys and document version are fixed and covered
  by frontend tests.
- `handle_new_user()` stamps `consent_at`, `consent_version`, and
  `age_confirmed_at` once. The columns are immutable after insert, and missing
  consent does not block account creation (seed and server-created accounts
  remain valid).
- `/privacy` and `/terms` show `DRAFT - requires legal review before launch`.
  `/safety` reuses the static crisis-resource component.
- Consent metadata is audit data only; it is not an authorization signal.

Evidence: RLS TEST 14 in `supabase/tests/rls_test.sql`, Vitest
(`Test Files 9 passed (9)`, `Tests 35 passed (35)`), and Playwright legal/signup
tests in the final `13 passed` run.

### 6. CI and repository hygiene

- `.github/workflows/ci.yml` runs API tests, web typecheck/lint/test/build,
  Supabase RLS checks, and gitleaks with full history.
- `.github/workflows/e2e.yml` is manual/nightly and uses only local placeholder
  values.
- Dependabot covers npm, pip, and GitHub Actions.
- `.pre-commit-config.yaml` and `.gitleaks.toml` add local secret scanning and
  whitespace/YAML checks.
- `scripts/smoke_remote.sh` checks only `/health` and an unauthenticated
  protected-route rejection. It uses no tokens and performs no writes.

Validation outputs:

```text
ci.yml / e2e.yml / dependabot.yml / pre-commit-config.yaml -> YAML OK
gitleaks.toml -> TOML OK
ci jobs: ['api', 'web', 'supabase', 'secrets']
e2e triggers: ['workflow_dispatch', 'schedule']
dependabot ecosystems: [('npm', '/web'), ('pip', '/api'), ('github-actions', '/')]
```

No workflow has been run on GitHub in this phase. `gitleaks` was not installed
locally; CI is configured to run it. A manual regex scan of full history found
only placeholders/fixtures such as `service-key-secret`, blank keys, and
`LLM_API_KEY=your_groq_api_key_here`; no real credentials were identified.

### 7. Dependency review

```text
PIP_AUDIT_EXIT=0
No known vulnerabilities found

NPM_AUDIT_METADATA={"info":0,"low":0,"moderate":4,"high":0,"critical":0,"total":4}
VULN @ts-morph/common moderate fix=True
VULN minimatch moderate fix=True
VULN shadcn moderate fix=True
VULN ts-morph moderate fix=True
```

The four npm advisories are moderate and come through the `shadcn` CLI/dev
tooling chain (`minimatch` → `@ts-morph/common` → `ts-morph`). There are no
high or critical advisories. Before launch, update the affected dev
dependencies and re-run `npm audit`.

## History finding

A full-history tracked-file scan found legacy cache artifacts and one SQLite
database committed in the initial upload commit `85d2cce`:

- `database/mental_health.db`
- many `__pycache__/*.pyc` paths under the old prototype layout

They are not in the current tree:

```text
CURRENT_TRACKED_FORBIDDEN_FILES=0
TRACKED_ENV_EXAMPLES=2
api/.env.example
web/.env.example
```

History was not rewritten. Do not reuse the old database. Leave history intact
unless repository policy requires a coordinated rewrite.

## Open items / launch blockers

1. Application-level encryption of message and journal text is not implemented.
2. The chat rate limiter is in-memory and per instance; run one API instance
   until a shared store exists.
3. Supabase backup/PITR restore has not been tested. A restore-to-new-project
   drill is required before real users.
4. `/privacy` and `/terms` require legal review; applicable law has not been
   identified. Draft banners must remain until approved.
5. LLM provider retention/training/region terms have not been reviewed against
   the privacy notice.
6. Psychologist license verification is a manual SQL step with no documented
   repeatable reviewer workflow.
7. Incident owner and backup contact are not named; the kill switch has been
   tested only locally.
8. Crisis contact details are date-stamped but not independently re-verified.
9. The four moderate npm advisories should be updated and re-audited.
10. No remote deployment or remote RLS verification has been performed.

## Conclusion

The Phase 5 code changes are consistent with the documented prototype controls,
and all local automated checks pass. This review does **not** clear the app for
real patients. The launch gate in [`LAUNCH_CHECKLIST.md`](LAUNCH_CHECKLIST.md)
remains open until every blocker above is resolved and evidenced.
