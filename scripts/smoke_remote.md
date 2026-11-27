# Remote API smoke check

`smoke_remote.sh` is a read-only post-deploy sanity check. It takes the API
base URL as its only argument:

```bash
./scripts/smoke_remote.sh https://api.example.com
```

It checks two things:

1. `GET /health` returns HTTP 2xx with `"status": "ok"`.
2. `GET /chat/conversations` (no `Authorization` header) returns HTTP 401 or
   403, proving the protected endpoint is not publicly readable.

No credentials, login flow, or secrets are used, and no data is written. The
script never contacts a service on its own — you provide the base URL. Exit
code `0` means both checks passed; `1` means a check failed; `2` means the
argument was missing or malformed.
