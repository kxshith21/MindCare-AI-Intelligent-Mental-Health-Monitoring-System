-- ============================================================================
-- Fix-forward: reconcile profiles.role when GoTrue patches app_metadata.
--
-- Supabase's Admin API (POST /auth/v1/admin/users) inserts auth.users first
-- and applies `app_metadata` in a later UPDATE. The AFTER INSERT trigger in
-- 0001 therefore sees no role and creates a 'patient' profile. This migration
-- adds an AFTER UPDATE OF raw_app_meta_data trigger that reconciles the role
-- and creates the UNVERIFIED psychologist_profiles row when needed.
--
-- Only server-side actors can write auth.users, so allowing a role change
-- here is safe. Client role changes remain blocked by column grants and by
-- profiles_before_update (which now permits role changes only when
-- auth.uid() is NULL).
-- ============================================================================

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

  -- Role is immutable for clients. A NULL actor means service role / trusted
  -- server-side SQL (including the auth.users reconciliation trigger).
  if new.role is distinct from old.role and v_actor is not null then
    raise exception 'profiles: role is immutable for clients';
  end if;

  new.region := nullif(upper(new.region), '');
  return new;
end;
$$;

create or replace function public.handle_user_role_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role text := coalesce(new.raw_app_meta_data ->> 'role', 'patient');
begin
  if v_role not in ('patient', 'psychologist') then
    v_role := 'patient';
  end if;

  update public.profiles
     set role = v_role
   where id = new.id
     and role is distinct from v_role;

  if v_role = 'psychologist' then
    insert into public.psychologist_profiles (user_id, license_no)
    values (
      new.id,
      coalesce(nullif(new.raw_user_meta_data ->> 'license_no', ''), 'not-provided')
    )
    on conflict (user_id) do nothing;
  end if;

  return new;
end;
$$;

revoke all on function public.handle_user_role_update() from public, anon;

drop trigger if exists on_auth_user_role_update on auth.users;
create trigger on_auth_user_role_update
  after update of raw_app_meta_data on auth.users
  for each row execute function public.handle_user_role_update();
