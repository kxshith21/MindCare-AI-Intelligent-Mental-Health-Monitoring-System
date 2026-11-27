/** Shared error shape for every FastAPI call, browser and route handlers. */

export type ApiErrorCode =
  | "NETWORK_ERROR"
  | "TIMEOUT"
  | "INVALID_RESPONSE"
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "CONFLICT"
  | "VALIDATION_ERROR"
  | "RATE_LIMITED"
  | "UPSTREAM_ERROR"
  | "BAD_REQUEST"
  | "UNKNOWN_ERROR";

export class ApiError extends Error {
  readonly status: number;
  readonly code: ApiErrorCode;

  constructor(status: number, code: ApiErrorCode, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }
}

/** Map an upstream HTTP status to a stable, UI-consumable code. */
export function codeForStatus(status: number): ApiErrorCode {
  if (status === 400) return "BAD_REQUEST";
  if (status === 401) return "UNAUTHENTICATED";
  if (status === 403) return "FORBIDDEN";
  if (status === 404) return "NOT_FOUND";
  if (status === 409) return "CONFLICT";
  if (status === 422) return "VALIDATION_ERROR";
  if (status === 429) return "RATE_LIMITED";
  if (status >= 500) return "UPSTREAM_ERROR";
  return "UNKNOWN_ERROR";
}

export function defaultMessageForStatus(status: number): string {
  if (status === 401) return "Please log in again to continue.";
  if (status === 403) return "You do not have access to this information.";
  if (status === 404) return "We could not find that information.";
  if (status === 409) return "That account or record already exists.";
  if (status === 422) return "Please check the information you entered.";
  if (status === 429) return "Please wait a moment and try again.";
  if (status >= 500) return "The service is unavailable right now. Please try again.";
  if (status >= 400) return "Something went wrong. Please try again.";
  return "Something went wrong. Please try again.";
}

/** The exact JSON shape returned by our Next.js route handlers. */
export interface ApiErrorPayload {
  status: number;
  code: ApiErrorCode;
  message: string;
}
