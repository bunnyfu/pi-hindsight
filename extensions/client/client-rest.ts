import { PI_HINDSIGHT_USER_AGENT } from "../version.js";
import type { ResolvedConfig } from "../types.js";
import { redactError } from "../utils/sanitize.js";

export interface HindsightRestTransport {
  request(path: string, init?: RequestInit): Promise<unknown>;
}

export interface HindsightHealthResponse {
  status?: string;
}

export interface HindsightReflectResponse {
  text?: string;
  result?: unknown;
}

export interface HindsightRestError extends Error {
  status?: number;
  body?: unknown;
}

function baseUrl(config: ResolvedConfig): string {
  return config.hindsight.baseUrl.replace(/\/$/, "");
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function assertRestObject(value: unknown, operation: string): Record<string, unknown> {
  if (!isRecord(value)) throw new Error(`${operation} returned non-object response`);
  return value;
}

export function assertHealthResponse(value: unknown): HindsightHealthResponse {
  return isRecord(value) ? (value as HindsightHealthResponse) : {};
}

export function assertReflectResponse(value: unknown): HindsightReflectResponse {
  return assertRestObject(value, "hindsight reflect") as HindsightReflectResponse;
}

export function createHindsightRestTransport(config: ResolvedConfig): HindsightRestTransport {
  return {
    async request(path, init = {}) {
      const headers = new Headers(init.headers);
      headers.set("User-Agent", PI_HINDSIGHT_USER_AGENT);
      if (!headers.has("Content-Type") && init.body && !(init.body instanceof FormData))
        headers.set("Content-Type", "application/json");
      if (config.hindsight.apiKey)
        headers.set("Authorization", `Bearer ${config.hindsight.apiKey}`);
      const response = await fetch(`${baseUrl(config)}${path}`, { ...init, headers });
      const body = (await response.json().catch(() => undefined)) as unknown;
      if (!response.ok) {
        const rawMessage = `Hindsight request failed with status ${response.status}: ${JSON.stringify(body)}`;
        const error = new Error(redactError(rawMessage)) as HindsightRestError;
        error.status = response.status;
        error.body = body;
        throw error;
      }
      return body;
    },
  };
}

function isRetryableError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const status = (error as HindsightRestError).status;
  if (typeof status === "number" && status >= 500) return true;
  if (error.message.includes("timed out")) return true;
  if (error.message.includes("fetch failed")) return true;
  if (error.message.includes("ECONNREFUSED")) return true;
  if (error.message.includes("ENOTFOUND")) return true;
  if (error.message.includes("ETIMEDOUT")) return true;
  if (error.message.includes("ECONNRESET")) return true;
  return false;
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
          const delay = baseDelayMs * Math.pow(2, attempt - 1) + jitter;
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

export function reflectRequestBody(
  query: string,
  options: {
    context?: string;
    budget?: string;
    maxTokens?: number;
    responseSchema?: unknown;
    includeFacts?: boolean;
    includeToolCalls?: boolean;
    factTypes?: Array<"world" | "experience" | "observation">;
    excludeMentalModels?: boolean;
    excludeMentalModelIds?: string[];
    tags?: string[];
    tagsMatch?: string;
    tagGroups?: unknown[];
  } = {},
): Record<string, unknown> {
  return {
    query,
    ...(options.context ? { context: options.context } : {}),
    budget: options.budget ?? "low",
    ...(options.maxTokens !== undefined ? { max_tokens: options.maxTokens } : {}),
    ...(options.responseSchema ? { response_schema: options.responseSchema } : {}),
    ...(options.includeFacts !== undefined || options.includeToolCalls !== undefined
      ? {
          include: {
            ...(options.includeFacts !== undefined
              ? { facts: options.includeFacts ? {} : null }
              : {}),
            ...(options.includeToolCalls !== undefined
              ? { tool_calls: options.includeToolCalls ? {} : null }
              : {}),
          },
        }
      : {}),
    ...(options.factTypes ? { fact_types: options.factTypes } : {}),
    ...(options.excludeMentalModels !== undefined
      ? { exclude_mental_models: options.excludeMentalModels }
      : {}),
    ...(options.excludeMentalModelIds
      ? { exclude_mental_model_ids: options.excludeMentalModelIds }
      : {}),
    ...(options.tagGroups ? { tag_groups: options.tagGroups } : {}),
    ...(options.tagGroups ? {} : options.tags ? { tags: options.tags } : {}),
    ...(options.tagGroups ? {} : options.tagsMatch ? { tags_match: options.tagsMatch } : {}),
  };
}

export function encodeBankPath(bankId: string, suffix: string): string {
  return `/v1/default/banks/${encodeURIComponent(bankId)}${suffix}`;
}

export function bankConfigPath(bankId: string): string {
  return encodeBankPath(bankId, "/config");
}
