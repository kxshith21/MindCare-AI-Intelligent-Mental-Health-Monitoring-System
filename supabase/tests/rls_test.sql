-- ============================================================================
-- MindCare AI — Phase 2 RLS test suite (scripted SQL, no pgTAP required)
--
-- Run against a FRESHLY RESET local database:
--   supabase db reset
--   docker cp supabase/tests/rls_test.sql supabase_db_MindCare-AI-Intelligent-Mental-Health-Mo:/tmp/rls_test.sql
--   docker exec supabase_db_MindCare-AI-Intelligent-Mental-Health-Mo \
--     psql -U postgres -d postgres -v ON_ERROR_STOP=1 -f /tmp/rls_test.sql
--
-- Every assertion prints "PASS: ...". Any failure raises SQLSTATE TSTFL and
-- aborts the script (ON_ERROR_STOP=1), so a clean run ends with
-- "=== ALL 13 RLS SCENARIOS PASSED ===".
--
-- Sessions impersonate users with:
--   set_config('role', <role>, true)          -- applies RLS
--   set_config('request.jwt.claims', {...}, true)  -- feeds auth.uid()
-- ============================================================================

create schema if not exists _test;
grant usage on schema _test to anon, authenticated, service_role;

-- --- assertion helpers ------------------------------------------------------
create or replace function _test.t_pass(p_label text)
returns void language plpgsql as $fn$
begin
  raise notice 'PASS: %', p_label;
end $fn$;

create or replace function _test.t_fail(p_label text, p_detail text default null)
returns void language plpgsql as $fn$
begin
  raise exception 'FAIL: % | %', p_label, coalesce(p_detail, '')
    using errcode = 'TSTFL';
end $fn$;

create or replace function _test.t_eq(p_label text, p_expected text, p_actual text)
returns void language plpgsql as $fn$
begin
  if p_expected is distinct from p_actual then
    perform _test.t_fail(p_label, format('expected %s, got %s',
      coalesce(p_expected, '<null>'), coalesce(p_actual, '<null>')));
  end if;
  perform _test.t_pass(p_label);
end $fn$;

-- Runs p_sql as the CURRENT (impersonated) role. Success = failure of the test.
create or replace function _test.t_expect_fail(p_label text, p_sql text)
returns void language plpgsql as $fn$
begin
  execute p_sql;
  perform _test.t_fail(p_label, 'statement succeeded but should have failed');
exception
  when others then
    if sqlstate = 'TSTFL' then
      raise;
    end if;
    perform _test.t_pass(p_label || ' [blocked: ' || sqlerrm || ']');
end $fn$;

grant execute on function _test.t_pass(text) to anon, authenticated, service_role;
grant execute on function _test.t_fail(text, text) to anon, authenticated, service_role;
grant execute on function _test.t_eq(text, text, text) to anon, authenticated, service_role;
grant execute on function _test.t_expect_fail(text, text) to anon, authenticated, service_role;

