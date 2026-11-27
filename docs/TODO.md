# TODO / known gaps

Status after Phase 5. Items are grouped by launch impact. **Blockers must be
resolved before any real user uses the app.** Friends and consenting adult
testers may use staging only under a closed beta with professional support.

## Blocker — must fix before real users

- [ ] Clinician review of the risk rules (`api/app/services/risk_rules.py`),
      the versioned system prompt (`api/app/prompts/chat_system_v1.md`),
      check-in copy, and crisis screens. Record reviewer and date.
- [ ] Native-speaker review of the Hinglish/transliterated rules and any
      regional language rules added later. The current rule set is intentionally
      incomplete and conservative.
- [ ] Re-verify every crisis number/URL in `api/app/services/crisis_resources.py`
      and the frontend fallback list for every supported region; date the
      verification. Current `last_verified` is `2026-11-27`.
- [ ] Legal review of `/privacy` and `/terms` and identification of applicable
      data-protection law. Remove draft banners only after approval. No
      HIPAA/GDPR/DPDP compliance claim may be added without that review.
- [ ] Check LLM provider data-processing terms: retention, training use,
      subprocessors, and processing region. Update the privacy page to match.
- [ ] Add application-level encryption of message and journal text at rest,
      separate from disk-level encryption. Include key management and tests.
- [ ] Production Supabase project must be separate from staging, backups/PITR
      on, and a restore test completed into a separate project. See
      [`OPERATIONS.md`](OPERATIONS.md).
- [ ] Define and test a psychologist license-verification process. The current
      SQL verification step is manual and has no documented reviewer workflow.
- [ ] Name an incident response owner and backup contact; test the
      `CHAT_ENABLED=false` kill switch in staging.
- [ ] Run a closed beta with a small number of consenting adults, with
      professional support available.
- [ ] Resolve every blocker in [`SECURITY_REVIEW.md`](SECURITY_REVIEW.md).
- [ ] Resolve applicable-law/privacy notice gaps identified by legal review.

## Important — before broad rollout

- [ ] Replace the in-memory per-user chat rate limiter (20/min) with a shared
      store before running more than one API instance. Current limiter is
      process-local; multiple instances multiply the effective limit.
- [ ] Add metrics/alerts for LLM error categories, elevated 5xx rates,
      `/health` degradation, and a daily risk-event volume check. A silent
      review pipeline is a safety issue.
- [ ] Add a prompt-regression suite for the versioned prompt: JSON-only output,
      one-question replies, refusal of medication advice, and no invented
      crisis numbers.
- [ ] Live Groq smoke test with a server-side key: benign, sad, indirect, and
      plan-level messages must satisfy the structured JSON contract. Automated
      tests remain offline with `LLM_PROVIDER=fake`.
- [ ] Add a documented data-retention/deletion schedule for backups and audit
      logs, reviewed against applicable law.
- [ ] Add age verification beyond the current 18+ self-attestation; minors are
      not supported and real age gating is not implemented.
- [ ] Accessibility audit (keyboard paths, screen-reader labels, color
      contrast, focus order) and fix findings.
- [ ] i18n/localization plan. Current UI copy and risk rules are English plus
      limited Hinglish patterns.
- [ ] Formal backup/restore drill schedule after the first successful restore
      test.
- [ ] Decide the LICENSE for the repository. This is an open owner decision;
      no LICENSE file is committed yet.
- [ ] Confirm Vercel preview environments cannot point at production Supabase
      or API data.

## Nice to have

- [ ] Structured operator dashboard for risk-event volume and review backlog.
- [ ] More region-specific crisis resources after verification.
- [ ] Automated secret-scanning enforcement in branch protection in addition
      to CI.
- [ ] Red-team review of prompt-injection handling.
- [ ] Optional clinician-facing prompt/model traceability view; data is already
      stored on assistant messages and in structured logs.
- [ ] Additional Playwright coverage for accessibility assertions.

## Implemented in Phase 5

- [x] Honest prototype README and launch gate notice.
- [x] `DATA_MODEL.md`, `RLS.md`, `ENV.md`, `DEPLOY.md`, `OPERATIONS.md`,
      `SECURITY_REVIEW.md`, `LAUNCH_CHECKLIST.md`, and updated
      `RISK.md` / `FRONTEND.md`.
- [x] `CHAT_ENABLED=false` kill switch with no side effects and crisis
      resources.
- [x] DB-aware `/health` with generic 200/503 bodies.
- [x] Structured JSON logs with request id and latency only.
- [x] Consent timestamp/version/age metadata in `profiles` and required patient
      signup acknowledgments.
- [x] Draft `/privacy`, `/terms`, and `/safety` pages with footer/signup links.
- [x] CI, manual/nightly e2e workflow, Dependabot, pre-commit, gitleaks config,
      and remote smoke helper.
- [x] `supabase/verify_rls.sql` zero-row audit query.

## Repository history note

A full-history scan found legacy Flask cache artifacts and one SQLite database
committed in the initial upload commit (`85d2cce`) before the repository was
restructured:

- `database/mental_health.db`
- many `__pycache__/*.pyc` paths under the old prototype layout
- old `alerts/`, `database/`, `models/`, `routes/`, and `utils/` caches

They are **not present** in the current `git ls-files` and are blocked by
`.gitignore`. History was not rewritten. Recommendation: leave history intact
unless repository hygiene policy requires a coordinated rewrite; do not retain
or reuse the old database. The regex secret-history scan found placeholders and
test fixtures only (for example `service-key-secret`, blank keys, and
`LLM_API_KEY=your_groq_api_key_here`), not real credentials. Local gitleaks was
not installed; CI runs it with full history on every push/PR.

## Known non-goals

- No crisis service, medication advice, or treatment plan.
- No outbound email/SMS.
- No hand-rolled auth; Supabase Auth remains authoritative.
- No edits to `/legacy` source code.
- No synthetic composite score or invented clinical measure.
