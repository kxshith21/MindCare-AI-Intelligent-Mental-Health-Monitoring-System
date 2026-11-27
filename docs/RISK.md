# Risk triage design (Phase 3)

**This is not a crisis service.** Risk output is a triage signal for a human
reviewer. It is never a diagnosis, never a prediction, never a guarantee of
safety, and never a “wellness score”.

## Signals

Two independent signals run on every `POST /chat/message`:

1. **LLM structured output** (`api/app/services/llm.py`) using the versioned
   system prompt `api/app/prompts/chat_system_v1.md`. It returns
   `reply, emotion, themes, risk_level, risk_category, confidence`.
2. **Rules engine** (`api/app/services/risk_rules.py`) ported from the legacy
   keyword analyser. It runs locally, needs no network, and is the fallback
   when the LLM times out, fails, or returns invalid JSON.

The final level is always the higher of the two:

```text
final_level = max(llm.risk_level, rules.level)
```

A failed LLM contributes **no** signal. It cannot lower a rules result. User
text is always treated as data; prompt-injection-shaped text is never allowed
to change the system prompt, schema, or risk level.

### Levels

| Level | Meaning in this app |
|---|---|
| `low` | No triage flag. No risk event is created and no crisis resources are shown. |
| `elevated` | Possible self-harm/hopelessness/acute-distress language without a plan. A risk event is created and crisis resources are shown. |
| `high` | Direct intent, plan/means/timeframe, or possible harm to others. A risk event is created, the reply leads with care, and crisis resources are shown. |

`risk_category` is a short enum label (`none`, `hopelessness`,
`self_harm_ideation`, `plan_or_means`, `harm_to_others`, `acute_distress`,
`other`). It is stored in `risk_events.reason` as a **category label only** —
never the user's message text.

## Second trigger path: PHQ-9 item 9

`POST /checkins` is an independent trigger path. PHQ-9 item 9 (index 8) is
checked server-side after the check-in is stored:

- `0` → no risk event and no crisis resources.
- `1` or `2` → `elevated` risk event, reason `self_harm_ideation`, crisis
  resources shown.
- `3` → `high` risk event, the same category label, crisis resources shown.

The event is written with the service role because clients cannot insert into
`risk_events`; the check-in itself is written with the caller's JWT so RLS
applies. If the event write fails, the response still includes the resources —
safety does not depend on the queue write. `reason` is always a category label,
never the note text or questionnaire answers.

## Fail-safe behavior

The LLM call is validated locally with Pydantic. Any timeout, HTTP error,
transport error, malformed JSON, missing keys, invalid enum, or schema
mismatch becomes a short internal category such as `timeout`, `invalid_json`,
or `invalid_output`. One retry is configured by default via
`LLM_MAX_RETRIES=1`.

On failure:

- the rules engine still runs;
- a safe canned reply is returned based on the final level;
- elevated/high replies include region-appropriate crisis resources;
- nothing sensitive is logged.

No raw model output, no user content, and no API keys appear in logs. The chat
log line includes ids, signal levels, stable matched rule ids, error category,
and latency only.

## Rules engine details

- Matching is case-insensitive and Unicode-normalized. Obfuscations such as
  `k1ll` and repeated letters (`sooo`) are handled. Bare emergency numbers
  (`988`, `112`) are left intact.
- Stable rule ids such as `direct_kill_myself`, `plan_tonight`, or
  `conversation_escalation` are recorded; raw text is not.
- Clear negation, third-person/reported speech, quotes/lyrics, idioms, and
  past-with-recovery context can suppress a match. Ambiguity is kept.
- A risk signal plus a timeframe/plan signal escalates to `high`; two plan
  signals alone also escalate to `high`. Repeated flagged messages in the
  recent conversation window can escalate by one level.
- Hinglish/transliterated phrases are an incomplete first pass. They require
  native-speaker and clinical review before launch (see `docs/TODO.md`).

### Labeled evaluation

`api/tests/data/risk_cases.yaml` contains **83** labeled cases, of which **53**
are `must_flag`. `pytest -s` prints the summary. Current baseline:

```text
total_cases=83
must_flag_cases=53
benign_cases=30
false_negatives=0
false_positives=0
false_positive_rate=0.000
```

Zero false negatives on `must_flag` cases is a hard test requirement. The
false-positive rate threshold in CI is 10%.

## Crisis resources

`api/app/services/crisis_resources.py` maps ISO alpha-2 regions to a small,
hard-coded list. Unknown/missing regions always receive the non-empty
`DEFAULT` list (`findahelpline.com` plus local emergency services). India
includes Tele-MANAS `14416` and emergency `112`.

Every resource carries `last_verified`. These numbers and URLs can change and
must be re-verified before launch. The API never invents a number in the LLM
reply itself; the prompt explicitly forbids it.

## Persistence and visibility

- The user's message is stored with the caller's JWT (RLS-scoped).
- The assistant message is stored with the service role and records
  `prompt_version` and `model` for traceability.
- A risk event is stored with the service role only when `final_level != low`.
- Psychologists see risk events only through an active care link. Message text
  is included **only** for `share_scope = 'full'`; `summary_only` events return
  `content: null`.
- Every psychologist data read appends an `audit_log` row via
  `record_patient_access()`.

## Deliberately absent

- No outbound email/SMS — no `email_alert.py` equivalent.
- No diagnosis, medication advice, or treatment plan.
- No “detects suicide” claim, no certainty language, and no promise that the
  AI can keep someone safe.
- No synthetic mood chart or invented wellness score.

## Configuration

See `api/.env.example`. Exact variables used by Phase 3:

```text
LLM_PROVIDER=openai
LLM_API_KEY=your_groq_api_key_here
LLM_MODEL=openai/gpt-oss-20b
LLM_BASE_URL=https://api.groq.com/openai/v1
LLM_TIMEOUT_SECONDS=15
LLM_MAX_RETRIES=1
CHAT_PROMPT_VERSION=chat_system_v1
```

`openai` here means any OpenAI-compatible `/chat/completions` endpoint; with
the shipped base URL the key is a **Groq** key. `LLM_PROVIDER=fake` forces the
no-network client used by tests. Keys are server-side only and must never be
committed or sent to `/web`.
