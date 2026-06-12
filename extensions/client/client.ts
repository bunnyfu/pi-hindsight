import { HindsightClient } from "@vectorize-io/hindsight-client";
import { redactError } from "../utils/sanitize.js";
import type { HindsightLikeClient, ResolvedConfig } from "../types.js";
import { PI_HINDSIGHT_USER_AGENT } from "../version.js";
import {
  assertHealthResponse,
  assertReflectResponse,
  bankConfigPath,
  createHindsightRestTransport,
  withRetry,
  encodeBankPath,
  reflectRequestBody,
} from "./client-rest.js";
import { installFetchRequestCompat } from "./fetch-compat.js";
import { withTimeout } from "./timeout.js";

type ReflectOptions = Parameters<HindsightLikeClient["reflect"]>[2];
type RetainOptions = Parameters<HindsightLikeClient["retain"]>[2];

function retainBatchItem(content: string, options: RetainOptions) {
  return {
    content,
    ...(options?.timestamp ? { timestamp: options.timestamp } : {}),
    ...(options?.context ? { context: options.context } : {}),
    ...(options?.metadata ? { metadata: options.metadata } : {}),
    ...(options?.documentId ? { document_id: options.documentId } : {}),
    ...(options?.entities?.length ? { entities: options.entities } : {}),
    ...(options?.tags ? { tags: options.tags } : {}),
    ...(options?.observationScopes?.length
      ? { observation_scopes: options.observationScopes }
      : {}),
    ...(options?.updateMode ? { update_mode: options.updateMode } : {}),
  };
}

function retainSingle(
  raw: HindsightClient,
  bankId: string,
  content: string,
  options: RetainOptions,
  signal: AbortSignal,
) {
  if (options?.documentTags?.length) {
    return raw.retainBatch(bankId, [retainBatchItem(content, options)], {
      ...(options.async !== undefined ? { async: options.async } : {}),
      documentTags: options.documentTags,
      signal,
    });
  }

  const { documentTags: _documentTags, signal: _signal, ...retainOptions } = options ?? {};
  return raw.retain(bankId, content, { ...retainOptions, signal });
}

async function reflect(
  args: {
    raw: HindsightClient;
    rest: ReturnType<typeof createHindsightRestTransport>;
    bankId: string;
    query: string;
    options: ReflectOptions;
  },
  signal: AbortSignal,
): Promise<unknown> {
  const needsRestShim =
    args.options?.responseSchema ||
    args.options?.maxTokens !== undefined ||
    args.options?.includeFacts !== undefined ||
    args.options?.includeToolCalls !== undefined;
  if (!needsRestShim) return args.raw.reflect(args.bankId, args.query, { ...args.options, signal });
  const response = await args.rest.request(encodeBankPath(args.bankId, "/reflect"), {
    method: "POST",
    signal,
    body: JSON.stringify(reflectRequestBody(args.query, args.options)),
  });
  return assertReflectResponse(response);
}

export function createHindsightClient(config: ResolvedConfig): HindsightLikeClient {
  installFetchRequestCompat();

  const raw = new HindsightClient({
    baseUrl: config.hindsight.baseUrl,
    ...(config.hindsight.apiKey ? { apiKey: config.hindsight.apiKey } : {}),
    userAgent: PI_HINDSIGHT_USER_AGENT,
  });
  const rest = withRetry(createHindsightRestTransport(config));
  const timeoutMs = config.hindsight.timeoutMs;
  return {
    retain: (bankId, content, options) =>
      withTimeout(
        "hindsight retain",
        timeoutMs,
        (signal) => retainSingle(raw, bankId, content, options, signal),
        options?.signal,
      ),
    retainBatch: (...args) =>
      withTimeout(
        "hindsight retainBatch",
        timeoutMs,
        (signal) => {
          const [bankId, items, options] = args;
          return raw.retainBatch(bankId, items, { ...options, signal });
        },
        args[2]?.signal,
      ),
    recall: (...args) => {
      const [bankId, query, options] = args;
      return withTimeout(
        "hindsight recall",
        timeoutMs,
        (signal) => {
          return raw.recall(bankId, query, { ...options, signal });
        },
        options?.signal,
      );
    },
    reflect: (bankId, query, options) =>
      withTimeout(
        "hindsight reflect",
        timeoutMs,
        (signal) => reflect({ raw, rest, bankId, query, options }, signal),
        options?.signal,
      ),
    createBank: (...args) =>
      withTimeout("hindsight createBank", timeoutMs, (signal) => {
        const [bankId, options] = args;
        return raw.createBank(bankId, { ...options, signal });
      }),
    getBankProfile: (...args) =>
      withTimeout("hindsight getBankProfile", timeoutMs, (signal) =>
        raw.getBankProfile(args[0], { signal }),
      ),
    getBankStats: (bankId) =>
      withTimeout("hindsight getBankStats", timeoutMs, (signal) =>
        rest.request(encodeBankPath(bankId, "/stats"), { signal }),
      ),
    getBankConfig: (bankId) =>
      withTimeout("hindsight getBankConfig", timeoutMs, (signal) =>
        rest.request(bankConfigPath(bankId), { signal }),
      ),
    health: () =>
      withTimeout("hindsight health", timeoutMs, async (signal) =>
        assertHealthResponse(await rest.request("/health", { signal })),
      ),
  };
}

export async function checkHindsight(
  client: HindsightLikeClient,
  bankId: string,
): Promise<{ ok: boolean; error?: string }> {
  try {
    if (client.health) await client.health();
    else if (client.getBankProfile) await client.getBankProfile(bankId);
    else await client.recall(bankId, "health check", { maxTokens: 1, budget: "low" });
    return { ok: true };
  } catch (error) {
    return { ok: false, error: redactError(error) };
  }
}