-- ============================================================================
-- FIXTURES (test-only; created as postgres, never used by migrations)
--   pA 1111..  active summary_only link w/ psychV   + active link w/ psychU
--   pB 2222..  pending link w/ psychV               + pending link w/ psych3
--   pC 5555..  active FULL link w/ psychV (revoked mid-test-7)
--   pD 6666..  REVOKED link w/ psychV
--   pE 8888..  active link w/ psych3 (delete_my_data target)
--   psychV 3333..  verified    psychU 4444..  UNVERIFIED
--   psych3 7777..  verified, no seed links
-- ============================================================================
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, confirmation_sent_at, recovery_token, recovery_sent_at,
  email_change_token_new, email_change, email_change_sent_at,
  email_change_token_current, email_change_confirm_status,
  banned_until, reauthentication_token, reauthentication_sent_at,
  is_sso_user, deleted_at
) values
  ('00000000-0000-0000-0000-000000000000', '55555555-5555-5555-5555-555555555555',
   'authenticated', 'authenticated', 'fixture.pc@demo.test',
   extensions.crypt('demo-password-123', extensions.gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"]}',
   '{"display_name":"Fixture Patient C"}', now(), now(),
   '', null, '', null, '', '', null, '', 0, null, '', null, false, null),
  ('00000000-0000-0000-0000-000000000000', '66666666-6666-6666-6666-666666666666',
   'authenticated', 'authenticated', 'fixture.pd@demo.test',
   extensions.crypt('demo-password-123', extensions.gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"]}',
   '{"display_name":"Fixture Patient D"}', now(), now(),
   '', null, '', null, '', '', null, '', 0, null, '', null, false, null),
  ('00000000-0000-0000-0000-000000000000', '77777777-7777-7777-7777-777777777777',
   'authenticated', 'authenticated', 'fixture.psych3@demo.test',
   extensions.crypt('demo-password-123', extensions.gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"],"role":"psychologist"}',
   '{"display_name":"Fixture Psych Three","license_no":"LIC-TEST-003"}', now(), now(),
   '', null, '', null, '', '', null, '', 0, null, '', null, false, null),
  ('00000000-0000-0000-0000-000000000000', '88888888-8888-8888-8888-888888888888',
   'authenticated', 'authenticated', 'fixture.pe@demo.test',
   extensions.crypt('demo-password-123', extensions.gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"]}',
   '{"display_name":"Fixture Patient E"}', now(), now(),
   '', null, '', null, '', '', null, '', 0, null, '', null, false, null);

update public.psychologist_profiles
   set verified = true, verified_at = now()
 where user_id = '77777777-7777-7777-7777-777777777777';

-- links
insert into public.care_links (patient_id, psychologist_id, status, share_scope, invited_at, consented_at, revoked_at) values
  ('55555555-5555-5555-5555-555555555555', '33333333-3333-3333-3333-333333333333', 'active',    'full',         now(), now(), null),
  ('66666666-6666-6666-6666-666666666666', '33333333-3333-3333-3333-333333333333', 'revoked',   'summary_only', now(), now(), now()),
  ('11111111-1111-1111-1111-111111111111', '44444444-4444-4444-4444-444444444444', 'active',    'summary_only', now(), now(), null),
  ('88888888-8888-8888-8888-888888888888', '77777777-7777-7777-7777-777777777777', 'active',    'summary_only', now(), now(), null),
  ('22222222-2222-2222-2222-222222222222', '77777777-7777-7777-7777-777777777777', 'pending',   'summary_only', now(), now(), null);

-- check-ins (scores are computed by trigger from the answers)
insert into public.checkins (patient_id, mood, note, phq9_answers, gad7_answers) values
  ('11111111-1111-1111-1111-111111111111', 3, 'Feeling okay this week',        '{0,1,2,3,0,1,2,3,0}', '{1,1,1,1,1,1,1}'),
  ('22222222-2222-2222-2222-222222222222', 2, 'A bit low lately',              '{1,1,1,1,1,1,1,1,1}', null),
  ('55555555-5555-5555-5555-555555555555', 4, 'Full-scope note for linked psych', '{0,0,1,1,0,0,1,1,0}', null),
  ('66666666-6666-6666-6666-666666666666', 3, 'Revoked-link patient checkin',  null, null),
  ('88888888-8888-8888-8888-888888888888', 5, 'Check-in to be deleted',        '{0,0,0,0,0,0,0,0,0}', null);

-- conversations + messages
insert into public.conversations (id, patient_id) values
  ('aaaaaaa1-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111'),
  ('aaaaaaa2-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '22222222-2222-2222-2222-222222222222'),
  ('aaaaaaa3-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '55555555-5555-5555-5555-555555555555'),
  ('aaaaaaa4-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '88888888-8888-8888-8888-888888888888');

insert into public.messages (conversation_id, patient_id, sender, content) values
  ('aaaaaaa1-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111', 'user',      'I have been feeling anxious lately'),
  ('aaaaaaa1-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111', 'assistant', 'Thank you for sharing that. Can you tell me more?'),
  ('aaaaaaa2-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '22222222-2222-2222-2222-222222222222', 'user',      'Sleep has been rough'),
  ('aaaaaaa3-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '55555555-5555-5555-5555-555555555555', 'user',      'Full scope patient message'),
  ('aaaaaaa3-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '55555555-5555-5555-5555-555555555555', 'assistant', 'Full scope assistant reply'),
  ('aaaaaaa4-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '88888888-8888-8888-8888-888888888888', 'user',      'Message to be deleted'),
  ('aaaaaaa4-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '88888888-8888-8888-8888-888888888888', 'assistant', 'Reply to be deleted');

-- risk events (API/service-role rows)
insert into public.risk_events (patient_id, message_id, level, reason, status) values
  ('11111111-1111-1111-1111-111111111111',
   (select id from public.messages where patient_id = '11111111-1111-1111-1111-111111111111' and sender = 'user' limit 1),
   'elevated', 'Elevated language detected in conversation', 'new'),
  ('22222222-2222-2222-2222-222222222222', null, 'low',      'Low-severity signal for isolation test', 'new'),
  ('55555555-5555-5555-5555-555555555555', null, 'elevated', 'Full-scope patient risk event',          'new'),
  ('66666666-6666-6666-6666-666666666666', null, 'high',     'Revoked-link patient risk event',         'new'),
  ('88888888-8888-8888-8888-888888888888', null, 'low',      'Risk event to be deleted',                'new');

-- clinician notes (psychV about pA/pC, psych3 about pE)
insert into public.clinician_notes (psychologist_id, patient_id, note) values
  ('33333333-3333-3333-3333-333333333333', '11111111-1111-1111-1111-111111111111', 'Private note: patient prefers morning sessions'),
  ('33333333-3333-3333-3333-333333333333', '55555555-5555-5555-5555-555555555555', 'Private note: full-scope patient'),
  ('77777777-7777-7777-7777-777777777777', '88888888-8888-8888-8888-888888888888', 'Private note: to be deleted with patient data');

-- audit rows
insert into public.audit_log (actor_id, action, target_patient_id) values
  ('33333333-3333-3333-3333-333333333333', 'view_summary', '11111111-1111-1111-1111-111111111111'),
  ('33333333-3333-3333-3333-333333333333', 'view_pending', '22222222-2222-2222-2222-222222222222'),
  ('22222222-2222-2222-2222-222222222222', 'self_action',  null),
  ('88888888-8888-8888-8888-888888888888', 'self_view',    '88888888-8888-8888-8888-888888888888'),
  ('77777777-7777-7777-7777-777777777777', 'view_summary', '88888888-8888-8888-8888-888888888888');

-- ============================================================================
-- TEST 1 — Patient A cannot read Patient B's data
-- ============================================================================
do $test$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims',
    '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);

  perform _test.t_eq('1.1 pA sees 0 of pB checkins', '0',
    (select count(*)::text from public.checkins where patient_id = '22222222-2222-2222-2222-222222222222'::uuid));
  perform _test.t_eq('1.2 pA sees 0 of pB messages', '0',
    (select count(*)::text from public.messages where patient_id = '22222222-2222-2222-2222-222222222222'::uuid));
  perform _test.t_eq('1.3 pA sees 0 of pB risk_events', '0',
    (select count(*)::text from public.risk_events where patient_id = '22222222-2222-2222-2222-222222222222'::uuid));
  perform _test.t_eq('1.4 pA sees 0 audit rows targeting pB', '0',
    (select count(*)::text from public.audit_log where target_patient_id = '22222222-2222-2222-2222-222222222222'::uuid));
  perform _test.t_eq('1.5 pA sees 0 profile rows for pB', '0',
    (select count(*)::text from public.profiles where id = '22222222-2222-2222-2222-222222222222'::uuid));
  -- positive controls (prove the queries are not vacuously empty)
  perform _test.t_eq('1.6 CONTROL: pA sees own checkin', '1',
    (select count(*)::text from public.checkins where patient_id = '11111111-1111-1111-1111-111111111111'::uuid));
  perform _test.t_eq('1.7 CONTROL: pA sees audit rows targeting pA', '1',
    (select count(*)::text from public.audit_log where target_patient_id = '11111111-1111-1111-1111-111111111111'::uuid));
end $test$;

-- ============================================================================
-- TEST 2 — anon reads/calls nothing
-- ============================================================================
do $test$
begin
  perform set_config('role', 'anon', true);
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);

  perform _test.t_expect_fail('2.1 anon cannot SELECT profiles',      'select 1 from public.profiles limit 1');
  perform _test.t_expect_fail('2.2 anon cannot SELECT psych_profiles','select 1 from public.psychologist_profiles limit 1');
  perform _test.t_expect_fail('2.3 anon cannot SELECT care_links',    'select 1 from public.care_links limit 1');
  perform _test.t_expect_fail('2.4 anon cannot SELECT checkins',      'select 1 from public.checkins limit 1');
  perform _test.t_expect_fail('2.5 anon cannot SELECT conversations', 'select 1 from public.conversations limit 1');
  perform _test.t_expect_fail('2.6 anon cannot SELECT messages',      'select 1 from public.messages limit 1');
  perform _test.t_expect_fail('2.7 anon cannot SELECT risk_events',   'select 1 from public.risk_events limit 1');
  perform _test.t_expect_fail('2.8 anon cannot SELECT clinician_notes','select 1 from public.clinician_notes limit 1');
  perform _test.t_expect_fail('2.9 anon cannot SELECT audit_log',     'select 1 from public.audit_log limit 1');
  perform _test.t_expect_fail('2.10 anon cannot call invite_psychologist',
    $$select public.invite_psychologist('x@y.z', 'summary_only')$$);
  perform _test.t_expect_fail('2.11 anon cannot call delete_my_data',
    $$select public.delete_my_data()$$);
end $test$;

-- ============================================================================
-- TEST 3 — no client-side role escalation
-- ============================================================================
do $test$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims',
    '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);

  perform _test.t_expect_fail('3.1 patient cannot update own role',
    $$update public.profiles set role = 'psychologist' where id = '11111111-1111-1111-1111-111111111111'::uuid$$);
  perform _test.t_expect_fail('3.2 patient cannot touch auth.users (role source)',
    $$update auth.users set raw_app_meta_data = '{"role":"psychologist"}' where id = '11111111-1111-1111-1111-111111111111'::uuid$$);
  perform _test.t_expect_fail('3.3 patient cannot insert profile rows',
    $$insert into public.profiles (id, role) values ('99999999-9999-9999-9999-99999999aaaa'::uuid, 'psychologist')$$);
end $test$;

-- signup simulations (as postgres — GoTrue runs server-side)
do $test$
begin
  -- client controls user_metadata only; role must still become 'patient'
  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at
  ) values (
    '00000000-0000-0000-0000-000000000000', '99999999-9999-9999-9999-999999999999',
    'authenticated', 'authenticated', 'client-role-attempt@demo.test',
    extensions.crypt('demo-password-123', extensions.gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}',
    '{"display_name":"Sneaky","role":"psychologist","license_no":"FAKE"}', now(), now());

  perform _test.t_eq('3.4 signup with role inside user_metadata still becomes patient', 'patient',
    (select role from public.profiles where id = '99999999-9999-9999-9999-999999999999'::uuid));
  perform _test.t_eq('3.5 no psychologist_profiles row for client-controlled signup', '0',
    (select count(*)::text from public.psychologist_profiles
      where user_id = '99999999-9999-9999-9999-999999999999'::uuid));

  -- server-side (API) signup: app_metadata.role = psychologist, starts UNVERIFIED
  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at
  ) values (
    '00000000-0000-0000-0000-000000000000', '10101010-1010-1010-1010-101010101010',
    'authenticated', 'authenticated', 'server-assigned-psych@demo.test',
    extensions.crypt('demo-password-123', extensions.gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"],"role":"psychologist"}',
    '{"display_name":"Server Assigned","license_no":"LIC-TEST-010"}', now(), now());

  perform _test.t_eq('3.6 server-side app_metadata role = psychologist', 'psychologist',
    (select role from public.profiles where id = '10101010-1010-1010-1010-101010101010'::uuid));
  perform _test.t_eq('3.7 new psychologist starts UNVERIFIED', 'false',
    (select verified::text from public.psychologist_profiles
      where user_id = '10101010-1010-1010-1010-101010101010'::uuid));

  -- Supabase Admin API flow: GoTrue INSERTs first, then patches app_metadata.
  -- The reconciliation trigger must turn the patient row into a psychologist.
  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at
  ) values (
    '00000000-0000-0000-0000-000000000000', '12121212-1212-1212-1212-121212121212',
    'authenticated', 'authenticated', 'admin-patched-psych@demo.test',
    extensions.crypt('demo-password-123', extensions.gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}',
    '{"display_name":"Admin Patched","license_no":"LIC-TEST-011"}', now(), now());

  update auth.users
     set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) || '{"role":"psychologist"}'::jsonb
   where id = '12121212-1212-1212-1212-121212121212'::uuid;

  perform _test.t_eq('3.8 app_metadata patch reconciles profile role', 'psychologist',
    (select role from public.profiles where id = '12121212-1212-1212-1212-121212121212'::uuid));
  perform _test.t_eq('3.9 reconciled psychologist starts UNVERIFIED', 'false',
    (select verified::text from public.psychologist_profiles
      where user_id = '12121212-1212-1212-1212-121212121212'::uuid));
end $test$;

-- ============================================================================
-- TEST 4 — unverified psychologist with an ACTIVE link sees nothing
-- ============================================================================
do $test$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims',
    '{"sub":"44444444-4444-4444-4444-444444444444","role":"authenticated"}', true);

  perform _test.t_eq('4.1 unverified psych: 0 shared checkins', '0',
    (select count(*)::text from public.shared_checkins('11111111-1111-1111-1111-111111111111'::uuid)));
  perform _test.t_eq('4.2 unverified psych: 0 risk_events', '0',
    (select count(*)::text from public.risk_events where patient_id = '11111111-1111-1111-1111-111111111111'::uuid));
  perform _test.t_eq('4.3 unverified psych: 0 patient profile rows', '0',
    (select count(*)::text from public.profiles where id = '11111111-1111-1111-1111-111111111111'::uuid));
  perform _test.t_eq('4.4 unverified psych: 0 messages', '0',
    (select count(*)::text from public.messages where patient_id = '11111111-1111-1111-1111-111111111111'::uuid));
  perform _test.t_eq('4.5 unverified psych: 0 clinician notes', '0',
    (select count(*)::text from public.clinician_notes where patient_id = '11111111-1111-1111-1111-111111111111'::uuid));
  perform _test.t_expect_fail('4.6 unverified psych cannot self-verify',
    $$update public.psychologist_profiles set verified = true where user_id = '44444444-4444-4444-4444-444444444444'::uuid$$);
end $test$;

-- ============================================================================
-- TEST 5 — verified psych with PENDING or REVOKED link sees nothing
-- ============================================================================
do $test$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims',
    '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}', true);

  perform _test.t_eq('5.1 PENDING link: 0 shared checkins', '0',
    (select count(*)::text from public.shared_checkins('22222222-2222-2222-2222-222222222222'::uuid)));
  perform _test.t_eq('5.2 REVOKED link: 0 shared checkins', '0',
    (select count(*)::text from public.shared_checkins('66666666-6666-6666-6666-666666666666'::uuid)));
  perform _test.t_eq('5.3 pending+revoked: 0 risk_events', '0',
    (select count(*)::text from public.risk_events
      where patient_id in ('22222222-2222-2222-2222-222222222222'::uuid, '66666666-6666-6666-6666-666666666666'::uuid)));
  perform _test.t_eq('5.4 pending+revoked: 0 messages', '0',
    (select count(*)::text from public.messages
      where patient_id in ('22222222-2222-2222-2222-222222222222'::uuid, '66666666-6666-6666-6666-666666666666'::uuid)));
  perform _test.t_eq('5.5 pending+revoked: 0 profile rows', '0',
    (select count(*)::text from public.profiles
      where id in ('22222222-2222-2222-2222-222222222222'::uuid, '66666666-6666-6666-6666-666666666666'::uuid)));
  perform _test.t_eq('5.6 pending+revoked: 0 clinician notes', '0',
    (select count(*)::text from public.clinician_notes
      where patient_id in ('22222222-2222-2222-2222-222222222222'::uuid, '66666666-6666-6666-6666-666666666666'::uuid)));
end $test$;

-- ============================================================================
-- TEST 6 — ACTIVE + summary_only: scores/mood yes, notes/answers/messages no
-- ============================================================================
do $test$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims',
    '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}', true);

  perform _test.t_eq('6.1 CONTROL: 1 shared checkin row', '1',
    (select count(*)::text from public.shared_checkins('11111111-1111-1111-1111-111111111111'::uuid)));
  perform _test.t_eq('6.2 CONTROL: mood + computed scores visible', '1',
    (select count(*)::text from public.shared_checkins('11111111-1111-1111-1111-111111111111'::uuid)
      where mood is not null and phq9_score = 12 and gad7_score = 7));
  perform _test.t_eq('6.3 checkin note hidden under summary_only', '0',
    (select count(*)::text from public.shared_checkins('11111111-1111-1111-1111-111111111111'::uuid)
      where note is not null));
  perform _test.t_eq('6.4 raw answers hidden under summary_only', '0',
    (select count(*)::text from public.shared_checkins('11111111-1111-1111-1111-111111111111'::uuid)
      where phq9_answers is not null or gad7_answers is not null));
  perform _test.t_eq('6.5 0 messages under summary_only', '0',
    (select count(*)::text from public.messages where patient_id = '11111111-1111-1111-1111-111111111111'::uuid));
  perform _test.t_eq('6.6 psych has NO direct checkins table access', '0',
    (select count(*)::text from public.checkins));
  -- product decision (docs/RLS.md): active link alone may read clinician notes
  perform _test.t_eq('6.7 CONTROL: active link reads clinician notes', '1',
    (select count(*)::text from public.clinician_notes where patient_id = '11111111-1111-1111-1111-111111111111'::uuid));
end $test$;

-- ============================================================================
-- TEST 7 — ACTIVE + full: sees messages + notes; revoke stops access at once
-- ============================================================================
do $test$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims',
    '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}', true);

  perform _test.t_eq('7.1 CONTROL full link: sees 2 messages', '2',
    (select count(*)::text from public.messages where patient_id = '55555555-5555-5555-5555-555555555555'::uuid));
  perform _test.t_eq('7.2 CONTROL full link: sees checkin note', '1',
    (select count(*)::text from public.shared_checkins('55555555-5555-5555-5555-555555555555'::uuid)
      where note is not null));
  perform _test.t_eq('7.3 CONTROL full link: sees clinician note', '1',
    (select count(*)::text from public.clinician_notes where patient_id = '55555555-5555-5555-5555-555555555555'::uuid));
  perform _test.t_eq('7.4 CONTROL full link: sees risk event', '1',
    (select count(*)::text from public.risk_events where patient_id = '55555555-5555-5555-5555-555555555555'::uuid));
  perform _test.t_eq('7.5 CONTROL full link: sees patient profile', '1',
    (select count(*)::text from public.profiles where id = '55555555-5555-5555-5555-555555555555'::uuid));
end $test$;

-- patient pC revokes the link
do $test$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims',
    '{"sub":"55555555-5555-5555-5555-555555555555","role":"authenticated"}', true);

  update public.care_links
     set status = 'revoked'
   where patient_id = '55555555-5555-5555-5555-555555555555'
     and psychologist_id = '33333333-3333-3333-3333-333333333333';
  perform _test.t_pass('7.6 patient can revoke an active link');
end $test$;

do $test$
begin
  perform _test.t_eq('7.7 revoked link row is timestamped', 'true',
    (select (status = 'revoked' and revoked_at is not null)::text from public.care_links
      where patient_id = '55555555-5555-5555-5555-555555555555'
        and psychologist_id = '33333333-3333-3333-3333-333333333333'));

  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims',
    '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}', true);

  perform _test.t_eq('7.8 after revoke: 0 messages', '0',
    (select count(*)::text from public.messages where patient_id = '55555555-5555-5555-5555-555555555555'::uuid));
  perform _test.t_eq('7.9 after revoke: 0 shared checkin rows', '0',
    (select count(*)::text from public.shared_checkins('55555555-5555-5555-5555-555555555555'::uuid)));
  perform _test.t_eq('7.10 after revoke: 0 clinician notes', '0',
    (select count(*)::text from public.clinician_notes where patient_id = '55555555-5555-5555-5555-555555555555'::uuid));
  perform _test.t_eq('7.11 after revoke: 0 risk events', '0',
    (select count(*)::text from public.risk_events where patient_id = '55555555-5555-5555-5555-555555555555'::uuid));
  perform _test.t_eq('7.12 after revoke: 0 profile rows', '0',
    (select count(*)::text from public.profiles where id = '55555555-5555-5555-5555-555555555555'::uuid));
end $test$;

-- ============================================================================
-- TEST 8 — no share_scope / ownership changes; transitions are actor-checked
-- ============================================================================
do $test$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims',
    '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}', true);

  perform _test.t_expect_fail('8.1 psych cannot change share_scope',
    $$update public.care_links set share_scope = 'full'
       where patient_id = '11111111-1111-1111-1111-111111111111'::uuid
         and psychologist_id = '33333333-3333-3333-3333-333333333333'::uuid$$);
  perform _test.t_expect_fail('8.2 psych cannot change patient_id',
    $$update public.care_links set patient_id = '22222222-2222-2222-2222-222222222222'::uuid
       where patient_id = '11111111-1111-1111-1111-111111111111'::uuid
         and psychologist_id = '33333333-3333-3333-3333-333333333333'::uuid$$);
  perform _test.t_expect_fail('8.3 psych cannot change psychologist_id',
    $$update public.care_links set psychologist_id = '77777777-7777-7777-7777-777777777777'::uuid
       where patient_id = '11111111-1111-1111-1111-111111111111'::uuid
         and psychologist_id = '33333333-3333-3333-3333-333333333333'::uuid$$);
end $test$;

do $test$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims',
    '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);

  perform _test.t_expect_fail('8.4 patient cannot change ownership either',
    $$update public.care_links set patient_id = '22222222-2222-2222-2222-222222222222'::uuid
       where patient_id = '11111111-1111-1111-1111-111111111111'::uuid$$);

  -- the PATIENT may change share_scope (control)
  update public.care_links set share_scope = 'full'
   where patient_id = '11111111-1111-1111-1111-111111111111'::uuid
     and psychologist_id = '33333333-3333-3333-3333-333333333333'::uuid;
  perform _test.t_eq('8.5 CONTROL: patient can change share_scope', 'full',
    (select share_scope from public.care_links
      where patient_id = '11111111-1111-1111-1111-111111111111'::uuid
        and psychologist_id = '33333333-3333-3333-3333-333333333333'::uuid));

  update public.care_links set share_scope = 'summary_only'
   where patient_id = '11111111-1111-1111-1111-111111111111'::uuid
     and psychologist_id = '33333333-3333-3333-3333-333333333333'::uuid;
  perform _test.t_eq('8.6 reverted to summary_only', 'summary_only',
    (select share_scope from public.care_links
      where patient_id = '11111111-1111-1111-1111-111111111111'::uuid
        and psychologist_id = '33333333-3333-3333-3333-333333333333'::uuid));
end $test$;

-- transition rules: only the psychologist may accept a pending link
do $test$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims',
    '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true);

  perform _test.t_expect_fail('8.7 patient cannot accept own pending link',
    $$update public.care_links set status = 'active'
       where patient_id = '22222222-2222-2222-2222-222222222222'::uuid
         and psychologist_id = '77777777-7777-7777-7777-777777777777'::uuid$$);
end $test$;

do $test$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims',
    '{"sub":"77777777-7777-7777-7777-777777777777","role":"authenticated"}', true);

  update public.care_links set status = 'active'
   where patient_id = '22222222-2222-2222-2222-222222222222'::uuid
     and psychologist_id = '77777777-7777-7777-7777-777777777777'::uuid;
  perform _test.t_pass('8.8 CONTROL: verified psych can accept a pending link');
