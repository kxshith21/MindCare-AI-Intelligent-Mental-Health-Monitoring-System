-- ============================================================================
-- profiles + psychologist_profiles + signup trigger
--
-- Role source: auth.users.raw_app_meta_data (server-controlled; clients can
-- only write user_metadata). Client-side signups therefore become 'patient'.
-- The psychologist role is created server-side only (API, Phase 2 §5).
-- ============================================================================

create table public.profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  role         text not null check (role in ('patient', 'psychologist')),
  display_name text not null default 'Unnamed'
               check (char_length(display_name) between 1 and 120),
  region       text check (region is null or region ~ '^[A-Z]{2}$'),
  created_at   timestamptz not null default now()
);

create table public.psychologist_profiles (
  user_id     uuid primary key references public.profiles (id) on delete cascade,
  license_no  text not null check (char_length(license_no) between 1 and 64),
  verified    boolean not null default false,
  verified_at timestamptz
);

-- profiles: id / role / created_at are immutable for everyone (defense in
-- depth on top of column-level grants; verification of psychologist_profiles
-- is never client-writable — there is no UPDATE policy at all).
create or replace function public.profiles_before_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.id is distinct from old.id
     or new.role is distinct from old.role
     or new.created_at is distinct from old.created_at then
    raise exception 'profiles: id, role and created_at are immutable';
  end if;
  -- normalise region to a bare ISO-3166-1 alpha-2 code
  new.region := nullif(upper(new.region), '');
  return new;
end;
$$;

drop trigger if exists profiles_before_update on public.profiles;
create trigger profiles_before_update
  before update on public.profiles
  for each row execute function public.profiles_before_update();

-- Every new auth user gets a profiles row. Role comes from app_metadata with
-- a hard fallback to 'patient'; any value other than patient|psychologist is
-- coerced to patient. Psychologists additionally get an UNVERIFIED
-- psychologist_profiles row (verified stays false until SQL/service-role
-- verification — see docs/RLS.md).
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
begin
  if v_role not in ('patient', 'psychologist') then
    v_role := 'patient';
  end if;
  -- an unrecognised region value must never break signup
  if v_region is not null and v_region !~ '^[A-Z]{2}$' then
    v_region := null;
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

  insert into public.profiles (id, role, display_name, region)
  values (new.id, v_role, v_name, v_region);

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

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
