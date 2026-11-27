# Phase 2 — Roles, verification and RLS

This document describes the **implemented and locally tested** Phase 2 authorization
model. Tests: `supabase/tests/rls_test.sql` (13 scenarios, all passing after
`supabase db reset` on a fresh local database).

> This is not a crisis service. Nothing in this layer sends email/SMS, diagnoses,
> or invents a wellness score.

## 1. Source of truth for role

| Layer | Role source | Notes |
|---|---|---|
| Supabase Auth | `auth.users.raw_app_meta_data->>'role'` | Server-controlled. Clients only write `user_metadata`, which is never read for authorization. |
| Database trigger | `handle_new_user()` on `auth.users` INSERT | Creates `profiles`; `role = coalesce(app_metadata.role, 'patient')`, coerced to `patient` if unknown. |
| Database trigger | `handle_user_role_update()` on `auth.users` UPDATE OF `raw_app_meta_data` | Supabase Admin API inserts the user first and patches `app_metadata` afterwards. This reconciles `profiles.role` and creates the **unverified** `psychologist_profiles` row when the patched role is `psychologist` (migration 0011). |
| API | JWT `app_metadata.role` | Used for endpoint role gates only. Data authorization is RLS. |
| Web | `app_metadata.role` via `getAppRole()` in `web/src/lib/guards.ts` | Routing only; never trusts `user_metadata`. |

Client signup (`/signup`) has no role field and always becomes `patient`.
`POST /auth/psychologist-signup` is the **only** path that assigns
`app_metadata.role = 'psychologist'`; it uses the service-role key server-side.
The request schema has no `role` field, so a client cannot supply one.

## 2. Verification

A psychologist can log in immediately but sees **no patient data** until
`psychologist_profiles.verified = true`. No client UPDATE policy or column grant
exists for `verified`, so it cannot be self-set (test 4.6).

Manual verification (admin only, local SQL / Studio SQL editor):

```sql
-- Find the applicant by email, then verify their license manually.
select id, email from auth.users where email = 'applicant@example.com';

update public.psychologist_profiles
   set verified = true, verified_at = now()
 where user_id = '00000000-0000-0000-0000-000000000000'; -- paste the id above
```

Studio alternative: Table Editor → `psychologist_profiles` → edit the row →
set `verified` to `true` (and optionally `verified_at`). Both paths run as the
table owner / service role, not as the applicant.

The web layer renders an "Account awaiting verification" screen for unverified
accounts instead of the dashboard. RLS denies the data independently.

## 3. Access helpers

All helpers are `SECURITY DEFINER`, `STABLE`, `set search_path = ''`, with
EXECUTE revoked from `public`/`anon` and granted to `authenticated`/`service_role`.

| Function | Returns |
|---|---|
| `is_verified_psychologist()` | true only if caller is a psychologist with `verified = true` |
| `has_active_link(patient)` | true only for a verified psychologist with an `active` link to that patient |
| `link_scope(patient)` | `'summary_only'` / `'full'` for an **active** link, otherwise `NULL` |

`NULL` means no access. Policies use `(select auth.uid())` and every predicate
column is indexed (see `DATA_MODEL.md`).

## 4. Policy matrix

`P` = patient (owner), `Psy` = verified psychologist, `Unv` = unverified psychologist.
All other rows are denied by default; `anon` has no grants on any `public` table.