end $test$;

do $test$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims',
    '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true);

  update public.care_links set status = 'revoked'
   where patient_id = '22222222-2222-2222-2222-222222222222'::uuid
     and psychologist_id = '77777777-7777-7777-7777-777777777777'::uuid;
  perform _test.t_pass('8.9 CONTROL: patient can revoke the link afterwards');
end $test$;

-- ============================================================================
-- TEST 9 — risk_events: no client inserts; psych updates status fields only
-- ============================================================================
do $test$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims',
    '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);

  perform _test.t_expect_fail('9.1 patient cannot insert risk_events',
    $$insert into public.risk_events (patient_id, level, reason)
       values ('11111111-1111-1111-1111-111111111111'::uuid, 'high', 'client insert attempt')$$);
end $test$;

do $test$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims',
    '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}', true);

  perform _test.t_expect_fail('9.2 psych cannot insert risk_events',
    $$insert into public.risk_events (patient_id, level, reason)
       values ('11111111-1111-1111-1111-111111111111'::uuid, 'high', 'psych insert attempt')$$);
  perform _test.t_expect_fail('9.3 psych cannot change level',
    $$update public.risk_events set level = 'high'
       where patient_id = '11111111-1111-1111-1111-111111111111'::uuid$$);
  perform _test.t_expect_fail('9.4 psych cannot change patient_id',
    $$update public.risk_events set patient_id = '22222222-2222-2222-2222-222222222222'::uuid
       where patient_id = '11111111-1111-1111-1111-111111111111'::uuid$$);

  -- allowed: move status (control)
  update public.risk_events set status = 'acknowledged'
   where patient_id = '11111111-1111-1111-1111-111111111111'::uuid;
  perform _test.t_pass('9.5 CONTROL: psych can update status');
