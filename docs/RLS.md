# Row Level Security (current migrations)

This matrix was re-derived from the SQL in `supabase/migrations/0001`–`0012`
plus `20261127000001_consent.sql`. It describes the deployed schema after a
full `supabase db reset`. RLS is enabled on every application table. `anon` has
no table privileges at all.

Roles in the matrix:

- **Patient** — authenticated user with `app_metadata.role = 'patient'`.
- **Psychologist** — authenticated user with `app_metadata.role =
  'psychologist'`. Verified means `psychologist_profiles.verified = true`.
- **Service** — service-role/server SQL, which bypasses RLS by design.
- **Actor** — `auth.uid()` from the JWT, never `user_metadata`.

## Policy matrix

| Table | Role | Operation | Condition |
|---|---|---|---|
| `profiles` | Patient/Psychologist | SELECT | `id = auth.uid()` |
| `profiles` | Patient | SELECT | linked psychologist on any of the patient's care links, including pending |
| `profiles` | Verified psychologist | SELECT | `has_active_link(profiles.id)`; active link to that patient |
| `profiles` | Patient/Psychologist | UPDATE | own row only, and only the `display_name` / `region` columns are granted |
| `profiles` | Client | INSERT/DELETE | none |
| `psychologist_profiles` | Owner | SELECT | `user_id = auth.uid()` |
| `psychologist_profiles` | Client | INSERT/UPDATE/DELETE | none; `verified` is server-managed only |
| `care_links` | Patient/Psychologist | SELECT | `patient_id = auth.uid()` or `psychologist_id = auth.uid()` |
| `care_links` | Patient/Psychologist | UPDATE | either party, with `care_links_before_update()` enforcing accept/revoke/scope rules |
| `care_links` | Client | INSERT/DELETE | none; insert occurs through `invite_psychologist()` |
| `checkins` | Patient | SELECT | `patient_id = auth.uid()` |
| `checkins` | Patient | INSERT | `patient_id = auth.uid()` |
| `checkins` | Patient | DELETE | `patient_id = auth.uid()` |
| `checkins` | Psychologist | direct SELECT | none; use `shared_checkins()` for active-link access |
| `checkins` | Client | UPDATE | none; computed scores are immutable |
| `conversations` | Patient | SELECT/INSERT | `patient_id = auth.uid()` |
| `conversations` | Client/Psychologist | UPDATE/DELETE | none |
| `messages` | Patient | SELECT | `patient_id = auth.uid()` |
| `messages` | Verified psychologist | SELECT | active link with `link_scope(patient_id) = 'full'` |
| `messages` | Patient | INSERT | own `patient_id` and `sender = 'user'` only |
| `messages` | Client | UPDATE/DELETE | none |
| `risk_events` | Patient | SELECT | `patient_id = auth.uid()` |
| `risk_events` | Verified psychologist | SELECT | `has_active_link(patient_id)` |
| `risk_events` | Verified psychologist | UPDATE | active link; trigger pins `reviewed_by` to actor; column grant allows only `status`, `reviewed_by`, `reviewed_at` |
| `risk_events` | Client | INSERT/DELETE | none; API writes with service role |
| `clinician_notes` | Authoring psychologist | SELECT/INSERT/UPDATE/DELETE | `psychologist_id = auth.uid()` and active link to the patient |
| `clinician_notes` | Patient | any | none, by product decision |
| `audit_log` | Client | INSERT | `actor_id = auth.uid()` |
| `audit_log` | Client | SELECT | `actor_id = auth.uid()` or `target_patient_id = auth.uid()` |
| `audit_log` | Client | UPDATE/DELETE | none |

Service-role paths used by the API: psychologist signup, assistant message
writes, risk-event inserts, and account deletion. These are not browser paths.

## Helper predicates

All helpers are `SECURITY DEFINER`, `STABLE` where applicable, `set search_path
= ''`, fully qualified, and executable only by `authenticated`/`service_role`.

| Function | Result |
|---|---|
| `is_verified_psychologist()` | Caller has role `psychologist` and a verified profile row. |
| `has_active_link(patient)` | Caller is a verified psychologist with an `active` link to that patient. |
| `link_scope(patient)` | `full` only for a verified psychologist with an active link; otherwise `NULL`. |

These helpers are the only place cross-table privilege logic lives, which
prevents recursive RLS evaluation. No policy reads `user_metadata`.

## Triggers and immutability

- `handle_new_user()` creates the profile from server-controlled
  `app_metadata.role`; client-supplied roles in `user_metadata` are ignored.
- `handle_user_role_update()` reconciles server-side role changes made by the
  Auth Admin API.
- `profiles_before_update()` makes `id`, `created_at`, and the Phase 5 consent
  columns immutable for everyone. `role` is immutable for clients but may be
  changed by trusted server SQL/Auth triggers. `display_name` and `region`
  remain editable by the owner.
- `care_links_before_update()` makes revoked links terminal, restricts
  acceptance to the psychologist, revocation to either party, and scope changes
  to the patient.
- `checkins_compute_scores()` recomputes screening totals from answers on
  insert.
- `messages_check_conversation()` prevents cross-patient message writes.
- `risk_events_before_write()` pins the reviewer identity and timestamp.

## RPC authorization

| RPC | Authorization |
|---|---|
| `invite_psychologist(email, scope)` | Patient only; target must be a verified psychologist; identical generic response for every lookup outcome. |
| `shared_checkins(patient)` | Verified psychologist with an active link; `note` and raw answer arrays only when `share_scope = 'full'`. |
| `record_patient_access(patient, action)` | Verified psychologist with an active link; appends an audit row. |
| `delete_my_data()` | Patient only; removes patient-owned app data and anonymizes audit identity columns. |

`EXECUTE` on every RPC is revoked from `PUBLIC` and `anon` and granted to
`authenticated` and `service_role`.

## Product decisions

1. **Role source** — `app_metadata.role` only. A browser signup cannot choose
   the psychologist role.
2. **Verification gate** — patients can only share with verified
   psychologists. Unverified psychologist accounts cannot read patient data.
3. **Consent-based scope** — `summary_only` exposes mood and screening totals;
   `full` additionally exposes check-in notes and raw questionnaire answers.
4. **Pending links** — names of linked psychologists are visible to the
   patient, but pending links grant no patient-data access.
5. **Revocation is terminal** — a revoked care link cannot be edited or
   reactivated; a new invitation is required.
6. **Private clinician notes** — patients deliberately have no read policy on
   `clinician_notes`.
7. **Message visibility** — message text requires an active `full` link. Risk
   queue entries never include message text for `summary_only` links.
8. **Access accountability** — every psychologist data read appends an
   `audit_log` row visible to the patient.
9. **Consent metadata is not authorization** — the Phase 5 `profiles` consent
   columns record what the signup UI acknowledged. Access still depends only
   on role, verification, and active care links.
10. **Deletion** — patient data is removed through `delete_my_data()` plus the
    API `DELETE /account` path; audit identity is anonymized rather than
    silently dropped.

## Deployment verification

Run [`supabase/verify_rls.sql`](../supabase/verify_rls.sql) against the target
database. It must return zero rows; each returned row names a `public` table
with RLS disabled. The local `supabase/tests/rls_test.sql` suite also asserts
policies, triggers, RPC behavior, and the Phase 5 consent fields.
