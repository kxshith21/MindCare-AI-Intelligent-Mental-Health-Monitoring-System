-- ============================================================================
-- Row Level Security: enable on EVERY table, default deny, explicit policies
-- only. Role comes from auth.uid() (JWT sub) — policies never read
-- user_metadata. Every predicate uses (select auth.uid()) for performance
-- and every policy column is indexed (see per-table migrations).
-- ============================================================================

alter table public.profiles           enable row level security;
alter table public.psychologist_profiles enable row level security;
alter table public.care_links         enable row level security;
alter table public.checkins           enable row level security;
alter table public.conversations      enable row level security;
alter table public.messages           enable row level security;
alter table public.risk_events        enable row level security;
alter table public.clinician_notes    enable row level security;
alter table public.audit_log          enable row level security;

-- ---------------------------------------------------------------------------
-- Coarse grants: anon gets nothing at all (defence in depth on top of RLS);
-- authenticated keeps only the columns it may ever write.
-- ---------------------------------------------------------------------------

revoke all on table public.profiles from anon;
revoke all on table public.psychologist_profiles from anon;
revoke all on table public.care_links from anon;
revoke all on table public.checkins from anon;
revoke all on table public.conversations from anon;
revoke all on table public.messages from anon;
revoke all on table public.risk_events from anon;
revoke all on table public.clinician_notes from anon;
revoke all on table public.audit_log from anon;

-- profiles: users may edit display_name/region only (RLS narrows to own row;
-- role/id/created_at additionally guarded by profiles_before_update).
revoke insert, update, delete on table public.profiles from authenticated;
grant update (display_name, region) on table public.profiles to authenticated;

-- psychologist_profiles: read-only for the owner; verified is set only by
-- service role / SQL (no UPDATE policy AND no update grant).
revoke insert, update, delete on table public.psychologist_profiles from authenticated;

-- care_links: only invite_psychologist (definer) may insert; nobody deletes
-- through the API (revocation is a status change).
revoke insert, delete on table public.care_links from authenticated;

-- checkins: rows are never edited (computed scores are immutable).
revoke update on table public.checkins from authenticated;

-- conversations / messages: append-only; deletion only via delete_my_data().
revoke update, delete on table public.conversations from authenticated;
revoke update, delete on table public.messages from authenticated;

-- risk_events: clients never insert or delete; reviewers may move status +
-- their own review fields only (column grant below).
revoke insert, update, delete on table public.risk_events from authenticated;
grant update (status, reviewed_by, reviewed_at) on table public.risk_events to authenticated;

-- audit_log: append-only for clients (no update/delete for anyone via API).
revoke update, delete on table public.audit_log from authenticated;

-- ---------------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------------
create policy "profiles_select_own"
  on public.profiles for select to authenticated
  using ((select auth.uid()) = id);

-- psychologist reads display_name/region of an actively linked patient
create policy "profiles_select_linked_patient"
  on public.profiles for select to authenticated
  using (public.has_active_link(id));

-- patient reads the psychologist on any of their links (care-team names)
create policy "profiles_select_linked_psychologist"
  on public.profiles for select to authenticated
  using (exists (
    select 1 from public.care_links cl
    where cl.psychologist_id = public.profiles.id
      and cl.patient_id = (select auth.uid())
  ));

create policy "profiles_update_own"
  on public.profiles for update to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

-- ---------------------------------------------------------------------------
-- psychologist_profiles
-- ---------------------------------------------------------------------------
create policy "psychologist_profiles_select_own"
  on public.psychologist_profiles for select to authenticated
  using ((select auth.uid()) = user_id);
-- no insert / update / delete policies: verified is server-managed only

-- ---------------------------------------------------------------------------
-- care_links (only the two parties see/update; actor rules live in the
-- care_links_before_update trigger; INSERT happens only via the
-- invite_psychologist RPC as SECURITY DEFINER)
-- ---------------------------------------------------------------------------
create policy "care_links_select_parties"
  on public.care_links for select to authenticated
  using (patient_id = (select auth.uid()) or psychologist_id = (select auth.uid()));

