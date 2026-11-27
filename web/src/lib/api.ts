/**
 * Minimal fetch helper for the MindCare FastAPI backend.
 *
 * Only the browser calls this (client components) — the base URL comes from
 * the public NEXT_PUBLIC_API_URL env var; no secrets ever reach the client.
 */

const API_URL = (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000").replace(/\/+$/, "");

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

/** POST JSON to the API and parse the response, mapping errors to ApiError. */
export async function apiPost<T>(path: string, body: unknown): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API_URL}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, "Could not reach the server. Is the API running?");
  }

  if (!response.ok) {
    let detail = `Request failed (HTTP ${response.status}).`;
    try {
      const payload = (await response.json()) as { detail?: unknown };
      if (typeof payload.detail === "string") detail = payload.detail;
    } catch {
      // non-JSON error body — keep the generic message
    }
    throw new ApiError(response.status, detail);
  }

  return (await response.json()) as T;
}