end $test$;

do $test$
begin
  perform _test.t_eq('9.6 reviewed_by pinned to the acting psych', '33333333-3333-3333-3333-333333333333',
    (select reviewed_by::text from public.risk_events
      where patient_id = '11111111-1111-1111-1111-111111111111'::uuid));
  perform _test.t_eq('9.7 reviewed_at set', 'true',
    (select (reviewed_at is not null)::text from public.risk_events
      where patient_id = '11111111-1111-1111-1111-111111111111'::uuid));

  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims',
    '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);

  -- patient UPDATE passes column grants but matches no UPDATE policy -> 0 rows
  update public.risk_events set status = 'resolved'
   where patient_id = '11111111-1111-1111-1111-111111111111'::uuid;
  perform _test.t_eq('9.8 patient status update changes nothing', 'acknowledged',
    (select status from public.risk_events
      where patient_id = '11111111-1111-1111-1111-111111111111'::uuid));
end $test$;

-- ============================================================================
-- TEST 10 — audit_log: spoof fails, update/delete fail, own rows visible
-- ============================================================================
do $test$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims',
    '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);

  perform _test.t_expect_fail('10.1 spoofed actor_id insert fails',
    $$insert into public.audit_log (actor_id, action, target_patient_id)
       values ('22222222-2222-2222-2222-222222222222'::uuid, 'spoof', '11111111-1111-1111-1111-111111111111'::uuid)$$);

  insert into public.audit_log (actor_id, action, target_patient_id)
  values ('11111111-1111-1111-1111-111111111111'::uuid, 'self_test', '11111111-1111-1111-1111-111111111111'::uuid);
  perform _test.t_pass('10.2 CONTROL: self-audited insert succeeds');

  perform _test.t_expect_fail('10.3 audit_log update fails',
    $$update public.audit_log set action = 'tampered'
       where actor_id = '11111111-1111-1111-1111-111111111111'::uuid$$);
  perform _test.t_expect_fail('10.4 audit_log delete fails',
    $$delete from public.audit_log where actor_id = '11111111-1111-1111-1111-111111111111'::uuid$$);

  perform _test.t_eq('10.5 pA sees exactly the 2 rows targeting pA', '2',
    (select count(*)::text from public.audit_log where target_patient_id = '11111111-1111-1111-1111-111111111111'::uuid));
  perform _test.t_eq('10.6 pA sees 0 rows targeting pB', '0',
    (select count(*)::text from public.audit_log where target_patient_id = '22222222-2222-2222-2222-222222222222'::uuid));
