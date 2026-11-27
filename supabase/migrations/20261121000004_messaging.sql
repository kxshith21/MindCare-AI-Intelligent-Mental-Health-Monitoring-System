-- ============================================================================
-- conversations + messages
--
-- messages.patient_id is denormalised (and trigger-enforced to match the
-- conversation owner) so RLS predicates stay a single indexed column.
-- Patients read/write their own rows; psychologists can only SELECT messages
-- through an ACTIVE link with share_scope = 'full'.
-- Patients may INSERT only sender = 'user' rows (assistant rows are written
-- by the API with the service role — otherwise clients could fake replies).
-- ============================================================================

create table public.conversations (
  id         uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now()
);

create index conversations_patient_idx on public.conversations (patient_id);

create table public.messages (
  id              uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  patient_id      uuid not null references public.profiles (id) on delete cascade,
  sender          text not null check (sender in ('user', 'assistant')),
  content         text not null check (char_length(content) between 1 and 8000),
  created_at      timestamptz not null default now()
);

create index messages_patient_idx on public.messages (patient_id, created_at);
create index messages_conversation_idx on public.messages (conversation_id, created_at);

create or replace function public.messages_check_conversation()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_owner uuid;
begin
  select patient_id into v_owner
  from public.conversations
  where id = new.conversation_id;

  if v_owner is null then
    raise exception 'messages: conversation not found';
  end if;
  if v_owner <> new.patient_id then
    raise exception 'messages: patient_id must match the conversation owner';
  end if;
  return new;
end;
$$;

drop trigger if exists messages_check_conversation on public.messages;
create trigger messages_check_conversation
  before insert on public.messages
  for each row execute function public.messages_check_conversation();
