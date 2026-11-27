# Phase 2 — Data model

Implemented in `supabase/migrations/` (10 ordered files). All tables are in
`public`; RLS is enabled on every one. See `RLS.md` for the policy matrix.

```
auth.users (Supabase Auth)
   │ 1:1  handle_new_user() on INSERT
   ▼
profiles ──1:N──> care_links <──1:N── profiles (psychologist side)
   │                  │
   │                  │ active link gates all clinician reads
   ├──1:N──> psychologist_profiles (psychologists only, verified=false)
   ├──1:N──> checkins
   ├──1:N──> conversations ──1:N──> messages
   ├──1:N──> risk_events ──> messages (message_id, ON DELETE SET NULL)
   ├──1:N──> clinician_notes (author = psychologist, subject = patient)
   └──1:N──> audit_log (actor_id / target_patient_id, ON DELETE SET NULL)
```

`profiles.id = auth.users.id` with `ON DELETE CASCADE`. `psychologist_profiles.user_id`
references `profiles.id`; it is a primary key, so one psychologist profile per user.

Two `auth.users` triggers manage role provisioning:

- `handle_new_user()` (AFTER INSERT) creates `profiles` from
  `raw_app_meta_data->>'role'`, defaulting to `patient`.
- `handle_user_role_update()` (AFTER UPDATE OF `raw_app_meta_data`, migration
  0011) reconciles `profiles.role` when Supabase's Admin API patches
  `app_metadata` after INSERT, and inserts an unverified
  `psychologist_profiles` row for `psychologist`. Client role changes remain
  impossible; `profiles_before_update()` only permits a role change when
  `auth.uid()` is NULL (trusted server-side SQL).

## Tables

| Table | Columns | Constraints / computed behavior |
|---|---|---|
| `profiles` | `id` (PK/FK), `role`, `display_name`, `region`, `created_at` | `role in ('patient','psychologist')`; `region` nullable ISO alpha-2. Trigger freezes `id`, `role`, `created_at`; normalizes `region`. |
| `psychologist_profiles` | `user_id` (PK/FK), `license_no`, `verified`, `verified_at` | `verified default false`; no client UPDATE policy/grant. |
| `care_links` | `id`, `patient_id`, `psychologist_id`, `status`, `share_scope`, `invited_at`, `consented_at`, `revoked_at` | `status in (pending,active,revoked)`; `share_scope in (summary_only,full)`; no self-links; unique live `(patient_id, psychologist_id)`; revoked rows frozen and require `revoked_at`; BEFORE UPDATE trigger enforces transitions and immutable columns. |
| `checkins` | `id`, `patient_id`, `mood`, `note`, `phq9_answers`, `gad7_answers`, `phq9_score`, `gad7_score`, `created_at` | `mood 1..5`; arrays exactly 9 / 7 values in `0..3`. Trigger **recomputes** scores from answers on INSERT/UPDATE; client-supplied scores are overwritten or discarded. No UPDATE policy. |
| `conversations` | `id`, `patient_id`, `created_at` | Append-only for clients. |
| `messages` | `id`, `conversation_id`, `patient_id`, `sender`, `content`, `created_at` | `sender in ('user','assistant')`; `content 1..8000`. Trigger enforces `patient_id` matches the conversation owner. Clients may insert only `sender='user'`. |
| `risk_events` | `id`, `patient_id`, `message_id`, `level`, `reason`, `status`, `reviewed_by`, `reviewed_at`, `created_at` | `level in (low,elevated,high)`; `status in (new,acknowledged,resolved)`. Trigger sets `reviewed_by`/`reviewed_at`: `new` ⇒ both null, otherwise reviewer pinned to actor. Client INSERT/DELETE denied. |
| `clinician_notes` | `id`, `psychologist_id`, `patient_id`, `note`, `created_at` | `note 1..8000`; no self-notes. Author-only CRUD while an active link exists. Patients have no access. |
| `audit_log` | `id`, `actor_id`, `action`, `target_patient_id`, `created_at` | `action 1..100`. Append-only via API; identity FKs use `ON DELETE SET NULL`. |

## Consent state machine

```
pending ──accept (psychologist only)──> active
   │                                      │
   └──decline (either party)──> revoked <──┘ end (either party)
                                   │
                              terminal / immutable
```

`share_scope` changes **separately** from status and **only by the patient**.
`invite_psychologist()` sets `consented_at = now()` at invite time; the link is
still `pending`, so no data flows until acceptance. Only `active` links grant
access, and only to a `verified` psychologist.

## Computed PHQ-9 / GAD-7 scores

`checkins_compute_scores()` (BEFORE INSERT OR UPDATE) sums the answer arrays:

- `phq9_score = sum(phq9_answers)` (9 answers, each `0..3`, range `0..27`)
- `gad7_score = sum(gad7_answers)` (7 answers, each `0..3`, range `0..21`)

Values outside `0..3` raise an exception; a client-supplied score is never
trusted (test 13).

## Indexes used by policies

| Table | Index |
|---|---|
| `profiles` | PK `id` (policy predicate `id = auth.uid()`) |
| `psychologist_profiles` | PK `user_id` |
| `care_links` | `patient_id`, `psychologist_id`, unique live pair |
| `checkins` | `(patient_id, created_at desc)` |
| `conversations` | `patient_id` |
| `messages` | `(patient_id, created_at)`, `(conversation_id, created_at)` |
| `risk_events` | `(patient_id, created_at desc)`, `message_id`, `reviewed_by` |
| `clinician_notes` | `(psychologist_id, patient_id)`, `patient_id` |
| `audit_log` | `(actor_id, created_at desc)`, `(target_patient_id, created_at desc)` |

## RPCs

| Function | Purpose |
|---|---|
| `invite_psychologist(email, share_scope)` | Patient-only, anti-enumeration invite to a **verified** psychologist. |
| `shared_checkins(patient)` | Scope-aware check-in read for verified psychologists with an active link. |
| `record_patient_access(patient, action)` | Audit append for every psychologist data view. |
| `delete_my_data()` | Patient-only data deletion; keeps profile/account, anonymizes audit rows. |

All are `SECURITY DEFINER`, `set search_path = ''`, fully qualified, and have
EXECUTE revoked from `public`/`anon`.

## Deliberately absent

- No SQLite, no `.db` file, no auto-seeded sample data outside `supabase/seed.sql`.
- No wellness score, no synthetic mood chart, no diagnosis, no medication advice.
- No outbound email/SMS. Risk is stored as a `risk_events` row for the psychologist queue.
- No account deletion endpoint yet — Phase 3 service-role API (TODO).
