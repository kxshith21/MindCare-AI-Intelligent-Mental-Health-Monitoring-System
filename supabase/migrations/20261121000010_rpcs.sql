-- ============================================================================
-- RPCs: invite_psychologist, shared_checkins, record_patient_access,
--       delete_my_data
--
-- All are SECURITY DEFINER with search_path = '' and fully qualified names.
-- EXECUTE is revoked from PUBLIC/anon and granted to authenticated and
-- service_role only.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Patient invites a verified psychologist by email.
--
-- Anti-enumeration: the SAME generic jsonb is returned whether the email
-- belongs to a verified psychologist, an unverified one, a non-psychologist,
-- or no account at all. Only caller-side errors raise (not a patient /
-- bad scope argument). The lookup runs against auth.users + profiles +
-- psychologist_profiles as the definer (the caller has no rights there).
-- ---------------------------------------------------------------------------
create or replace function public.invite_psychologist(p_email text, p_share_scope text default 'summary_only')
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_patient uuid := (select auth.uid());
  v_role text;
  v_psych uuid;
  v_scope text := coalesce(nullif(p_share_scope, ''), 'summary_only');
begin
  -- caller-side validation (allowed to raise)
  if v_patient is null then
    raise exception 'invite_psychologist: not authenticated';
  end if;
  select role into v_role from public.profiles where id = v_patient;
  if v_role is distinct from 'patient' then
    raise exception 'invite_psychologist: only patients can invite';
  end if;
  if v_scope not in ('summary_only', 'full') then
    raise exception 'invite_psychologist: p_share_scope must be summary_only or full';
  end if;
  if p_email is null or char_length(trim(p_email)) = 0 then
    raise exception 'invite_psychologist: email is required';
  end if;

  -- target must be a VERIFIED psychologist; otherwise no row is found and
  -- the generic response below is returned unchanged.
  select u.id into v_psych
  from auth.users u
  join public.profiles p on p.id = u.id and p.role = 'psychologist'
  join public.psychologist_profiles pp on pp.user_id = u.id and pp.verified
  where lower(u.email) = lower(trim(p_email))
  limit 1;

  if v_psych is not null and v_psych <> v_patient then
    insert into public.care_links (patient_id, psychologist_id, status, share_scope, consented_at)
    values (v_patient, v_psych, 'pending', v_scope, now())
    on conflict do nothing;
  end if;

  -- identical response for every lookup outcome (existing / non-existing /
  -- unverified / non-psychologist email, duplicate live link)
  return jsonb_build_object(
    'status', 'received',
    'message', 'If a verified psychologist matches that address, they will receive your invitation.'
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Psychologist-side view of a patient's check-ins for an ACTIVE link.
-- mood/scores/created_at always; note + raw answers ONLY when the link is
-- share_scope = 'full'. Returns an empty set when there is no active link.
-- ---------------------------------------------------------------------------
create or replace function public.shared_checkins(p_patient uuid)
returns table (
  mood          smallint,
  phq9_score    smallint,
  gad7_score    smallint,
  created_at    timestamptz,
  note          text,
  phq9_answers  int[],
  gad7_answers  int[]
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    c.mood,
    c.phq9_score,
    c.gad7_score,
    c.created_at,
    case when cl.share_scope = 'full' then c.note end,
    case when cl.share_scope = 'full' then c.phq9_answers end,
    case when cl.share_scope = 'full' then c.gad7_answers end
  from public.checkins c
  join public.care_links cl
    on cl.patient_id = c.patient_id
   and cl.psychologist_id = (select auth.uid())
   and cl.status = 'active'
  where c.patient_id = p_patient
    and public.is_verified_psychologist()
  order by c.created_at desc;
$$;

-- ---------------------------------------------------------------------------
-- Audit trail: the API calls this every time a psychologist views patient
-- data. Requires a verified psychologist with an ACTIVE link.
-- ---------------------------------------------------------------------------
create or replace function public.record_patient_access(p_patient uuid, p_action text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
begin
  if v_actor is null then
    raise exception 'record_patient_access: not authenticated';
  end if;
  if not public.has_active_link(p_patient) then
    raise exception 'record_patient_access: no active link';
  end if;
  if p_action is null or char_length(trim(p_action)) = 0 then
    raise exception 'record_patient_access: action is required';
  end if;

  insert into public.audit_log (actor_id, action, target_patient_id)
  values (v_actor, left(trim(p_action), 100), p_patient);
end;
$$;

-- ---------------------------------------------------------------------------
-- Patient data deletion (PATIENT ONLY).
--
-- Deletes: messages, conversations, risk_events, checkins, care_links, and
-- clinician_notes ABOUT the caller. Anonymises the caller's audit_log rows
-- (actor/target set to null) and appends one 'data_deleted' entry with no
-- identity. The caller's own profile row and auth.users account are NOT
-- touched — account deletion is a service-role API endpoint in Phase 3
-- (TODO in api/app/routers). SECURITY DEFINER runs as the owner, so RLS
-- delete policies (absent for messages/conversations) do not block it.
-- ---------------------------------------------------------------------------
create or replace function public.delete_my_data()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_patient uuid := (select auth.uid());
  v_role text;
  v_msgs bigint := 0;
  v_convs bigint := 0;
  v_risks bigint := 0;
  v_checks bigint := 0;
  v_links  bigint := 0;
  v_notes  bigint := 0;
  v_audits bigint := 0;
begin
  if v_patient is null then
    raise exception 'delete_my_data: not authenticated';
  end if;
  select role into v_role from public.profiles where id = v_patient;
  if v_role is distinct from 'patient' then
    raise exception 'delete_my_data: only patients can delete data';
  end if;

  delete from public.risk_events where patient_id = v_patient;
  get diagnostics v_risks = row_count;
  delete from public.messages where patient_id = v_patient;
  get diagnostics v_msgs = row_count;
  delete from public.conversations where patient_id = v_patient;
  get diagnostics v_convs = row_count;
  delete from public.checkins where patient_id = v_patient;
  get diagnostics v_checks = row_count;
  delete from public.care_links where patient_id = v_patient;
  get diagnostics v_links = row_count;
  -- clinician_notes written ABOUT this patient (product decision, docs/RLS.md)
  delete from public.clinician_notes where patient_id = v_patient;
  get diagnostics v_notes = row_count;

  -- anonymise identity on the caller's audit rows (actor OR target)
  update public.audit_log
     set actor_id = null, target_patient_id = null
   where actor_id = v_patient or target_patient_id = v_patient;
  get diagnostics v_audits = row_count;

  -- one identity-free marker row so the audit trail still shows the event
  insert into public.audit_log (actor_id, action, target_patient_id)
  values (null, 'data_deleted', null);

  return jsonb_build_object(
    'messages', v_msgs,
    'conversations', v_convs,
    'risk_events', v_risks,
    'checkins', v_checks,
    'care_links', v_links,
    'clinician_notes', v_notes,
    'audit_rows_anonymised', v_audits
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Grants: never PUBLIC/anon; authenticated + service_role only.
-- ---------------------------------------------------------------------------
revoke execute on function public.invite_psychologist(text, text) from public, anon;
revoke execute on function public.shared_checkins(uuid) from public, anon;
revoke execute on function public.record_patient_access(uuid, text) from public, anon;
revoke execute on function public.delete_my_data() from public, anon;

grant execute on function public.invite_psychologist(text, text) to authenticated, service_role;
grant execute on function public.shared_checkins(uuid) to authenticated, service_role;
grant execute on function public.record_patient_access(uuid, text) to authenticated, service_role;
grant execute on function public.delete_my_data() to authenticated, service_role;