end $test$;

-- ============================================================================
-- TEST 11 — invite_psychologist returns the SAME response in every case
-- ============================================================================
do $test$
declare
  r1 jsonb;
  r2 jsonb;
  r3 jsonb;
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims',
    '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);

  r1 := public.invite_psychologist('fixture.psych3@demo.test', 'summary_only');
  r2 := public.invite_psychologist('no-such-user@nowhere.invalid', 'summary_only');
  r3 := public.invite_psychologist('dr.unverified@demo.test', 'summary_only');

  perform _test.t_eq('11.1 verified email == non-existing email', r1::text, r2::text);
  perform _test.t_eq('11.2 verified email == unverified email',   r1::text, r3::text);
  perform _test.t_pass('11.3 generic response is: ' || r1::text);

  r2 := public.invite_psychologist('fixture.psych3@demo.test', 'summary_only');
  perform _test.t_eq('11.4 repeat invite returns identical response', r1::text, r2::text);
end $test$;

do $test$
begin
  perform _test.t_eq('11.5 verified target produced a pending link', '1',
    (select count(*)::text from public.care_links
      where patient_id = '11111111-1111-1111-1111-111111111111'::uuid
        and psychologist_id = '77777777-7777-7777-7777-777777777777'::uuid
        and status = 'pending' and consented_at is not null));
  perform _test.t_eq('11.6 unverified email created no extra link', '1',
    (select count(*)::text from public.care_links
      where patient_id = '11111111-1111-1111-1111-111111111111'::uuid
        and psychologist_id = '44444444-4444-4444-4444-444444444444'::uuid));
  perform _test.t_eq('11.7 pA has exactly 3 links (V, U, psych3)', '3',
    (select count(*)::text from public.care_links
      where patient_id = '11111111-1111-1111-1111-111111111111'::uuid));

  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims',
    '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}', true);
  perform _test.t_expect_fail('11.8 psychologists cannot call invite_psychologist',
    $$select public.invite_psychologist('dr.verified@demo.test', 'summary_only')$$);
