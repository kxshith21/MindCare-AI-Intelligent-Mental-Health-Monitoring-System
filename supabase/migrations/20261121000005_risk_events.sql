-- ============================================================================
-- risk_events (created by the API with the service role only)
--
-- Clients can never INSERT or DELETE risk_events (no policies).
-- Patients can SELECT their own rows; verified psychologists with an ACTIVE
-- link can SELECT and UPDATE status/reviewed_by/reviewed_at only (column
-- grants in migration 0009). The trigger pins reviewed_by to the actor.
-- ============================================================================

create table public.risk_events (
  id          uuid primary key default gen_random_uuid(),
  patient_id  uuid not null references public.profiles (id) on delete cascade,
  message_id  uuid references public.messages (id) on delete set null,
  level       text not null check (level in ('low', 'elevated', 'high')),
  reason      text not null check (char_length(reason) between 1 and 2000),
  status      text not null default 'new'
              check (status in ('new', 'acknowledged', 'resolved')),
  reviewed_by uuid references public.profiles (id) on delete set null,
  reviewed_at timestamptz,
  created_at  timestamptz not null default now(),
  -- a reviewed event carries its reviewer; a new one must not
  check (status <> 'new' or (reviewed_by is null and reviewed_at is null)),
  check (status = 'new' or (reviewed_by is not null and reviewed_at is not null))
);

create index risk_events_patient_idx on public.risk_events (patient_id, created_at desc);
create index risk_events_message_idx on public.risk_events (message_id);
create index risk_events_reviewed_by_idx on public.risk_events (reviewed_by);

create or replace function public.risk_events_before_write()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
begin
  if new.status = 'new' then
    new.reviewed_by := null;
    new.reviewed_at := null;
  else
    -- an authenticated reviewer can only review on their own behalf
    if v_actor is not null then
      new.reviewed_by := v_actor;
    end if;
    new.reviewed_at := coalesce(new.reviewed_at, now());
  end if;
  return new;
end;
$$;

drop trigger if exists risk_events_before_write on public.risk_events;
create trigger risk_events_before_write
  before insert or update on public.risk_events
  for each row execute function public.risk_events_before_write();
