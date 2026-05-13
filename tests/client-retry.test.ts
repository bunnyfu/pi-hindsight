import { describe, expect, it, vi } from "vitest";
import { withRetry } from "../extensions/client/client-rest.js";
import type { HindsightRestTransport } from "../extensions/client/client-rest.js";

function createMockTransport(
  failures: Array<{ status?: number; message?: string }>,
): HindsightRestTransport {
  let callCount = 0;
  return {
    request: vi.fn(async (_path, _init) => {
      const failure = failures[callCount++];
      if (failure && (failure.status !== undefined || failure.message !== undefined)) {
        const error = new Error(failure.message ?? `Error ${failure.status}`) as Error & {
          status?: number;
        };
        if (failure.status !== undefined) error.status = failure.status;
        throw error;
      }
      return { ok: true };
    }),
  };
}

describe("Hindsight client retry", () => {
  it("succeeds on first attempt when transport succeeds", async () => {
    const transport = createMockTransport([]);
    const retrying = withRetry(transport, 3, 10);
    const result = await retrying.request("/test", {});
    expect(result).toEqual({ ok: true });
    expect(transport.request).toHaveBeenCalledTimes(1);
  });

  it("retries on 5xx error and succeeds on second attempt", async () => {
    const transport = createMockTransport([{ status: 503 }, {}]);
    const retrying = withRetry(transport, 3, 10);
    const result = await retrying.request("/test", {});
    expect(result).toEqual({ ok: true });
    expect(transport.request).toHaveBeenCalledTimes(2);
  });

  it("fails after max retries exhausted", async () => {
    const transport = createMockTransport([
      { status: 503 },
      { status: 503 },
      { status: 503 },
      { status: 503 },
    ]);
    const retrying = withRetry(transport, 3, 10);
    await expect(retrying.request("/test", {})).rejects.toThrow();
    expect(transport.request).toHaveBeenCalledTimes(4);
  });

  it("does not retry on 4xx client error", async () => {
    const transport = createMockTransport([{ status: 404 }]);
    const retrying = withRetry(transport, 3, 10);
    await expect(retrying.request("/test", {})).rejects.toThrow();
    expect(transport.request).toHaveBeenCalledTimes(1);
  });

  it("retries on network error (fetch failed)", async () => {
    const transport = createMockTransport([{ message: "fetch failed" }, {}]);
    const retrying = withRetry(transport, 3, 10);
    const result = await retrying.request("/test", {});
    expect(result).toEqual({ ok: true });
    expect(transport.request).toHaveBeenCalledTimes(2);
  });

  it("does not retry non-idempotent POST requests", async () => {
    const transport = createMockTransport([{ status: 503 }, {}]);
    const retrying = withRetry(transport, 3, 10);
    await expect(retrying.request("/test", { method: "POST" })).rejects.toThrow();
    expect(transport.request).toHaveBeenCalledTimes(1);
  });

  it("does not retry non-idempotent PATCH requests", async () => {
    const transport = createMockTransport([{ status: 503 }, {}]);
    const retrying = withRetry(transport, 3, 10);
    await expect(retrying.request("/test", { method: "PATCH" })).rejects.toThrow();
    expect(transport.request).toHaveBeenCalledTimes(1);
  });

  it("does not retry non-idempotent PUT requests", async () => {
    const transport = createMockTransport([{ status: 503 }, {}]);
    const retrying = withRetry(transport, 3, 10);
    await expect(retrying.request("/test", { method: "PUT" })).rejects.toThrow();
    expect(transport.request).toHaveBeenCalledTimes(1);
  });

  it("retries idempotent DELETE requests", async () => {
    const transport = createMockTransport([{ status: 503 }, {}]);
    const retrying = withRetry(transport, 3, 10);
    const result = await retrying.request("/test", { method: "DELETE" });
    expect(result).toEqual({ ok: true });
    expect(transport.request).toHaveBeenCalledTimes(2);
  });

  it("does not retry when request is aborted", async () => {
    const transport = createMockTransport([{ status: 503 }, {}]);
    const retrying = withRetry(transport, 3, 10);
    const controller = new AbortController();
    controller.abort();
    await expect(retrying.request("/test", { signal: controller.signal })).rejects.toThrow(
      "Request aborted",
    );
    expect(transport.request).toHaveBeenCalledTimes(1);
  });
});
