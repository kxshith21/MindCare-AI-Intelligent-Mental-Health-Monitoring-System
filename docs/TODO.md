# TODO / handoff notes

## Phase 4 — connect the frontend ✅

- [x] Build patient chat UI against `POST /chat/message`,
      `GET /chat/conversations`, and `GET /chat/conversations/{id}/messages`.
      Render `show_crisis_resources` prominently; never hide it behind a
      details toggle.
- [x] Build check-in UI against `POST /checkins` and `GET /checkins?from&to`,
      including the PHQ-9 item-9 support path.
- [x] Build psychologist queue against `GET /psychologist/patients`,
      `GET /psychologist/patients/{id}/trends`, `GET /psychologist/risk-events`,
      `PATCH /psychologist/risk-events/{id}`, and clinician notes.
- [x] Show `risk_level` as a triage label with a “not a diagnosis” note.
      Do not display rule ids or raw model internals to patients.
- [x] Add an explicit, confirmed account-deletion flow using
      `DELETE /account` with `{ "confirm": "DELETE" }`.
- [x] Keep charts limited to check-in mood and PHQ-9/GAD-7 scores. Do not add a
      synthetic “wellness score”.
- [x] Document the BFF proxy, zod contracts, cookie auth, and safety rules in
      [`FRONTEND.md`](FRONTEND.md).

## Phase 5 — deploy readiness

- [ ] Create the missing deploy/migration notes (there is no `MIGRATION.md`
      yet). Document how to apply migrations 0001–0012 to a remote project.
- [ ] Set all API env vars from `api/.env.example` in the hosting platform.
      Use the Groq key only server-side. Never add it to `web/.env*`.
- [ ] Set production `CORS_ORIGINS` to the deployed web origin.
- [ ] Run `pytest`, web lint/build, `supabase db reset`, and the RLS suite in
      the release checklist.
- [ ] Verify local Supabase is not pointing at a remote project during tests.

## Risk and LLM follow-ups

- [ ] **Live Groq smoke test** once the key is in `api/.env` server-side: run
      benign, sad, indirect, and plan-level messages and confirm the structured
      JSON contract. Automated tests stay fully offline (`LLM_PROVIDER=fake`).
- [ ] Re-verify every crisis number/URL in `crisis_resources.py` before launch
      and add any missing regions. `last_verified` is currently `2026-11-27`.
- [ ] Have a native Hindi speaker and a clinician review the Hinglish rules.
      They are intentionally incomplete and conservative.
- [ ] Add a prompt-regression set for the versioned system prompt (refusal of
      diagnosis/medication advice, one-question limit, JSON-only output).
- [ ] Replace the in-memory chat rate limiter (`20/min` per user) with a shared
      store before running more than one API instance.
- [ ] Add metrics/alerting for `llm.*` error categories and risk-event volume.
      Log categories and latency only — never message content.
- [ ] Consider an explicit consent note in the UI explaining that elevated/high
      messages create a reviewable flag for a linked psychologist.

## Known non-goals

- No crisis service, diagnosis, medication advice, or auto-email/SMS.
- No hand-rolled auth; Supabase Auth remains authoritative.
- No edits to `/legacy` source code.
