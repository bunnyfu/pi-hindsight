import { afterEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_CONFIG } from "../extensions/config/config.js";
import { PI_HINDSIGHT_USER_AGENT } from "../extensions/version.js";
import {
  assertHealthResponse,
  assertReflectResponse,
  bankBackgroundPath,
  bankConfigPath,
  bankProfilePath,
  chunkItemPath,
  consolidationPath,
  consolidationRecoverPath,
  createHindsightRestTransport,
  documentItemPath,
  documentsCollectionPath,
  encodeBankPath,
  entitiesCollectionPath,
  entityGraphPath,
  entityItemPath,
  entityRegeneratePath,
  graphPath,
  memoriesCollectionPath,
  memoryHistoryPath,
  memoryItemPath,
  memoryObservationsPath,
  operationCancelPath,
  operationItemPath,
  operationRetryPath,
  operationsCollectionPath,
  observationsPath,
  reflectRequestBody,
  tagsCollectionPath,
  updateBankConfigRequestBody,
  updateBankProfileRequestBody,
  updateDocumentRequestBody,
} from "../extensions/client/client-rest.js";

describe("Hindsight REST transport helpers", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("maps reflect response schema options to Hindsight REST request shape", () => {
    expect(
      reflectRequestBody("query", {
        context: "ctx",
        budget: "mid",
        maxTokens: 0,
        responseSchema: { type: "object" },
        includeFacts: true,
        includeToolCalls: false,
        tags: ["source:pi"],
        tagsMatch: "any_strict",
      }),
    ).toEqual({
      query: "query",
      context: "ctx",
      budget: "mid",
      max_tokens: 0,
      response_schema: { type: "object" },
      include: { facts: {}, tool_calls: null },
      tags: ["source:pi"],
      tags_match: "any_strict",
    });
  });

  it("sets the package-aligned user-agent on REST requests", async () => {
    const fetch = vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 }));
    vi.stubGlobal("fetch", fetch);

    await createHindsightRestTransport(DEFAULT_CONFIG).request("/v1/health");

    const headers = (fetch as unknown as { mock: { calls: Array<[string, RequestInit]> } }).mock
      .calls[0]?.[1].headers as Headers;
    expect(headers.get("User-Agent")).toBe(PI_HINDSIGHT_USER_AGENT);
  });

  it("encodes bank ids in REST paths", () => {
    expect(encodeBankPath("bank/id", "/reflect")).toBe("/v1/default/banks/bank%2Fid/reflect");
    expect(bankConfigPath("bank/id")).toBe("/v1/default/banks/bank%2Fid/config");
    expect(consolidationPath("bank/id")).toBe("/v1/default/banks/bank%2Fid/consolidate");
    expect(consolidationRecoverPath("bank/id")).toBe(
      "/v1/default/banks/bank%2Fid/consolidation/recover",
    );
    expect(observationsPath("bank/id")).toBe("/v1/default/banks/bank%2Fid/observations");
    expect(
      updateBankConfigRequestBody({ retain_custom_instructions: "Extract carefully" }),
    ).toEqual({
      updates: { retain_custom_instructions: "Extract carefully" },
    });
  });

  it("maps operation and memory inspection paths", () => {
    expect(
      operationsCollectionPath("bank/id", {
        status: "failed",
        taskType: "retain",
        limit: 25,
        offset: 50,
      }),
    ).toBe("/v1/default/banks/bank%2Fid/operations?status=failed&type=retain&limit=25&offset=50");
    expect(operationItemPath("bank/id", "op/id")).toBe(
      "/v1/default/banks/bank%2Fid/operations/op%2Fid",
    );
    expect(operationCancelPath("bank/id", "op/id")).toBe(
      "/v1/default/banks/bank%2Fid/operations/op%2Fid",
    );
    expect(operationRetryPath("bank/id", "op/id")).toBe(
      "/v1/default/banks/bank%2Fid/operations/op%2Fid/retry",
    );
    expect(
      memoriesCollectionPath("bank/id", { type: "observation", q: "needle", limit: 5, offset: 2 }),
    ).toBe("/v1/default/banks/bank%2Fid/memories/list?type=observation&q=needle&limit=5&offset=2");
    expect(memoryItemPath("bank/id", "mem/id")).toBe(
      "/v1/default/banks/bank%2Fid/memories/mem%2Fid",
    );
    expect(memoryHistoryPath("bank/id", "mem/id")).toBe(
      "/v1/default/banks/bank%2Fid/memories/mem%2Fid/history",
    );
    expect(memoryObservationsPath("bank/id", "mem/id")).toBe(
      "/v1/default/banks/bank%2Fid/memories/mem%2Fid/observations",
    );
    expect(chunkItemPath("chunk/id")).toBe("/v1/default/chunks/chunk%2Fid");
  });

  it("maps document/entity/graph/tag/bank profile REST helpers", () => {
    expect(
      documentsCollectionPath("bank/id", {
        q: "needle",
        tags: ["source:pi", "repo:x"],
        tagsMatch: "all_strict",
        limit: 10,
        offset: 5,
      }),
    ).toBe(
      "/v1/default/banks/bank%2Fid/documents?q=needle&tags=source%3Api&tags=repo%3Ax&tags_match=all_strict&limit=10&offset=5",
    );
    expect(documentItemPath("bank/id", "doc/id")).toBe(
      "/v1/default/banks/bank%2Fid/documents/doc%2Fid",
    );
    expect(updateDocumentRequestBody({ tags: ["one"] })).toEqual({ tags: ["one"] });
    expect(entitiesCollectionPath("bank/id", { limit: 3, offset: 2 })).toBe(
      "/v1/default/banks/bank%2Fid/entities?limit=3&offset=2",
    );
    expect(entityItemPath("bank/id", "entity/id")).toBe(
      "/v1/default/banks/bank%2Fid/entities/entity%2Fid",
    );
    expect(entityRegeneratePath("bank/id", "entity/id")).toBe(
      "/v1/default/banks/bank%2Fid/entities/entity%2Fid/regenerate",
    );
    expect(
      graphPath("bank/id", {
        type: "person",
        q: "alice",
        limit: 7,
        tags: ["source:pi"],
        tagsMatch: "any_strict",
        documentId: "doc/id",
        chunkId: "chunk/id",
      }),
    ).toBe(
      "/v1/default/banks/bank%2Fid/graph?type=person&q=alice&limit=7&tags=source%3Api&tags_match=any_strict&document_id=doc%2Fid&chunk_id=chunk%2Fid",
    );
    expect(entityGraphPath("bank/id", { limit: 9, minCount: 2 })).toBe(
      "/v1/default/banks/bank%2Fid/entities/graph?limit=9&min_count=2",
    );
    expect(tagsCollectionPath("bank/id", { q: "source", source: "memories", limit: 4 })).toBe(
      "/v1/default/banks/bank%2Fid/tags?q=source&source=memories&limit=4",
    );
    expect(bankProfilePath("bank/id")).toBe("/v1/default/banks/bank%2Fid/profile");
    expect(bankBackgroundPath("bank/id")).toBe("/v1/default/banks/bank%2Fid/background");
    expect(
      updateBankProfileRequestBody({ reflectMission: "Reflect", retainMission: null }),
    ).toEqual({
      reflect_mission: "Reflect",
      retain_mission: null,
    });
  });

  it("asserts REST fallback response shapes", () => {
    expect(assertHealthResponse({ status: "ok" })).toEqual({ status: "ok" });
    expect(assertHealthResponse(null)).toEqual({});
    expect(assertHealthResponse("ok")).toEqual({});
    expect(assertReflectResponse({ text: "answer" })).toEqual({ text: "answer" });
    expect(() => assertReflectResponse(null)).toThrow("non-object response");
  });

  it("preserves REST status and body for admin-tool error presentation", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: false,
        status: 409,
        json: async () => ({ detail: "operation is not pending" }),
      })),
    );
    const transport = createHindsightRestTransport({
      hindsight: { baseUrl: "http://hindsight.test/", apiKey: "secret", timeoutMs: 1000 },
    } as never);

    await expect(transport.request("/v1/default/banks/bank/operations/op")).rejects.toMatchObject({
      status: 409,
      body: { detail: "operation is not pending" },
      message: 'Hindsight request failed with status 409: {"detail":"operation is not pending"}',
    });
  });

  it("redacts secrets from REST error messages while preserving structured body", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: false,
        status: 401,
        json: async () => ({ detail: "authorization: Bearer sk-testsecret1234567890" }),
      })),
    );
    const transport = createHindsightRestTransport({
      hindsight: { baseUrl: "http://hindsight.test/", apiKey: "secret", timeoutMs: 1000 },
    } as never);

    await expect(transport.request("/v1/default/banks/bank/profile")).rejects.toMatchObject({
      status: 401,
      body: { detail: "authorization: Bearer sk-testsecret1234567890" },
      message:
        'Hindsight request failed with status 401: {"detail":"authorization: [REDACTED] [REDACTED]"}',
    });
  });
});
