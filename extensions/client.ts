import { HindsightClient } from "@vectorize-io/hindsight-client";
import { redactError } from "./sanitize.js";
import type { HindsightLikeClient, ResolvedConfig } from "./types.js";

async function fetchJson(
  config: ResolvedConfig,
  path: string,
  init: RequestInit = {},
): Promise<unknown> {
  const headers = new Headers(init.headers);
  headers.set("User-Agent", "pi-hindsight/0.1.0");
  if (config.hindsight.apiKey) headers.set("Authorization", `Bearer ${config.hindsight.apiKey}`);
  const response = await fetch(`${config.hindsight.baseUrl.replace(/\/$/, "")}${path}`, {
    ...init,
    headers,
  });
  const body = (await response.json().catch(() => undefined)) as unknown;
  if (!response.ok) throw new Error(`Hindsight request failed with status ${response.status}`);
  return body;
}

async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  operation: string,
): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(
          () => reject(new Error(`${operation} timed out after ${timeoutMs}ms`)),
          timeoutMs,
        );
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export function createHindsightClient(config: ResolvedConfig): HindsightLikeClient {
  const raw = new HindsightClient({
    baseUrl: config.hindsight.baseUrl,
    ...(config.hindsight.apiKey ? { apiKey: config.hindsight.apiKey } : {}),
    userAgent: "pi-hindsight/0.1.0",
  });
  const timeoutMs = config.hindsight.timeoutMs;
  const reflectWithResponseSchema = async (
    bankId: string,
    query: string,
    options: Parameters<HindsightLikeClient["reflect"]>[2],
  ): Promise<unknown> => {
    if (!options?.responseSchema) return raw.reflect(bankId, query, options);
    const response = await fetch(
      `${config.hindsight.baseUrl.replace(/\/$/, "")}/v1/default/banks/${encodeURIComponent(bankId)}/reflect`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(config.hindsight.apiKey
            ? { Authorization: `Bearer ${config.hindsight.apiKey}` }
            : {}),
          "User-Agent": "pi-hindsight/0.1.0",
        },
        body: JSON.stringify({
          query,
          ...(options.context ? { context: options.context } : {}),
          budget: options.budget ?? "low",
          response_schema: options.responseSchema,
          ...(options.tags ? { tags: options.tags } : {}),
          ...(options.tagsMatch ? { tags_match: options.tagsMatch } : {}),
        }),
      },
    );
    const body = (await response.json().catch(() => undefined)) as unknown;
    if (!response.ok) {
      throw new Error(
        `hindsight reflect failed with status ${response.status}: ${JSON.stringify(body)}`,
      );
    }
    return body;
  };
  return {
    retain: (bankId, content, options) =>
      withTimeout(
        raw.retainBatch(
          bankId,
          [
            {
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
            },
          ],
          options?.async !== undefined ? { async: options.async } : {},
        ),
        timeoutMs,
        "hindsight retain",
      ),
    retainBatch: (...args) =>
      withTimeout(raw.retainBatch(...args), timeoutMs, "hindsight retainBatch"),
    recall: (...args) => withTimeout(raw.recall(...args), timeoutMs, "hindsight recall"),
    reflect: (...args) =>
      withTimeout(reflectWithResponseSchema(...args), timeoutMs, "hindsight reflect"),
    createBank: (...args) =>
      withTimeout(raw.createBank(...args), timeoutMs, "hindsight createBank"),
    getBankProfile: (...args) =>
      withTimeout(raw.getBankProfile(...args), timeoutMs, "hindsight getBankProfile"),
    getBankStats: (bankId) =>
      withTimeout(
        fetchJson(config, `/v1/default/banks/${encodeURIComponent(bankId)}/stats`),
        timeoutMs,
        "hindsight getBankStats",
      ),
    health: () => withTimeout(fetchJson(config, "/health"), timeoutMs, "hindsight health"),
    deleteDocument: (bankId, documentId) =>
      withTimeout(
        fetchJson(
          config,
          `/v1/default/banks/${encodeURIComponent(bankId)}/documents/${encodeURIComponent(documentId)}`,
          { method: "DELETE" },
        ),
        timeoutMs,
        "hindsight deleteDocument",
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
