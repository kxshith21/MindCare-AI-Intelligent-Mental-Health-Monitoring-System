/**
 * Backend-for-frontend proxy for FastAPI.
 *
 * Browser -> /api/* (this route handler, same origin) -> FastAPI.
 * This handler reads the Supabase cookie session and forwards only the
 * user's short-lived access token. The service-role key never leaves /api
 * (Python) and is never available in the browser bundle.
 *
 * The upstream path allowlist is explicit: this is not a general-purpose
 * open proxy.
 */
import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  ApiError,
  codeForStatus,
  defaultMessageForStatus,
  type ApiErrorPayload,
} from "@/lib/api/errors";

// Cache Components uses the default Node.js runtime and request-time APIs
// already opt these handlers out of prerendering, so no route segment config
// is exported here.

const API_URL = (
  process.env.API_URL ??
  process.env.NEXT_PUBLIC_API_URL ??
  "http://localhost:8000"
).replace(/\/+$/, "");
const TIMEOUT_MS = 15_000;

interface RouteRule {
  method: string;
  pattern: RegExp;
  /** Public rules do not require a Supabase session. */
  public?: boolean;
}

const RULES: readonly RouteRule[] = [
  { method: "GET", pattern: /^\/health$/, public: true },
  { method: "POST", pattern: /^\/auth\/psychologist-signup$/, public: true },
  { method: "POST", pattern: /^\/chat\/message$/ },
  { method: "GET", pattern: /^\/chat\/conversations$/ },
  { method: "GET", pattern: /^\/chat\/conversations\/[^/]+\/messages$/ },
  { method: "GET", pattern: /^\/checkins$/ },
  { method: "POST", pattern: /^\/checkins$/ },
  { method: "GET", pattern: /^\/psychologist\/patients$/ },
  { method: "GET", pattern: /^\/psychologist\/patients\/[^/]+\/trends$/ },
  { method: "GET", pattern: /^\/psychologist\/patients\/[^/]+\/notes$/ },
  { method: "POST", pattern: /^\/psychologist\/patients\/[^/]+\/notes$/ },
  { method: "GET", pattern: /^\/psychologist\/risk-events$/ },
  { method: "PATCH", pattern: /^\/psychologist\/risk-events\/[^/]+$/ },
  { method: "DELETE", pattern: /^\/account$/ },
];

function errorPayload(payload: ApiErrorPayload, status: number): NextResponse {
  return NextResponse.json(payload, { status });
}

function upstreamMessage(payload: unknown, status: number): string {
  if (payload && typeof payload === "object") {
    const body = payload as Record<string, unknown>;
    if (typeof body.message === "string" && body.message) return body.message;
    if (typeof body.detail === "string" && body.detail) return body.detail;
  }
  // FastAPI validation errors are arrays; do not leak their internals.
  return defaultMessageForStatus(status);
}

function reject(error: ApiError): NextResponse {
  return errorPayload(
    { status: error.status, code: error.code, message: error.message },
    error.status > 0 ? error.status : 502,
  );
}

async function handle(
  request: NextRequest,
  segments: string[],
): Promise<NextResponse> {
  const upstreamPath = `/${segments.join("/")}`;
  const rule = RULES.find(
    (candidate) =>
      candidate.method === request.method && candidate.pattern.test(upstreamPath),
  );
  if (!rule) {
    return reject(
      new ApiError(404, "NOT_FOUND", "This API endpoint is not available."),
    );
  }

  let authorization: string | null = null;
  if (!rule.public) {
    const supabase = await createSupabaseServerClient();
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) {
      return reject(new ApiError(401, "UNAUTHENTICATED", defaultMessageForStatus(401)));
    }
    authorization = `Bearer ${token}`;
  }

  const url = `${API_URL}${upstreamPath}${request.nextUrl.search}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

  let upstream: Response;
  try {
    const headers = new Headers({
      Accept: "application/json",
      ...(authorization ? { Authorization: authorization } : {}),
    });
    const contentType = request.headers.get("content-type");
    if (contentType) headers.set("Content-Type", contentType);

    upstream = await fetch(url, {
      method: request.method,
      headers,
      body: request.method === "GET" ? undefined : await request.text(),
      signal: controller.signal,
      cache: "no-store",
    });
  } catch (error) {
    if (controller.signal.aborted) {
      return reject(new ApiError(504, "TIMEOUT", "The server took too long to respond."));
    }
    void error;
    return reject(
      new ApiError(502, "UPSTREAM_ERROR", "Could not reach the service. Please try again."),
    );
  } finally {
    clearTimeout(timeout);
  }

  let payload: unknown;
  try {
    payload = await upstream.json();
  } catch {
    return reject(
      new ApiError(
        502,
        upstream.ok ? "INVALID_RESPONSE" : codeForStatus(upstream.status),
        upstream.ok
          ? "The service returned an unexpected response."
          : defaultMessageForStatus(upstream.status),
      ),
    );
  }

  if (!upstream.ok) {
    const status = upstream.status;
    return errorPayload(
      {
        status,
        code: codeForStatus(status),
        message: upstreamMessage(payload, status),
      },
      status,
    );
  }

  return NextResponse.json(payload, { status: upstream.status });
}

type ProxyRouteContext = RouteContext<"/api/[...path]">;

export async function GET(request: NextRequest, context: ProxyRouteContext) {
  return handle(request, (await context.params).path);
}

export async function POST(request: NextRequest, context: ProxyRouteContext) {
  return handle(request, (await context.params).path);
}

export async function PATCH(request: NextRequest, context: ProxyRouteContext) {
  return handle(request, (await context.params).path);
}

export async function DELETE(request: NextRequest, context: ProxyRouteContext) {
  return handle(request, (await context.params).path);
}
