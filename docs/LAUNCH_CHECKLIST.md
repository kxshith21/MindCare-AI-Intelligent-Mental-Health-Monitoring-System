# Launch checklist

**No real user may use this app until every box is ticked.** Friends and
consenting adult testers under a closed beta may use staging only, with
professional support available. Until this checklist is complete, describe
MindCare AI as a prototype.

- [ ] Clinician reviewed risk rules, system prompt, check-in copy, and crisis screens
- [ ] Crisis numbers re-verified for every supported region and dated
- [ ] Legal review of privacy policy and terms; applicable data-protection law identified
- [ ] LLM provider terms checked (retention, training use, region) and reflected in the privacy policy
- [ ] Application-level encryption of message/journal text in place
- [ ] Production Supabase project separate from staging; backups on; restore tested
- [ ] Psychologist verification process defined and tested
- [ ] Incident response owner named; `CHAT_ENABLED` kill switch tested
- [ ] Closed beta with a small number of consenting adults, with support from a professional
- [ ] Blockers in [`TODO.md`](TODO.md) and [`SECURITY_REVIEW.md`](SECURITY_REVIEW.md) all resolved

## Evidence required per item

Record date, reviewer, and evidence link for each tick. Do not record message
content or tokens.

| Item | Minimum evidence |
|---|---|
| Clinician review | Signed review note covering `risk_rules.py`, `chat_system_v1.md`, check-in screens, and crisis screens |
| Crisis numbers | Dated verification table for every region in `crisis_resources.py` and the frontend fallback list |
| Legal review | Lawyer/legal reviewer note; named applicable law; draft banners removed only after approval |
| Provider terms | Retention, training-use, subprocessor, and region notes; privacy page updated to match |
| Encryption | Design note, code review, and tests showing stored message/journal text is application-level encrypted |
| Supabase | Separate staging and production project refs; backup/PITR settings; restore-test report from a separate project |
| Psychologist verification | Documented license check steps, reviewer identity, and a test that an unverified account has no patient-data access |
| Incident/kill switch | Named primary and backup contacts; `CHAT_ENABLED=false` test result with crisis resources present |
| Closed beta | Participant consent records, support coverage plan, and feedback log |
| Blockers | Links to resolved TODO/security items and a final CI pass |

## Explicitly not satisfied yet

The current repository does not contain clinical review evidence, legal review,
provider-contract review, application-level encryption, a restore test, a
repeatable license-verification process, named incident owners, or a closed
beta. These are not implementation claims; they are launch gates.
