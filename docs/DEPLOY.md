# Deploy runbook

This is a runbook only. No remote project has been contacted or modified as
part of Phase 5. Run each step yourself, in order. Deploy **staging first**;
production comes later and only after the launch gate is complete.

Conventions:

- `<WEB_ORIGIN>` is the exact deployed web origin, e.g.
  `https://mindcare-staging.vercel.app`. No wildcard CORS.
- `<API_BASE>` is the deployed API base URL, e.g.
  `https://mindcare-api-staging.onrender.com`.
- `<PROJECT_REF>` is the Supabase project reference.

Never run `supabase db reset` or load `seed.sql` against a remote project.
`supabase db reset` is local-only.

## A. Supabase (staging first)

### A1. Create the project

1. In Supabase, create a **separate staging project**. Do not reuse local or
   production data.
2. Choose a region close to intended users and consistent with the data
   residency decision still open in [`TODO.md`](TODO.md).
3. Enable backups/PITR if the selected plan supports it.
4. In Authentication → Providers, keep only email enabled unless another
   provider is deliberately added and reviewed.
5. In Authentication → URL Configuration, set the Site URL to `<WEB_ORIGIN>`
   and add redirect URLs for `<WEB_ORIGIN>/login`, `<WEB_ORIGIN>/signup`, and
   any preview origins you intend to allow.
6. Keep email confirmation enabled. Local Supabase disables it for seeded
   testing; staging/production must not use that shortcut.

**Verify:** the project dashboard shows the expected region and backup/PITR
state; Auth settings show only intended providers, the exact Site URL, and the
exact redirect URLs. Sign up a test patient and confirm the confirmation email
flow works.

### A2. Apply migrations

From the repository root:

```bash
cd supabase
supabase link --project-ref <PROJECT_REF>
supabase db push
```

This applies migrations 0001–0012 plus `20261127000001_consent.sql`. Do not run
`supabase seed.sql` remotely.

**Verify:** `supabase db push` reports success and no pending migrations. In
the Supabase SQL Editor:

```sql
select version, success from supabase_migrations.schema_migrations
order by version desc limit 5;
```

The latest row must be `20261127000001`.

### A3. Verify RLS

Run [`supabase/verify_rls.sql`](../supabase/verify_rls.sql) in the SQL Editor or
via `psql`.

**Verify:** it returns **zero rows**. Any returned row is a `public` table with
RLS disabled and is a release blocker.

Also confirm an anonymous client cannot read application tables:

```bash
curl -sS -o /dev/null -w '%{http_code}\n' \
  "<SUPABASE_URL>/rest/v1/checkins?select=id" \
  -H "apikey: <ANON_KEY>"
```

**Verify:** the response is `401` or `403`, never `200`.

### A4. Auth hardening

In Supabase Auth settings:

- Set a strong password policy (minimum length at least 8; complexity and
  breach checks if available).
- Keep rate limiting enabled; record the configured values.
- Disable unused OAuth providers.
- Keep JWT expiry short and consistent with app session expectations.
- Confirm email confirmation is enabled and there is no local-style bypass.

**Verify:** screenshot or note the settings in the staging release record. Test
that a weak password is rejected and that an unconfirmed account cannot obtain
a session.

### A5. Keys and where they go

Find these under Supabase project → Settings → API:

| Value | Goes to | Never goes to |
|---|---|---|
| Project URL | API `SUPABASE_URL`, web `NEXT_PUBLIC_SUPABASE_URL` | — |
| Anon key | web `NEXT_PUBLIC_SUPABASE_ANON_KEY` | — |
| Service role key | API `SUPABASE_SERVICE_ROLE_KEY` only | `web/`, any `NEXT_PUBLIC_*`, logs, client bundles |
| JWT secret | Local/manual token work only | both app runtimes; the API verifies via JWKS |
| Database password | CLI/DB administration only | both app runtimes |

**Verify:** grep the deployed web build for the service-role value and for
`SUPABASE_SERVICE_ROLE_KEY`; there must be no match. Check Vercel that no
server or public variable contains the service-role key.

### A6. Create and verify the first psychologist

Use the app's psychologist signup page (it calls
`POST /auth/psychologist-signup`). The role is assigned server-side; the
request has no role field.

Then verify the account with SQL:

```sql
update public.psychologist_profiles
   set verified = true, verified_at = now()
 where user_id = (
   select id from auth.users
   where lower(email) = lower('psychologist@example.com')
 );

select pp.verified, pp.verified_at, p.role
  from public.psychologist_profiles pp
  join public.profiles p on p.id = pp.user_id
 where pp.user_id = (
   select id from auth.users
   where lower(email) = lower('psychologist@example.com')
 );
```

**Verify:** the query returns `verified = true`, a non-null `verified_at`, and
`role = 'psychologist'`. The psychologist must not be able to read patient data
until this step is complete. Define and test a repeatable license-verification
process before launch; see [`LAUNCH_CHECKLIST.md`](LAUNCH_CHECKLIST.md).

## B. API on Railway or Render

Use Python 3.11+. There is no checked-in Dockerfile; use this start command:

```bash
uvicorn app.main:app --host 0.0.0.0 --port "$PORT" --workers 1
```