create policy "care_links_update_parties"
  on public.care_links for update to authenticated
  using (patient_id = (select auth.uid()) or psychologist_id = (select auth.uid()))
  with check (patient_id = (select auth.uid()) or psychologist_id = (select auth.uid()));
-- no insert / delete policies

-- ---------------------------------------------------------------------------
-- checkins (patient full CRUD minus UPDATE; psychologists have no direct
-- access — they go through shared_checkins())
-- ---------------------------------------------------------------------------
create policy "checkins_select_own"
  on public.checkins for select to authenticated
  using (patient_id = (select auth.uid()));

create policy "checkins_insert_own"
  on public.checkins for insert to authenticated
  with check (patient_id = (select auth.uid()));

create policy "checkins_delete_own"
  on public.checkins for delete to authenticated
  using (patient_id = (select auth.uid()));
-- no update policy: computed scores/note history are never edited

-- ---------------------------------------------------------------------------
-- conversations
-- ---------------------------------------------------------------------------
create policy "conversations_select_own"
  on public.conversations for select to authenticated
  using (patient_id = (select auth.uid()));

create policy "conversations_insert_own"
  on public.conversations for insert to authenticated
  with check (patient_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- messages (psychologist read only with an ACTIVE full-scope link;
-- patients insert their own 'user' rows only — assistant rows come from
-- the API via the service role)
-- ---------------------------------------------------------------------------
create policy "messages_select_own_or_full_link"
  on public.messages for select to authenticated
  using (
    patient_id = (select auth.uid())
    or public.link_scope(patient_id) = 'full'
  );

create policy "messages_insert_own_user"
  on public.messages for insert to authenticated
  with check (
    patient_id = (select auth.uid())
    and sender = 'user'
  );
-- no update / delete policies: the chat record is preserved (deletion goes
-- through delete_my_data())

-- ---------------------------------------------------------------------------
-- risk_events
-- ---------------------------------------------------------------------------
create policy "risk_events_select_own"
  on public.risk_events for select to authenticated
  using (patient_id = (select auth.uid()));

create policy "risk_events_select_linked"
  on public.risk_events for select to authenticated
  using (public.has_active_link(patient_id));

create policy "risk_events_update_reviewers"
  on public.risk_events for update to authenticated
  using (public.has_active_link(patient_id))
  with check (public.has_active_link(patient_id));
-- no insert / delete policies: created by the API (service role) only

-- ---------------------------------------------------------------------------
-- clinician_notes (authoring psychologist + active link only; patients
-- deliberately have NO access — product choice, see docs/RLS.md)
-- ---------------------------------------------------------------------------
create policy "clinician_notes_select_author"
  on public.clinician_notes for select to authenticated
  using (psychologist_id = (select auth.uid()) and public.has_active_link(patient_id));

create policy "clinician_notes_insert_author"
  on public.clinician_notes for insert to authenticated
  with check (psychologist_id = (select auth.uid()) and public.has_active_link(patient_id));

create policy "clinician_notes_update_author"
  on public.clinician_notes for update to authenticated
  using (psychologist_id = (select auth.uid()) and public.has_active_link(patient_id))
  with check (psychologist_id = (select auth.uid()) and public.has_active_link(patient_id));

create policy "clinician_notes_delete_author"
  on public.clinician_notes for delete to authenticated
  using (psychologist_id = (select auth.uid()) and public.has_active_link(patient_id));

-- ---------------------------------------------------------------------------
-- audit_log (append-only; spoof-proof insert; no update/delete for anyone)
-- ---------------------------------------------------------------------------
create policy "audit_log_insert_self"
  on public.audit_log for insert to authenticated
  with check (actor_id = (select auth.uid()));

create policy "audit_log_select_own"
  on public.audit_log for select to authenticated
  using (actor_id = (select auth.uid()) or target_patient_id = (select auth.uid()));
-- no update / delete policies: audit rows are immutable via the API
