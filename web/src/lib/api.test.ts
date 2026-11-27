import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, api } from "./api";

type FetchMock = ReturnType<typeof vi.fn<typeof fetch>>;

function stubFetch(impl: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>): FetchMock {
  const mock = vi.fn(impl);
  vi.stubGlobal("fetch", mock);
  return mock;
}

function jsonResponse(payload: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => payload,
  } as Response;
}

describe("api client", () => {
  beforeEach(() => {
    vi.useRealTimers();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("validates a successful response with its zod schema", async () => {
    const fetchMock = stubFetch(async () =>
      jsonResponse({
        conversations: [{ id: "conv-1", created_at: "2026-11-27T00:00:00Z" }],
      }),
    );

    const result = await api.listConversations();
    expect(result.conversations[0].id).toBe("conv-1");
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/chat/conversations",
      expect.objectContaining({ credentials: "same-origin" }),
    );
  });

  it("rejects a wrong-shaped response with INVALID_RESPONSE", async () => {
    stubFetch(async () => jsonResponse({ conversations: [{ created_at: "no-id" }] }));
    await expect(api.listConversations()).rejects.toMatchObject({
      name: "ApiError",
      code: "INVALID_RESPONSE",
    });
  });

  it("preserves the shared error shape from the route handler", async () => {
    stubFetch(async () =>
      jsonResponse(
        { status: 401, code: "UNAUTHENTICATED", message: "Please log in again." },
        401,
      ),
    );
    await expect(api.listConversations()).rejects.toMatchObject({
      status: 401,
      code: "UNAUTHENTICATED",
      message: "Please log in again.",
    });
  });

  it("does not retry a failed chat message", async () => {
    const fetchMock = stubFetch(async () => {
      throw new Error("offline");
    });

    await expect(
      api.sendMessage({ content: "hello" }),
    ).rejects.toBeInstanceOf(ApiError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("builds from/to query parameters for check-ins", async () => {
    const fetchMock = stubFetch(async () => jsonResponse({ checkins: [] }));
    await api.listCheckins({
      from: "2026-11-01T00:00:00.000Z",
      to: "2026-11-30T00:00:00.000Z",
    });
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      "/api/checkins?from=2026-11-01T00%3A00%3A00.000Z&to=2026-11-30T00%3A00%3A00.000Z",
    );
  });
});