Set the working directory to `/api` and install with
`pip install -r requirements.txt`.

Set these variables in the hosting platform (see [`ENV.md`](ENV.md)):

```text
ENVIRONMENT=staging
SUPABASE_URL=<staging Supabase URL>
SUPABASE_SERVICE_ROLE_KEY=<staging service role key>
CORS_ORIGINS=<WEB_ORIGIN>
LLM_PROVIDER=openai
LLM_API_KEY=<provider key>
LLM_MODEL=<configured model>
LLM_BASE_URL=<provider OpenAI-compatible base URL>
LLM_TIMEOUT_SECONDS=15
LLM_MAX_RETRIES=1
CHAT_PROMPT_VERSION=chat_system_v1
CHAT_ENABLED=true
```

Operational constraints:

- HTTPS only at the platform edge; redirect HTTP to HTTPS.
- `CORS_ORIGINS` must be the exact web origin(s), comma-separated if more
  than one. Never `*`.
- Request size is limited at the Pydantic schema (chat content max 2000
  characters) and at the database (message content max 8000 characters).
  Keep the platform's proxy body limit at or below a sane small value.
- Run **one API instance** until the in-memory per-user rate limiter is
  replaced with a shared store. Multiple instances multiply the effective
  limit.
- The health endpoint is `GET /health`. It checks DB connectivity and returns
  `{"status":"ok","service":"mindcare-api"}` only when configured and
  reachable; otherwise it returns a generic 503.

**Verify:** open `<API_BASE>/health` and confirm `status=ok`. Send a request
with an `Origin` header from an unexpected origin and confirm no
`access-control-allow-origin` header is returned. Run:

```bash
./scripts/smoke_remote.sh <API_BASE>
```

**Verify:** both smoke checks pass. Confirm the platform shows one instance,
Python 3.11+, and the exact CORS value.

## C. Web on Vercel

Import the repository and set the project Root Directory to `web`.

Build command: `npm run build`. Output: Next.js default.

Set variables in Vercel (see [`ENV.md`](ENV.md)):

```text
NEXT_PUBLIC_SUPABASE_URL=<staging Supabase URL>
NEXT_PUBLIC_SUPABASE_ANON_KEY=<staging anon key>
API_URL=<API_BASE>
```

`API_URL` is server-only. Do not set `NEXT_PUBLIC_API_URL` in production.
Preview deployments must point at the staging Supabase project and staging
API, never production data. Use separate Vercel environments for Preview and
Production; keep Production values empty until the launch gate is complete.

**Verify:** `npm run build` succeeds locally, the deployed `/health` proxy at
`<WEB_ORIGIN>/api/health` succeeds, and the built JS contains no service-role
value or LLM key. Sign in with a staging account and check that the browser
uses Supabase cookies rather than any token in local/session storage.

## D. Post-deploy smoke checklist

Run these manually against staging, then repeat against production only after
the launch gate is complete.

- [ ] Patient signup; consent checkboxes required; confirmation email works.
- [ ] Patient check-in; PHQ-9 item 9 positive path shows support resources.
- [ ] Patient chat reply and crisis-resource display; no message appears in
      logs.
- [ ] Patient invites a verified psychologist; psychologist sees pending link.
- [ ] Psychologist accepts; patient and psychologist both see active link.
- [ ] Psychologist changes nothing under `summary_only` that requires `full`
      scope; raw answers/notes stay hidden.
- [ ] Patient changes share scope to `full`; psychologist sees the permitted
      detail and an audit row is written.
- [ ] Either party revokes; access stops immediately and the link is frozen.
- [ ] Psychologist access to a non-linked patient returns no data.
- [ ] Risk queue shows an event after an elevated/high signal; reviewer fields
      are populated only after review.
- [ ] Patient account deletion removes app data and signs the user out.
- [ ] `/privacy`, `/terms`, and `/safety` load with draft banners where
      required.
- [ ] `CHAT_ENABLED=false` returns the safe unavailable reply plus resources.

Record the exact time, account emails, and results. Do not record message
content or tokens.

## E. Rollback and incident basics

### Rollback

- **Web:** in Vercel, promote the previous successful deployment for the
  affected environment.
- **API:** in Railway/Render, redeploy the previous successful commit/tag.
  Keep release tags so the previous image is identifiable.
- **Database:** do not blindly reverse Schema migrations. Restore from a
  Supabase backup/PITR point into a separate project first, verify it, then
  decide the forward migration path. A restore test is a launch blocker.

### Chat kill switch

Set `CHAT_ENABLED=false` on the API platform and redeploy/restart. The
endpoint returns a safe unavailable message plus crisis resources and performs
no storage, LLM call, or risk-event write. Verify with an authenticated patient
session, then set it back to `true` only after the incident is resolved.

### Incident contacts

Before launch, name one incident owner and one backup contact in
[`LAUNCH_CHECKLIST.md`](LAUNCH_CHECKLIST.md). Until then, contact the
repository maintainer. For immediate danger, users must contact local emergency
services or a crisis line; this app is not a crisis service.

Incident playbooks are in [`OPERATIONS.md`](OPERATIONS.md).
