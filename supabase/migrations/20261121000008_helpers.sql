-- ============================================================================
-- Helper functions (SECURITY DEFINER, STABLE, search_path = '')
--
-- These are the only place cross-table privilege logic lives; policies call
-- them. SECURITY DEFINER avoids recursive RLS evaluation (e.g. a policy on
-- care_links must never call a function that queries care_links as the
-- caller). EXECUTE is revoked from PUBLIC and anon; granted to
-- authenticated (+ service_role for API-side calls).
-- ============================================================================

-- Is the calling user a psychologist whose profile has been verified?
create or replace function public.is_verified_psychologist()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.psychologist_profiles pp
    join public.profiles p on p.id = pp.user_id
    where pp.user_id = (select auth.uid())
      and pp.verified
      and p.role = 'psychologist'
  );
$$;

-- Does the calling (verified) psychologist have an ACTIVE link to p_patient?
create or replace function public.has_active_link(p_patient uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.is_verified_psychologist() and exists (
    select 1
    from public.care_links cl
    where cl.patient_id = p_patient
      and cl.psychologist_id = (select auth.uid())
      and cl.status = 'active'
  );
$$;

-- share_scope of the caller's ACTIVE link to p_patient, else NULL.
-- NULL means "no access at all" for every caller without a verified+
-- active link, so `link_scope(x) = 'full'` is safe as a policy predicate.
create or replace function public.link_scope(p_patient uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select cl.share_scope
  from public.care_links cl
  where cl.patient_id = p_patient
    and cl.psychologist_id = (select auth.uid())
    and cl.status = 'active'
    and public.is_verified_psychologist()
  limit 1;
$$;

revoke execute on function public.is_verified_psychologist() from public, anon;
revoke execute on function public.has_active_link(uuid) from public, anon;
revoke execute on function public.link_scope(uuid) from public, anon;
grant execute on function public.is_verified_psychologist() to authenticated, service_role;
grant execute on function public.has_active_link(uuid) to authenticated, service_role;
grant execute on function public.link_scope(uuid) to authenticated, service_role;
