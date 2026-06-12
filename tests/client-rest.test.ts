import { afterEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_CONFIG } from "../extensions/config/config.js";
import { PI_HINDSIGHT_USER_AGENT } from "../extensions/version.js";
import {
  assertHealthResponse,
  assertReflectResponse,
  bankConfigPath,
  createHindsightRestTransport,
  encodeBankPath,
  reflectRequestBody,
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
