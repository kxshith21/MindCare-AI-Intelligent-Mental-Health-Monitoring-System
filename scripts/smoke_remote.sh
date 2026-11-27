#!/usr/bin/env bash
# Deployment smoke check for the MindCare API.
# Checks only: /health is healthy and /chat/conversations rejects anonymous
# access. No tokens, login flow, secrets, or write operations are involved.
#
# Usage:
#   ./scripts/smoke_remote.sh https://api.example.com
set -euo pipefail

if [ "$#" -ne 1 ]; then
  echo "Usage: $0 <base-url>" >&2
  exit 2
fi

base="$1"
while [[ "$base" == */ ]]; do
  base="${base%/}"
done

if [[ ! "$base" =~ ^https?:// ]]; then
  echo "ERROR: base URL must start with http:// or https://" >&2
  exit 2
fi

body_file="$(mktemp)"
trap 'rm -f "$body_file"' EXIT

echo "Checking health: GET $base/health"
if ! curl -fsS --max-time 15 "$base/health" > "$body_file"; then
  echo "FAIL: /health is unreachable or returned an error status" >&2
  exit 1
fi
if ! grep -Eq '"status"[[:space:]]*:[[:space:]]*"ok"' "$body_file"; then
  echo "FAIL: /health did not report status=ok" >&2
  cat "$body_file" >&2
  exit 1
fi
echo "PASS: /health reports status=ok"

echo "Checking auth guard: GET $base/chat/conversations"
status="$(curl -sS -o /dev/null -w '%{http_code}' --max-time 15 "$base/chat/conversations")" || {
  echo "FAIL: protected endpoint request failed" >&2
  exit 1
}
case "$status" in
  401|403)
    echo "PASS: /chat/conversations rejected unauthenticated access (HTTP $status)"
    ;;
  *)
    echo "FAIL: expected HTTP 401 or 403 from /chat/conversations, got $status" >&2
    exit 1
    ;;
esac

echo "Smoke checks passed."
