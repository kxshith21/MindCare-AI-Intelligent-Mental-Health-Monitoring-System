# Environment variables

There are no committed secrets. Only `.env.example` files are tracked. Never add
a real key to the repository, a client bundle, a log line, or a `NEXT_PUBLIC_*`
variable.

## API (`/api/.env`)

Read by `pydantic-settings` in `api/app/core/config.py`.

| Variable | Secret? | Local source | Deploy source | Required? | What breaks if missing |
|---|---|---|---|---|---|
| `ENVIRONMENT` | No | `.env.example` | Railway/Render variable | No; defaults to `development` | Only environment labeling. |
| `SUPABASE_URL` | No (public project URL) | `supabase start` output (`http://127.0.0.1:54321`) | Supabase project settings → API URL; set on Railway/Render | Yes | JWT verification, JWKS discovery, health DB check, and all server-side Supabase calls fail. |
| `SUPABASE_JWKS_URL` | No | blank; derived from `SUPABASE_URL` | Optional override; set only if the project exposes a different JWKS path | No | Defaults to `{SUPABASE_URL}/auth/v1/.well-known/jwks.json`. A wrong value blocks all authenticated API calls. |
| `SUPABASE_SERVICE_ROLE_KEY` | **Secret** | `supabase start` output | Supabase project settings → API → `service_role`; set only on Railway/Render | Yes for signup, assistant writes, risk events, account deletion, and DB health check | Those server tasks return 5xx; `/health` reports degraded; the key must never go to `/web`. |
| `CORS_ORIGINS` | No | `http://localhost:3000` | Exact Vercel production/preview origin(s), comma-separated | Yes in deployment | Browser calls from the web origin are blocked; never use `*`. |
| `LLM_PROVIDER` | No | `fake` for offline tests; `openai` for OpenAI-compatible | Railway/Render variable | Yes; defaults to `openai` | With no key, chat falls back to the local rules engine and safe canned replies. Set explicitly to avoid surprises. |
| `LLM_API_KEY` | **Secret** | blank with `LLM_PROVIDER=fake`; Groq key for live work | Provider dashboard key; set only on Railway/Render | Yes for live chat | Live structured output is unavailable; rules-engine fallback still returns safe replies and resources. |
| `LLM_MODEL` | No | `openai/gpt-oss-20b` | Railway/Render variable | No; has default | Wrong model name makes live chat fail into the safe fallback path. |
| `LLM_BASE_URL` | No | `https://api.groq.com/openai/v1` | Railway/Render variable | No; has default | Wrong base URL makes live chat fail into the safe fallback path. |
| `LLM_TIMEOUT_SECONDS` | No | `15` | Railway/Render variable | No; has default | Too high increases latency; too low increases fallback frequency. |
| `LLM_MAX_RETRIES` | No | `1` | Railway/Render variable | No; has default | `0` removes retries; higher values increase latency. Browser-level retries are never used. |
| `CHAT_PROMPT_VERSION` | No | `chat_system_v1` | Railway/Render variable | No; has default | Wrong version name changes prompt traceability and can fail prompt loading. |
| `CHAT_ENABLED` | No | `true` | Railway/Render variable; set `false` for the kill switch | No; defaults to `true` | `false` makes `/chat/message` return a safe unavailable message plus crisis resources, with no storage or LLM call. |

The API verifies Supabase access tokens against JWKS using `RS256` and `ES256`.
It does not need the Supabase JWT secret at runtime. The JWT secret is only
useful when manually minting/inspecting local tokens; keep it out of both apps.

## Web (`/web/.env.local`)

| Variable | Secret? | Local source | Deploy source | Required? | What breaks if missing |
|---|---|---|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | No (public) | `supabase start` output | Vercel variable; separate for preview and production | Yes | Browser Supabase client and cookie session refresh fail; all app routes redirect or error. |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | No (public anon key) | `supabase start` output | Vercel variable; separate for preview and production | Yes | Supabase Auth and user-JWT reads/writes fail. RLS still protects data. |
| `API_URL` | **Server-only** | `http://localhost:8000` | Vercel variable (server-only) | Yes | The BFF route handler cannot reach FastAPI; all `/api/*` calls fail. |
| `NEXT_PUBLIC_API_URL` | No; local fallback only | leave unset | Do not set in production | No | Only used as a local-development fallback by the BFF. The browser never calls FastAPI directly. |

The service-role key, LLM key, Supabase JWT secret, and database password must
never be present in `web/`, including under a `NEXT_PUBLIC_` prefix.

Vercel preview environments must use a staging Supabase project and a staging
API. They must not point at production data.

## Supabase project settings

| Item | Where to find it | Used by |
|---|---|---|
| Project URL | Project settings → API | API `SUPABASE_URL`, web `NEXT_PUBLIC_SUPABASE_URL` |
| Anon key | Project settings → API | web `NEXT_PUBLIC_SUPABASE_ANON_KEY` |
| Service role key | Project settings → API → `service_role` | API `SUPABASE_SERVICE_ROLE_KEY` only |
| JWT secret | Project settings → API → JWT settings | Local/manual token work only; not used by the running API |
| Database password | Chosen at project creation | CLI link/DB access; never in app env |
| Auth site URL and redirect URLs | Authentication → URL Configuration | Browser sign-in and email-confirmation redirects |

Locally, `supabase start` prints the API URL, anon key, service-role key, and
JWT secret. `supabase/.temp/` is gitignored.

## CI and e2e

CI uses non-secret placeholder URLs and the fake LLM provider. Playwright uses
local Supabase values exported at runtime by `.github/workflows/e2e.yml`. No
remote project credentials are stored in workflows.

## Verification

- `api/.env.example` and `web/.env.example` are the only tracked env files.
- `git ls-files` contains no real `.env` files.
- Grep of `web/` build output for `service_role` / `SUPABASE_SERVICE_ROLE_KEY`
  must find no value from `api/.env`. See
  [`SECURITY_REVIEW.md`](SECURITY_REVIEW.md).
