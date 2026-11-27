-- ============================================================================
-- checkins (mood + optional PHQ-9 / GAD-7)
--
-- phq9_score / gad7_score are ALWAYS recomputed by a trigger from the raw
-- answers — a client-supplied score is overwritten (spec §2, test 13).
-- Patients may insert/select/delete their own rows; there is no UPDATE
-- policy at all (computed scores are never edited). Psychologists have no
-- direct access — they use shared_checkins() (migration 0010).
-- ============================================================================

create table public.checkins (
  id            uuid primary key default gen_random_uuid(),
  patient_id    uuid not null references public.profiles (id) on delete cascade,
  mood          smallint not null check (mood between 1 and 5),
  note          text check (note is null or char_length(note) <= 4000),
  phq9_answers  int[],
  gad7_answers  int[],
  phq9_score    smallint,   -- computed, never trusted from the client
  gad7_score    smallint,   -- computed, never trusted from the client
  created_at    timestamptz not null default now(),
  check (phq9_answers is null or coalesce(array_length(phq9_answers, 1), 0) = 9),
  check (gad7_answers is null or coalesce(array_length(gad7_answers, 1), 0) = 7)
);

create index checkins_patient_idx on public.checkins (patient_id, created_at desc);

create or replace function public.checkins_compute_scores()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v int;
begin
  if new.phq9_answers is not null then
    foreach v in array new.phq9_answers loop
      if v is null or v < 0 or v > 3 then
        raise exception 'checkins: phq9_answers values must be 0-3';
      end if;
    end loop;
    new.phq9_score := (select sum(x)::smallint from unnest(new.phq9_answers) as x);
  else
    new.phq9_score := null;
  end if;

  if new.gad7_answers is not null then
    foreach v in array new.gad7_answers loop
      if v is null or v < 0 or v > 3 then
        raise exception 'checkins: gad7_answers values must be 0-3';
      end if;
    end loop;
    new.gad7_score := (select sum(x)::smallint from unnest(new.gad7_answers) as x);
  else
    new.gad7_score := null;
  end if;

  return new;
end;
$$;

drop trigger if exists checkins_compute_scores on public.checkins;
create trigger checkins_compute_scores
  before insert or update on public.checkins
  for each row execute function public.checkins_compute_scores();
