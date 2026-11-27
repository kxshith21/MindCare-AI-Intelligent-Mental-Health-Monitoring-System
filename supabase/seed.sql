-- ============================================================================
-- DEMO ONLY — LOCAL DEV SEED DATA (applied by `supabase db reset`)
--
-- This file is NEVER referenced by any migration or production path.
-- All accounts below are fake and live only in the local Supabase instance.
-- Password for every demo account: demo-password-123
--
--   patient.one@demo.test     patient   (active summary_only link w/ Dr Verified)
--   patient.two@demo.test     patient   (pending link w/ Dr Verified)
--   dr.verified@demo.test     psychologist, verified   (license LIC-DEMO-001)
--   dr.unverified@demo.test   psychologist, NOT verified (license LIC-DEMO-002)
-- ============================================================================

create extension if not exists pgcrypto with schema extensions;

-- --- demo auth users (the handle_new_user trigger creates profiles +
--     psychologist_profiles rows from app_metadata) --------------------------
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, confirmation_sent_at, recovery_token, recovery_sent_at,
  email_change_token_new, email_change, email_change_sent_at,
  email_change_token_current, email_change_confirm_status,
  banned_until, reauthentication_token, reauthentication_sent_at,
  is_sso_user, deleted_at
) values
  ('00000000-0000-0000-0000-000000000000', '11111111-1111-1111-1111-111111111111',
   'authenticated', 'authenticated', 'patient.one@demo.test',
   extensions.crypt('demo-password-123', extensions.gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"]}',
   '{"display_name":"Demo Patient One","region":"US"}', now(), now(),
   '', null, '', null, '', '', null, '', 0, null, '', null, false, null),

  ('00000000-0000-0000-0000-000000000000', '22222222-2222-2222-2222-222222222222',
   'authenticated', 'authenticated', 'patient.two@demo.test',
   extensions.crypt('demo-password-123', extensions.gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"]}',
   '{"display_name":"Demo Patient Two","region":"GB"}', now(), now(),
   '', null, '', null, '', '', null, '', 0, null, '', null, false, null),

  ('00000000-0000-0000-0000-000000000000', '33333333-3333-3333-3333-333333333333',
   'authenticated', 'authenticated', 'dr.verified@demo.test',
   extensions.crypt('demo-password-123', extensions.gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"],"role":"psychologist"}',
   '{"display_name":"Dr Verified","license_no":"LIC-DEMO-001"}', now(), now(),
   '', null, '', null, '', '', null, '', 0, null, '', null, false, null),

  ('00000000-0000-0000-0000-000000000000', '44444444-4444-4444-4444-444444444444',
   'authenticated', 'authenticated', 'dr.unverified@demo.test',
   extensions.crypt('demo-password-123', extensions.gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"],"role":"psychologist"}',
   '{"display_name":"Dr Unverified","license_no":"LIC-DEMO-002"}', now(), now(),
   '', null, '', null, '', '', null, '', 0, null, '', null, false, null);

-- password identities so email/password sign-in works through GoTrue
insert into auth.identities (
  id, user_id, provider, provider_id, identity_data, last_sign_in_at,
  created_at, updated_at
)
select
  gen_random_uuid(), u.id, 'email', u.email,
  jsonb_build_object('sub', u.id::text, 'email', u.email,
                     'email_verified', true, 'phone_verified', false),
  now(), now(), now()
from auth.users u
where u.email in ('patient.one@demo.test', 'patient.two@demo.test',
                  'dr.verified@demo.test', 'dr.unverified@demo.test');

-- --- manual verification step (the same SQL documented in docs/RLS.md) ------
update public.psychologist_profiles
   set verified = true, verified_at = now()
 where user_id = '33333333-3333-3333-3333-333333333333';

-- --- demo care links -------------------------------------------------------
-- active + summary_only : Demo Patient One <-> Dr Verified
-- pending               : Demo Patient Two <-> Dr Verified
insert into public.care_links (patient_id, psychologist_id, status, share_scope, invited_at, consented_at)
values
  ('11111111-1111-1111-1111-111111111111', '33333333-3333-3333-3333-333333333333',
   'active', 'summary_only', now(), now()),
  ('22222222-2222-2222-2222-222222222222', '33333333-3333-3333-3333-333333333333',
   'pending', 'summary_only', now(), now());
