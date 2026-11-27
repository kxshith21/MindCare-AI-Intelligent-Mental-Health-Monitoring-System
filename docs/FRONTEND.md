# Frontend ↔ backend contract (Phase 4, reviewed in Phase 5)

## Calling FastAPI from the browser

**Chosen approach: Next.js route handlers as a backend-for-frontend (BFF).**

The browser never calls FastAPI directly. It calls same-origin routes under
`/api/*`; `web/src/app/api/[...path]/route.ts` reads the Supabase cookie
session, forwards only the user's short-lived bearer token to FastAPI, and maps
the upstream response back to the browser.

Why this approach:

- Supabase Auth is stored in `@supabase/ssr` cookies, so access tokens stay in
  HttpOnly cookies and never enter client JavaScript. No `localStorage` tokens.
- The service-role key stays in `api/.env` and is used only by Python. It is
  never available to `web/`, including server components.
- One place handles the 15-second timeout, shared error shape, and safe error
  messages instead of duplicating fetch logic in every screen.
- The upstream path allowlist is explicit, so this is not an open proxy.

`API_URL` is **server-only** and configures the route handler.
`NEXT_PUBLIC_API_URL` is accepted only as a local-development fallback; browser
code itself never reads either value because it always requests `/api/*`.

### Endpoint allowlist

| Browser call | Upstream FastAPI |
|---|---|
| `GET /api/health` | `GET /health` (public) |
| `POST /api/auth/psychologist-signup` | `POST /auth/psychologist-signup` (public) |
| `POST /api/chat/message` | `POST /chat/message` |
| `GET /api/chat/conversations` | `GET /chat/conversations` |
| `GET /api/chat/conversations/:id/messages` | `GET /chat/conversations/:id/messages` |
| `POST /api/checkins` | `POST /checkins` |
| `GET /api/checkins?from&to` | `GET /checkins?from&to` |
| `GET /api/psychologist/patients` | `GET /psychologist/patients` |
| `GET /api/psychologist/patients/:id/trends` | `GET /psychologist/patients/:id/trends` |
| `GET /api/psychologist/patients/:id/notes` | `GET /psychologist/patients/:id/notes` |
| `POST /api/psychologist/patients/:id/notes` | `POST /psychologist/patients/:id/notes` |
| `GET /api/psychologist/risk-events` | `GET /psychologist/risk-events` |
| `PATCH /api/psychologist/risk-events/:id` | `PATCH /psychologist/risk-events/:id` |
| `DELETE /api/account` | `DELETE /account` |

## Typed, validated responses

`web/src/lib/api/schemas.ts` contains zod schemas mirroring the Pydantic
response models in `api/app/schemas/`. Every successful response is parsed with
one of these schemas before a component sees it; a malformed response becomes
`INVALID_RESPONSE` and never partially renders.

Errors use the shared shape `ApiError { status, code, message }` defined in
`web/src/lib/api/errors.ts`. The route handler and browser client both use it.
Every request has a 15-second timeout. There are **no retries**, especially for
`POST /chat/message`, where a retry would create duplicate stored messages and
risk events.

## Auth and authorization

- Role comes only from `app_metadata.role` (`patient` or `psychologist`); never
  from `user_metadata`. See `web/src/lib/guards.ts`.
- `web/src/proxy.ts` is the Next.js 16 request proxy (the old `middleware.ts`
  filename is gone). It refreshes cookie sessions and redirects on role or
  verification mismatch.
- Unverified psychologists are held on `/psychologist/awaiting-verification`;
  the psychologist layout is a second gate. Patient data is still denied by
  RLS and by the FastAPI endpoints.
- Care-team invite, accept/decline, revoke, and share-scope changes are direct
  PostgREST calls with the user's JWT. There is no `pending_invites` table and
  no accept/decline RPC: pending/active/revoked are `care_links.status` values,
  changed with updates guarded by the database trigger.
- `SessionWatcher` keeps server-rendered pages in sync with cookie changes.

## Signup consent and legal pages

Patient signup has two required acknowledgments before submission:

1. acceptance of the draft Terms and Privacy pages and acknowledgment that the
   app is not a crisis service;
2. confirmation that the user is 18 or older.

On acceptance, the browser sends the boolean metadata keys
`terms_accepted`, `privacy_accepted`, `crisis_notice_acknowledged`,
`age_18_plus`, and `consent_document_version` to Supabase Auth. The server-side
trigger stamps `profiles.consent_at`, `profiles.consent_version`, and
`profiles.age_confirmed_at`. These values are audit metadata only; authorization
still depends on role, verification, and care links.

Draft information pages are available at `/privacy`, `/terms`, and `/safety`.
`/privacy` and `/terms` show `DRAFT - requires legal review before launch`.
They are linked from the footer and from signup. They are placeholders for
lawyer review and make no data-protection compliance claims.

## Safety rules in the UI

- Crisis resources render from a static fallback list mirrored from
  `api/app/services/crisis_resources.py`. If the API or a screen fails, patient
  error boundaries still show support information; it is never collapsed behind
  a toggle.
- Positive PHQ-9 item 9 returns crisis resources from `POST /checkins`. Patients
  see supportive wording plus resources, never a risk label, number, rule id, or
  model internals.
- Clinician risk triage labels are shown only in the psychologist review queue,
  with “not a diagnosis” context.
- Charts plot real check-in mood and PHQ-9/GAD-7 screening scores only. There is
  no invented composite score.
- Allowed screening-accuracy phrasing is exactly:
  - “These are screening questions used by clinicians. They are not a diagnosis.”
  - “Screening scores can change from week to week and are not a diagnosis.”
- When `CHAT_ENABLED=false`, chat returns a safe unavailable message with
  crisis resources and performs no storage, model call, or risk-event write.
- No outbound email/SMS is triggered anywhere in the frontend.

## Local verification

Start local Supabase from `/supabase` and apply the seed, then start the API
with `LLM_PROVIDER=fake` so no provider key or network call is involved. The
seeded logins are:

| Role | Email | Password |
|---|---|---|
| Patient (active link) | `patient.one@demo.test` | `demo-password-123` |
| Patient (pending invite) | `patient.two@demo.test` | `demo-password-123` |
| Verified psychologist | `dr.verified@demo.test` | `demo-password-123` |
| Unverified psychologist | `dr.unverified@demo.test` | `demo-password-123` |

Use a freshly reset database for Playwright: the seed intentionally contains
no check-ins, messages, risk events, or notes.

```bash
cd web
npm run typecheck
npm run lint
npm test
npm run test:e2e
npm run build
```
