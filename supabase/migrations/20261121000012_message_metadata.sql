-- ============================================================================
-- Phase 3: store which system prompt and model produced an assistant message.
--
-- Analyst rows are written by the API with the service role. The CHECK keeps
-- user messages free of this metadata while requiring both fields on every
-- assistant message, so a reply can always be traced back to its prompt/model.
-- ============================================================================

alter table public.messages
  add column prompt_version text,
  add column model text;

alter table public.messages
  add constraint messages_assistant_metadata_check
  check (
    sender <> 'assistant'
    or (prompt_version is not null and model is not null)
  );

comment on column public.messages.prompt_version is
  'Versioned system prompt used for an assistant reply; assistant rows only.';
comment on column public.messages.model is
  'LLM model that produced an assistant reply; assistant rows only.';
