-- ============================================================================
-- care_links (consent-based patient <-> psychologist links)
--
-- Transitions enforced by trigger:
--   pending -> active   (accept: psychologist only)
--   pending -> revoked  (decline: psychologist or patient)
--   active  -> revoked  (end: either party)
--   share_scope changes: patient only, status must be unchanged
--   revoked rows are fully immutable; ownership/timestamps never change
-- RLS restricts UPDATE to the two parties; the trigger adds the actor rules
-- (auth.uid() = null means service role / SQL, which is allowed through).
-- ============================================================================

create table public.care_links (
  id              uuid primary key default gen_random_uuid(),
  patient_id      uuid not null references public.profiles (id) on delete cascade,
  psychologist_id uuid not null references public.profiles (id) on delete cascade,
  status          text not null default 'pending'
                  check (status in ('pending', 'active', 'revoked')),
  share_scope     text not null default 'summary_only'
                  check (share_scope in ('summary_only', 'full')),
  invited_at      timestamptz not null default now(),
  consented_at    timestamptz not null default now(),
  revoked_at      timestamptz,
  -- revocation must be timestamped
  check (status <> 'revoked' or revoked_at is not null),
  -- no self-links
  check (patient_id <> psychologist_id)
);

-- At most one live (pending/active) link per pair; re-invite is allowed
-- after a link has been revoked.
create unique index care_links_active_pending_uniq
  on public.care_links (patient_id, psychologist_id)
  where status in ('pending', 'active');

create index care_links_patient_idx on public.care_links (patient_id);
create index care_links_psychologist_idx on public.care_links (psychologist_id);

create or replace function public.care_links_before_update()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
begin
  -- ownership + invite columns are immutable for everyone
  if new.id is distinct from old.id
     or new.patient_id is distinct from old.patient_id
     or new.psychologist_id is distinct from old.psychologist_id
     or new.invited_at is distinct from old.invited_at
     or new.consented_at is distinct from old.consented_at then
    raise exception 'care_links: id, parties and invite/consent columns are immutable';
  end if;

  -- revoked is terminal: the whole row freezes
  if old.status = 'revoked' then
    if new.status is distinct from old.status
       or new.share_scope is distinct from old.share_scope
       or new.revoked_at is distinct from old.revoked_at then
      raise exception 'care_links: revoked links are immutable';
    end if;
    return new;
  end if;

  if new.status is distinct from old.status then
    -- no simultaneous scope change with a status change
    if new.share_scope is distinct from old.share_scope then
      raise exception 'care_links: change share_scope separately from status';
    end if;

    if new.status = 'active' and old.status = 'pending' then
      -- accept: psychologist only (null actor = service role / SQL)
      if v_actor is not null and v_actor <> old.psychologist_id then
        raise exception 'care_links: only the psychologist may accept a pending link';
      end if;
    elsif new.status = 'revoked' and old.status in ('pending', 'active') then
      if v_actor is not null and v_actor not in (old.patient_id, old.psychologist_id) then
        raise exception 'care_links: only the two parties may revoke a link';
      end if;
      new.revoked_at := now();
    else
      raise exception 'care_links: invalid status transition % -> %', old.status, new.status;
    end if;
  else
    -- status unchanged: only share_scope may move, and only the patient may move it
    if new.share_scope is distinct from old.share_scope then
      if v_actor is not null and v_actor <> old.patient_id then
        raise exception 'care_links: only the patient may change share_scope';
      end if;
    end if;
    if new.revoked_at is distinct from old.revoked_at then
      raise exception 'care_links: revoked_at may only be set by revoking';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists care_links_before_update on public.care_links;
create trigger care_links_before_update
  before update on public.care_links
  for each row execute function public.care_links_before_update();