end $test$;

-- ============================================================================
-- TEST 12 — delete_my_data removes everything for pE, nothing for others
-- ============================================================================
do $test$
declare
  r jsonb;
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims',
    '{"sub":"88888888-8888-8888-8888-888888888888","role":"authenticated"}', true);

  r := public.delete_my_data();
  perform _test.t_eq('12.1 deleted messages',        '2', r ->> 'messages');
  perform _test.t_eq('12.2 deleted conversations',   '1', r ->> 'conversations');
  perform _test.t_eq('12.3 deleted checkins',        '1', r ->> 'checkins');
  perform _test.t_eq('12.4 deleted risk_events',     '1', r ->> 'risk_events');
  perform _test.t_eq('12.5 deleted care_links',      '1', r ->> 'care_links');
  perform _test.t_eq('12.6 deleted clinician_notes', '1', r ->> 'clinician_notes');
  perform _test.t_eq('12.7 anonymised audit rows',   '2', r ->> 'audit_rows_anonymised');
end $test$;

do $test$
begin
  perform _test.t_eq('12.8 pE checkins gone', '0',
    (select count(*)::text from public.checkins where patient_id = '88888888-8888-8888-8888-888888888888'::uuid));
  perform _test.t_eq('12.9 pE messages gone', '0',
    (select count(*)::text from public.messages where patient_id = '88888888-8888-8888-8888-888888888888'::uuid));
  perform _test.t_eq('12.10 pE conversations gone', '0',
    (select count(*)::text from public.conversations where patient_id = '88888888-8888-8888-8888-888888888888'::uuid));
  perform _test.t_eq('12.11 pE risk_events gone', '0',
    (select count(*)::text from public.risk_events where patient_id = '88888888-8888-8888-8888-888888888888'::uuid));
  perform _test.t_eq('12.12 pE care_links gone', '0',
    (select count(*)::text from public.care_links where patient_id = '88888888-8888-8888-8888-888888888888'::uuid));
  perform _test.t_eq('12.13 notes about pE gone', '0',
    (select count(*)::text from public.clinician_notes where patient_id = '88888888-8888-8888-8888-888888888888'::uuid));
  perform _test.t_eq('12.14 no audit identity left for pE', '0',
    (select count(*)::text from public.audit_log
      where actor_id = '88888888-8888-8888-8888-888888888888'::uuid
         or target_patient_id = '88888888-8888-8888-8888-888888888888'::uuid));
  perform _test.t_eq('12.15 data_deleted marker row exists', '1',
    (select count(*)::text from public.audit_log where action = 'data_deleted'));

  -- nothing for anyone else
  perform _test.t_eq('12.16 CONTROL: pA checkins untouched', '1',
    (select count(*)::text from public.checkins where patient_id = '11111111-1111-1111-1111-111111111111'::uuid));
  perform _test.t_eq('12.17 CONTROL: pA messages untouched', '2',
    (select count(*)::text from public.messages where patient_id = '11111111-1111-1111-1111-111111111111'::uuid));
  perform _test.t_eq('12.18 CONTROL: pA links untouched (3)', '3',
    (select count(*)::text from public.care_links where patient_id = '11111111-1111-1111-1111-111111111111'::uuid));
  perform _test.t_eq('12.19 CONTROL: notes about pA untouched', '1',
    (select count(*)::text from public.clinician_notes where patient_id = '11111111-1111-1111-1111-111111111111'::uuid));
  perform _test.t_eq('12.20 pE profile row survives (auth.users deletion = Phase 3)', '1',
    (select count(*)::text from public.profiles where id = '88888888-8888-8888-8888-888888888888'::uuid));
