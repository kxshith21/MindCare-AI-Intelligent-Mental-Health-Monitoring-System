-- ============================================================================
-- audit_log (append-only via the API)
--
-- INSERT: authenticated users, actor_id = themselves only (spoof-proof via
--         the WITH CHECK policy in migration 0009).
-- SELECT: rows you acted on (actor) or that target you (patient seeing who
--         accessed their data).
-- UPDATE / DELETE: no policy for anyone — service role / SQL only.
-- FKs use ON DELETE SET NULL so account deletion (Phase 3) anonymises
-- identity columns automatically; delete_my_data() does the same without
-- deleting the account.
-- ============================================================================

create table public.audit_log (
  id                uuid primary key default gen_random_uuid(),
  actor_id          uuid references public.profiles (id) on delete set null,
  action            text not null check (char_length(action) between 1 and 100),
  target_patient_id uuid references public.profiles (id) on delete set null,
  created_at        timestamptz not null default now()
);

create index audit_log_actor_idx on public.audit_log (actor_id, created_at desc);
create index audit_log_target_idx on public.audit_log (target_patient_id, created_at desc);
