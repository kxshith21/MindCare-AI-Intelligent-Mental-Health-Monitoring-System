/**
 * Typed browser client for FastAPI.
 *
 * The browser only ever calls our same-origin Next.js route handlers under
 * `/api/*`. Those handlers read the Supabase HttpOnly cookie session, forward
 * the user's short-lived bearer token upstream, and never expose tokens or the
 * service-role key to client JavaScript. See docs/FRONTEND.md.
 *
 * Every response is validated with the zod schemas in `api/schemas.ts`.
 * There are no retries — especially not for POST /chat/message, where a retry
 * would create duplicate stored messages and risk events.
 */
import { z } from "zod";
import {
  ApiError,
  codeForStatus,
  defaultMessageForStatus,
  type ApiErrorCode,
} from "@/lib/api/errors";
import {
  apiErrorSchema,
  chatMessageResponseSchema,
  checkinListResponseSchema,
  checkinResponseSchema,
  clinicianNoteListResponseSchema,
  clinicianNoteSchema,
  conversationListResponseSchema,
  deleteAccountResponseSchema,
  healthSchema,
  messageListResponseSchema,
  patientListResponseSchema,
  psychologistSignupResponseSchema,
  riskEventListResponseSchema,
  riskEventSchema,
  trendsResponseSchema,
} from "@/lib/api/schemas";

export { ApiError } from "@/lib/api/errors";
export type { ApiErrorPayload, ApiErrorCode } from "@/lib/api/errors";

const API_BASE = "/api";
const TIMEOUT_MS = 15_000;

export interface ChatMessageRequest {
  conversation_id?: string;
  content: string;
}

export interface CheckinCreateRequest {
  mood: number;
  note?: string | null;
  phq9_answers?: number[] | null;
  gad7_answers?: number[] | null;
}

export interface PsychologistSignupRequest {
  email: string;
  password: string;
  display_name: string;
  license_no: string;
  region?: string;
}

export interface RiskEventReviewRequest {
  status: "acknowledged" | "resolved";
}

export interface ClinicianNoteCreateRequest {
  note: string;
}

function appendQuery(path: string, params: Record<string, string | undefined>): string {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== "") query.set(key, value);
  }
  const encoded = query.toString();
  return encoded ? `${path}?${encoded}` : path;
}

function readUpstreamMessage(payload: unknown, status: number): string {
  if (payload && typeof payload === "object") {
    const body = payload as Record<string, unknown>;
    if (typeof body.message === "string" && body.message) return body.message;
    if (typeof body.detail === "string" && body.detail) return body.detail;
  }
  return defaultMessageForStatus(status);
}

async function request<T>(
  path: string,
  schema: z.ZodType<T>,
  init: RequestInit = {},
): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
  let response: Response;

  try {
    response = await fetch(`${API_BASE}${path}`, {
      ...init,
      credentials: "same-origin",
      signal: controller.signal,
      headers: {
        ...(init.body ? { "Content-Type": "application/json" } : {}),
        ...init.headers,
      },
    });
  } catch (error) {
    if (controller.signal.aborted) {
      throw new ApiError(0, "TIMEOUT", "The server took too long to respond.");
    }
    // Never stringify the error: it can contain request URLs or tokens.
    void error;
    throw new ApiError(0, "NETWORK_ERROR", "Could not reach the server. Please try again.");
  } finally {
    clearTimeout(timeout);
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new ApiError(
      response.status,
      response.ok ? "INVALID_RESPONSE" : codeForStatus(response.status),
      response.ok ? "The server returned an unexpected response." : defaultMessageForStatus(response.status),
    );
  }

  if (!response.ok) {
    const parsedError = apiErrorSchema.safeParse(payload);
    if (parsedError.success) {
      throw new ApiError(
        parsedError.data.status,
        parsedError.data.code as ApiErrorCode,
        parsedError.data.message,
      );
    }
    throw new ApiError(
      response.status,
      codeForStatus(response.status),
      readUpstreamMessage(payload, response.status),
    );
  }

  const parsed = schema.safeParse(payload);
  if (!parsed.success) {
    throw new ApiError(
      response.status,
      "INVALID_RESPONSE",
      "The server returned an unexpected response.",
    );
  }
  return parsed.data;
}

export const api = {
  getHealth: () =>
    request("/health", healthSchema),

  signUpPsychologist: (payload: PsychologistSignupRequest) =>
    request("/auth/psychologist-signup", psychologistSignupResponseSchema, {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  // Intentionally one attempt: see the module comment above.
  sendMessage: (payload: ChatMessageRequest) =>
    request("/chat/message", chatMessageResponseSchema, {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  listConversations: () =>
    request("/chat/conversations", conversationListResponseSchema),

  listMessages: (conversationId: string) =>
    request(
      `/chat/conversations/${encodeURIComponent(conversationId)}/messages`,
      messageListResponseSchema,
    ),

  createCheckin: (payload: CheckinCreateRequest) =>
    request("/checkins", checkinResponseSchema, {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  listCheckins: (params: { from?: string; to?: string } = {}) =>
    request(appendQuery("/checkins", params), checkinListResponseSchema),

  listLinkedPatients: () =>
    request("/psychologist/patients", patientListResponseSchema),

  getTrends: (patientId: string) =>
    request(
      `/psychologist/patients/${encodeURIComponent(patientId)}/trends`,
      trendsResponseSchema,
    ),

  listRiskEvents: () =>
    request("/psychologist/risk-events", riskEventListResponseSchema),

  reviewRiskEvent: (eventId: string, payload: RiskEventReviewRequest) =>
    request(
      `/psychologist/risk-events/${encodeURIComponent(eventId)}`,
      riskEventSchema,
      { method: "PATCH", body: JSON.stringify(payload) },
    ),

  listClinicianNotes: (patientId: string) =>
    request(
      `/psychologist/patients/${encodeURIComponent(patientId)}/notes`,
      clinicianNoteListResponseSchema,
    ),

  addClinicianNote: (patientId: string, payload: ClinicianNoteCreateRequest) =>
    request(
      `/psychologist/patients/${encodeURIComponent(patientId)}/notes`,
      clinicianNoteSchema,
      { method: "POST", body: JSON.stringify(payload) },
    ),

  deleteAccount: () =>
    request("/account", deleteAccountResponseSchema, {
      method: "DELETE",
      body: JSON.stringify({ confirm: "DELETE" }),
    }),
};
