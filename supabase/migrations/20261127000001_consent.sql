-- ============================================================================
-- Phase 5: consent metadata on profiles
--
-- Client signups may carry consent acknowledgements in user_metadata. They are
-- stamped once at profile creation and are never required for account creation:
-- seed users and server-created psychologist accounts stay valid with NULL
-- consent columns (no NOT NULL / CHECK enforcement here).
-- ============================================================================

alter table public.profiles
  add column consent_at timestamptz,
  add column consent_version text,
  add column age_confirmed_at timestamptz;

comment on column public.profiles.consent_at is
  'When all three consent acknowledgements were accepted at signup; never required.';
comment on column public.profiles.consent_version is
  'Consent document version recorded at signup; defaults to draft when blank.';
comment on column public.profiles.age_confirmed_at is
  'When age_18_plus was acknowledged at signup; independent of consent.';

-- Consent columns are immutable after INSERT (defence in depth on top of
-- column grants; clients still only have UPDATE (display_name, region)).
-- Role/region/id/created_at behaviour is unchanged from 20261121000011.
create or replace function public.profiles_before_update()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
begin
  if new.id is distinct from old.id
     or new.created_at is distinct from old.created_at then
    raise exception 'profiles: id and created_at are immutable';
  end if;

  -- Consent is recorded once by handle_new_user(); no actor may rewrite it.
  if new.consent_at is distinct from old.consent_at
     or new.consent_version is distinct from old.consent_version
     or new.age_confirmed_at is distinct from old.age_confirmed_at then
    raise exception 'profiles: consent_at, consent_version and age_confirmed_at are immutable';
  end if;

  -- Role is immutable for clients. A NULL actor means service role / trusted
  -- server-side SQL (including the auth.users reconciliation trigger).
  if new.role is distinct from old.role and v_actor is not null then
    raise exception 'profiles: role is immutable for clients';
  end if;

  -- normalise region to a bare ISO-3166-1 alpha-2 code
  new.region := nullif(upper(new.region), '');
  return new;
end;
$$;

-- Signup trigger: role/region logic is unchanged from 20261121000001; the only
-- additions are the three optional metadata-derived profile values below.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role   text := coalesce(new.raw_app_meta_data ->> 'role', 'patient');
  v_name   text := left(coalesce(nullif(trim(new.raw_user_meta_data ->> 'display_name'), ''), 'Unnamed'), 120);
  v_region text := nullif(upper(coalesce(new.raw_user_meta_data ->> 'region', '')), '');
  v_consent_at timestamptz;
  v_consent_version text;
  v_age_confirmed_at timestamptz;
begin
  if v_role not in ('patient', 'psychologist') then
    v_role := 'patient';
  end if;
  -- an unrecognised region value must never break signup
  if v_region is not null and v_region !~ '^[A-Z]{2}$' then
    v_region := null;
  end if;

  -- All three acknowledgements must be present and true. 'true' is read from
  -- JSON booleans (and text values); missing/false/null simply leave the
  -- columns NULL so no signup path is blocked by consent.
  if lower(coalesce(new.raw_user_meta_data ->> 'terms_accepted', '')) = 'true'
     and lower(coalesce(new.raw_user_meta_data ->> 'privacy_accepted', '')) = 'true'
     and lower(coalesce(new.raw_user_meta_data ->> 'crisis_notice_acknowledged', '')) = 'true' then
    v_consent_at := now();
    v_consent_version := coalesce(
      nullif(trim(coalesce(new.raw_user_meta_data ->> 'consent_document_version', '')), ''),
      'draft-2026-11-27'
    );
  end if;

  if lower(coalesce(new.raw_user_meta_data ->> 'age_18_plus', '')) = 'true' then
    v_age_confirmed_at := now();
  end if;

  -- Stamp the resolved role into app_metadata so sessions minted from this
  -- user carry it. Server-side write only — clients have no privileges on
  -- auth.users (asserted by RLS test 3.2), so they cannot influence this.
  if new.raw_app_meta_data ->> 'role' is distinct from v_role then
    update auth.users
       set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb)
                             || jsonb_build_object('role', v_role)
     where id = new.id;
  end if;

  insert into public.profiles (id, role, display_name, region, consent_at, consent_version, age_confirmed_at)
  values (new.id, v_role, v_name, v_region, v_consent_at, v_consent_version, v_age_confirmed_at);

  if v_role = 'psychologist' then
    insert into public.psychologist_profiles (user_id, license_no)
    values (
      new.id,
      coalesce(nullif(new.raw_user_meta_data ->> 'license_no', ''), 'not-provided')
    );
  end if;

  return new;
end;
$$;
