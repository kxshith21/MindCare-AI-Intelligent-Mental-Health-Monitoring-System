# Operational readiness

This document describes recommended operations and the controls that are
actually implemented. Monitoring and backup tools are deployment
configuration, not application features; items marked **configure** remain
operational tasks for the deployer.

## Health and structured logs

- `GET /health` checks Supabase REST connectivity with the service-role key.
  It returns `200 {"status":"ok","service":"mindcare-api"}` only when
  configured and reachable; otherwise it returns a generic `503` with
  `{"status":"degraded","service":"mindcare-api"}`. No URL, key, exception, or
  database detail is returned.
- API logs are JSON. The request middleware records `request_id`, method,
  sanitized path, status, and `latency_ms`. Domain logs record stable IDs,
  signal levels, category labels, and latency.
- Logs must never contain message content, journal text, auth tokens, API
  keys, query strings, headers, or exception bodies. Tests enforce this for
  the chat path and request logger.

**Configure:** uptime check on `/health` from at least two regions; alert when
the endpoint is degraded or unavailable.

## Recommended monitoring

| Signal | Configuration | Why |
|---|---|---|
| Uptime | Probe `<API_BASE>/health` every 1–5 minutes | Fast failure feedback without exposing internals. |
| 5xx rate | Alert on elevated 5xx over 5–10 minutes | Service or dependency failure. |
| LLM error categories | Alert on `llm.*` error category counters in logs | Provider outage or schema drift. |
| Latency | Watch `latency_ms` for chat and DB-backed endpoints | Timeouts and provider degradation. |
| Risk-event volume | Daily SQL check below | A dead review pipeline is a safety issue. |
| Auth failures | Watch Supabase Auth logs for spikes | Credential stuffing or misconfiguration. |

Daily risk-event check:

```sql
select date_trunc('day', created_at) as day, level, count(*)
  from public.risk_events
 where created_at >= now() - interval '7 days'
 group by 1, 2
 order by 1 desc, 2;
```

**Verify:** the query runs without error and the expected volume is reviewed
daily by a named owner. A silent pipeline must be investigated, not assumed
healthy.

Error tracking (**configure**): enable Sentry or equivalent on web and API,
scrub request bodies and message content, strip authorization headers and
cookies, and sample only IDs/levels/latencies for this app.

## Backups and restore

Supabase backups/PITR depend on the selected plan.

1. Confirm backups are enabled in the Supabase project settings and record the
   retention window.
2. For a restore test, create a **separate** project or use the provider's PITR
   restore-to-new-project flow. Never restore over production first.
3. Restore to a point before a known seed fixture, apply no local seed data,
   and run `supabase/verify_rls.sql`.
4. Confirm all migrations through `20261127000001` are present, RLS returns
   zero rows, a test patient/login can read only their own rows, and a linked
   psychologist sees only the active-link scope.
5. Record the restore time, the project used, and who verified it.

**Launch requirement:** a restore test must be completed before real users.
See [`LAUNCH_CHECKLIST.md`](LAUNCH_CHECKLIST.md).

## Incident process

Name an incident owner and backup contact before launch. While an incident is
open, record only IDs, levels, and timings — never message content.

### LLM outage

1. Confirm the failure category in structured logs (`timeout`,
   `invalid_json`, transport error, etc.).
2. The implemented fallback already keeps the app usable: the local rules
   engine runs, a safe canned reply is returned, and elevated/high results
   include crisis resources. No signal is lowered by a failed LLM call.
3. If failures are sustained or the provider is unsafe/unavailable, set
   `CHAT_ENABLED=false` and restart/redeploy the API. Verify the safe
   unavailable reply plus resources with an authenticated patient session.
4. Check that risk events were still written by the rules path during partial
   degradation. If not, stop chat rather than leaving an unmonitored path.
5. Restore `CHAT_ENABLED=true` only after provider health and structured-output
   validation are confirmed.

### Data breach or suspected exposure

1. Preserve logs and platform audit records; do not delete or rewrite them.
2. Revoke/rotate exposed Supabase keys, LLM keys, and platform tokens.
3. Disable chat with `CHAT_ENABLED=false` if message data may be involved.
4. Identify affected tables/rows from audit and service logs using IDs only.
5. Notify the named incident owner and legal/privacy reviewer. Applicable-law
   notification decisions are an open launch item; do not guess them.
6. Restore from a clean backup only after the exposure path is closed.
7. Write a post-incident report with timeline, impact, and fixes.

### Psychologist reports a missed risk event

1. Treat it as a safety review, not a blame exercise. Record the event ID,
   patient ID, reviewer ID, and timestamp; do not copy message text into
   tickets.
2. Confirm the care link was active and the correct scope was in effect.
3. Compare the stored event level/reason with the rule IDs and LLM category in
   logs. Escalated/high signals should have a matching `risk_events` row.
4. Check whether the event write failed in logs (`risk_event_store_failed`).
   If writes are failing, disable chat until the dependency is restored.
5. Have a clinician review the rules, prompt version, and UI copy; update the
   prompt version if behavior changes.
6. Add a labeled regression case before changing rules.

## Access and deletion verification

- `DELETE /account` uses a service-role path and requires an explicit
  `{"confirm":"DELETE"}` body. Automated tests cover the path.
- `delete_my_data()` removes messages, conversations, check-ins, care links,
  clinician notes about the patient, and risk events, then anonymizes audit
  identity columns and writes one identity-free `data_deleted` marker.
- Re-run the account-deletion test after any migration touching these tables.