| Table | Operation | Allowed when |
|---|---|---|
| `profiles` | SELECT | own row; or psychologist with active link to that patient; or patient reading a psychologist on any of their links |
| `profiles` | UPDATE | own row, `display_name`/`region` only; trigger freezes `id`, `role`, `created_at` |
| `profiles` | INSERT | trigger only (server side) |
| `psychologist_profiles` | SELECT | own row only |
| `psychologist_profiles` | UPDATE / INSERT / DELETE | never for clients; `verified` is server-managed |
| `care_links` | SELECT | patient or psychologist party only |
| `care_links` | INSERT | only via `invite_psychologist(email, share_scope)` (SECURITY DEFINER) |
| `care_links` | UPDATE | parties only, plus transition trigger: accept = psychologist, decline/end/revoke = either party, `share_scope` change = patient only, ownership + timestamps immutable, revoked is terminal |
| `care_links` | DELETE | never for clients (revocation is a status change) |
| `checkins` | SELECT / INSERT / DELETE | patient, own rows only |
| `checkins` | UPDATE | never; scores are computed by trigger and are immutable |
| `checkins` (via `shared_checkins`) | SELECT | verified psychologist + active link; `mood`/scores/date always; `note` and raw answers only when `share_scope = 'full'` |
| `conversations` | SELECT / INSERT | patient, own rows only |
| `messages` | SELECT | patient own; or verified psychologist + active link with `link_scope = 'full'` |
| `messages` | INSERT | patient own, `sender = 'user'` only (assistant rows are written by the API with the service role) |
| `messages` | UPDATE / DELETE | never for clients |
| `risk_events` | SELECT | patient own; or verified psychologist with active link |
| `risk_events` | UPDATE | verified psychologist with active link, only `status`/`reviewed_by`/`reviewed_at`; trigger pins `reviewed_by` to actor |
| `risk_events` | INSERT / DELETE | never for clients (API service role only) |
| `clinician_notes` | SELECT / INSERT / UPDATE / DELETE | authoring psychologist only, and only while an active link exists |
| `audit_log` | INSERT | authenticated, `actor_id = auth.uid()` only (spoofed actor rejected) |
| `audit_log` | SELECT | rows where actor is self or `target_patient_id` is self |
| `audit_log` | UPDATE / DELETE | never for clients |

`anon` cannot read any `public` table and cannot call the RPCs. Pending or
revoked links grant **no** data access, and unverified psychologists see nothing
even with an active link (tests 4 and 5).

## 5. RPCs (all `SECURITY DEFINER`, `search_path = ''`)

| Function | Caller | Behavior |
|---|---|---|
| `invite_psychologist(email, share_scope)` | patient only | Returns the **same generic JSON** for existing, non-existing, unverified, and non-psychologist emails. Target must be a verified psychologist; creates `pending` link with `consented_at = now()`. No enumeration. |
| `shared_checkins(patient)` | verified psychologist + active link | Returns mood, computed scores, date; `note`/answers only under `full`. |
| `record_patient_access(patient, action)` | verified psychologist + active link | Appends an `audit_log` row. The API must call this every time a psychologist views patient data. |
| `delete_my_data()` | patient only | Deletes the caller's messages, conversations, risk events, check-ins, care links and clinician notes *about* them; anonymizes audit identity columns and appends an identity-free `data_deleted` marker. Profile and `auth.users` row remain. |

EXECUTE is revoked from `public` and `anon` for every RPC.

## 6. Product decisions

- **Consent at invite, visibility at accept.** The patient's `consented_at` is
  stamped when the invite is created; the psychologist still must accept before
  any data is visible. Pending invitations show no patient name in the web UI.
- **Clinician notes are private to the author.** Patients deliberately cannot
  read them — this is a product choice, not an RLS oversight. Deleting patient
  data also deletes notes about that patient.
- **Risk events carry a short generated `reason`, not message content.** Raw
  message text lives only in `messages`, which is gated by `link_scope = 'full'`.
  `message_id` is an identifier, not content.
- **`summary_only` still reveals display name/region** of an actively linked
  patient (needed for the active-patient list); notes, answers and messages do
  not flow until the patient grants `full`.
- **Audit privacy.** A patient sees rows targeting them plus rows they acted on
  themselves; a psychologist sees their own audit rows. No one edits history.
- **Deletion is two-phase.** `delete_my_data()` removes patient data now;
  account deletion (`auth.users`) is a service-role API endpoint reserved for
  Phase 3 (TODO).

## 7. Verification commands used

```bash
supabase start
supabase db reset
# RLS test script is piped into the local DB container (see file header)
supabase/tests/rls_test.sql  # ends with "=== ALL 13 RLS SCENARIOS PASSED ==="
cd api && python -m pytest -q
cd web && npm test && npm run lint && npm run build
```
