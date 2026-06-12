export interface HindsightRestError extends Error {
  status?: number;
  body?: unknown;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function isRetryableError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const status =
    (error as HindsightRestError).status ?? (error as { statusCode?: number }).statusCode;
  if (typeof status === "number" && status >= 500) return true;
  if (error.message.includes("timed out")) return true;
  if (error.message.includes("fetch failed")) return true;
  if (error.message.includes("ECONNREFUSED")) return true;
  if (error.message.includes("ENOTFOUND")) return true;
  if (error.message.includes("ETIMEDOUT")) return true;
  if (error.message.includes("ECONNRESET")) return true;
  return false;
}

export interface HindsightRestTransport {
  request(path: string, init?: RequestInit): Promise<unknown>;
}

function isIdempotentMethod(init?: RequestInit): boolean {
  const method = init?.method?.toUpperCase() ?? "GET";
  return method === "GET" || method === "HEAD" || method === "DELETE";
}

export function withRetry(
  transport: HindsightRestTransport,
  maxRetries = 3,
  baseDelayMs = 1000,
): HindsightRestTransport {
  return {
    async request(path, init) {
      if (!isIdempotentMethod(init)) {
        return await transport.request(path, init);
      }
      let lastError: Error | undefined;
      for (let attempt = 0; attempt <= maxRetries; attempt++) {
        if (attempt > 0) {
          const jitter = Math.random() * baseDelayMs * 0.5;
          const delay = baseDelayMs * 2 ** (attempt - 1) + jitter;
          await new Promise((resolve) => setTimeout(resolve, delay));
        }
        try {
          return await transport.request(path, init);
        } catch (error) {
          if (!isRetryableError(error)) throw error;
          lastError = error as Error;
        }
      }
      throw lastError;
    },
  };
}