end $test$;

do $test$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims',
    '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}', true);
  perform _test.t_expect_fail('12.21 psychologists cannot call delete_my_data',
    $$select public.delete_my_data()$$);
end $test$;

-- ============================================================================
-- TEST 13 — client-supplied phq9/gad7 scores are ignored (recomputed)
-- ============================================================================
do $test$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims',
    '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);

  insert into public.checkins (patient_id, mood, note, phq9_answers, gad7_answers, phq9_score, gad7_score)
  values ('11111111-1111-1111-1111-111111111111'::uuid, 4, 'score overwrite attempt',
          '{0,1,2,3,0,1,2,3,0}', '{1,1,1,1,1,1,1}', 99, 77);

  perform _test.t_eq('13.1 phq9_score recomputed from answers (client said 99)', '12',
    (select phq9_score::text from public.checkins where note = 'score overwrite attempt'));
  perform _test.t_eq('13.2 gad7_score recomputed from answers (client said 77)', '7',
    (select gad7_score::text from public.checkins where note = 'score overwrite attempt'));

  insert into public.checkins (patient_id, mood, phq9_score)
  values ('11111111-1111-1111-1111-111111111111'::uuid, 2, 50);
  perform _test.t_eq('13.3 supplied score without answers is discarded', null,
    (select phq9_score::text from public.checkins
      where patient_id = '11111111-1111-1111-1111-111111111111'::uuid and phq9_answers is null));

  perform _test.t_expect_fail('13.4 answers outside 0-3 rejected',
    $$insert into public.checkins (patient_id, mood, phq9_answers)
       values ('11111111-1111-1111-1111-111111111111'::uuid, 3, '{0,0,0,0,0,0,0,0,4}')$$);
  perform _test.t_expect_fail('13.5 mood outside 1-5 rejected',
    $$insert into public.checkins (patient_id, mood) values ('11111111-1111-1111-1111-111111111111'::uuid, 9)$$);
  perform _test.t_expect_fail('13.6 computed score cannot be updated',
    $$update public.checkins set phq9_score = 0 where note = 'score overwrite attempt'$$);
end $test$;

-- ============================================================================
do $test$
begin
  raise notice '=== ALL 13 RLS SCENARIOS PASSED ===';
end $test$;

drop schema if exists _test cascade;
