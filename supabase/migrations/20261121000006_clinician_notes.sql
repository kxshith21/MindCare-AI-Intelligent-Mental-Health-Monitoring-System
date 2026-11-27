-- ============================================================================
-- clinician_notes (psychologist's private notes about a linked patient)
--
-- Product decision (documented in docs/RLS.md): patients can NEVER read
-- these rows — there is no policy for them. The authoring psychologist can
-- read/write only while an ACTIVE care link exists to that patient.
-- ============================================================================

create table public.clinician_notes (
  id              uuid primary key default gen_random_uuid(),
  psychologist_id uuid not null references public.profiles (id) on delete cascade,
  patient_id      uuid not null references public.profiles (id) on delete cascade,
  note            text not null check (char_length(note) between 1 and 8000),
  created_at      timestamptz not null default now(),
  check (psychologist_id <> patient_id)
);

create index clinician_notes_psychologist_idx
  on public.clinician_notes (psychologist_id, patient_id);
create index clinician_notes_patient_idx on public.clinician_notes (patient_id);
