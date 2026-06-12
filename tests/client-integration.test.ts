import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { createHindsightClient } from "../extensions/client/client.js";
import { ensureProjectBank } from "../extensions/banks/bank-operations.js";
import { DEFAULT_CONFIG } from "../extensions/config/config.js";

interface CapturedRequest {
  method: string | undefined;
  url: string | undefined;
  headers: IncomingMessage["headers"];
  body: unknown;
}

function readBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("error", reject);
    req.on("end", () => {
      const text = Buffer.concat(chunks).toString("utf8");
      resolve(text ? JSON.parse(text) : undefined);
    });
  });
}

function sendJson(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
}

describe("Hindsight client adapter integration", () => {
  let server: Server;
  let baseUrl: string;
  const requests: CapturedRequest[] = [];

  beforeEach(async () => {
    requests.length = 0;
    server = createServer(async (req, res) => {
      const body = await readBody(req);
      requests.push({ method: req.method, url: req.url, headers: req.headers, body });

      if (req.method === "GET" && req.url === "/v1/default/banks/test-bank/profile") {
        sendJson(res, 404, { detail: "not found" });
        return;
      }
      if (req.method === "PUT" && req.url === "/v1/default/banks/test-bank") {
        sendJson(res, 200, { bank_id: "test-bank" });
        return;
      }
      if (req.method === "POST" && req.url === "/v1/default/banks/test-bank/memories") {
        sendJson(res, 200, { accepted: true });
        return;
      }
      if (req.method === "POST" && req.url === "/v1/default/banks/test-bank/memories/recall") {
        sendJson(res, 200, { results: [{ text: "remembered fact" }] });
        return;
      }
      if (req.method === "POST" && req.url === "/v1/default/banks/test-bank/reflect") {
        sendJson(res, 200, { text: "reflection" });
        return;
      }
      if (req.method === "GET" && req.url === "/v1/default/banks/test-bank/config") {
        sendJson(res, 200, { config: { retain_custom_instructions: "Read from db" } });
        return;
      }
      if (req.method === "PATCH" && req.url === "/v1/default/banks/test-bank/config") {
        sendJson(res, 200, { updated: true });
        return;
      }
      if (req.method === "DELETE" && req.url === "/v1/default/banks/test-bank/config") {
        sendJson(res, 200, { reset: true });
        return;
      }
      if (
        req.method === "GET" &&
        req.url ===
          "/v1/default/banks/test-bank/documents?q=session&tags=source%3Api&tags_match=all&limit=5&offset=1"
      ) {
        sendJson(res, 200, { items: [{ id: "doc-1", tags: ["source:pi"] }] });
        return;
      }
      if (req.method === "GET" && req.url === "/v1/default/banks/test-bank/documents/doc-1") {
        sendJson(res, 200, { id: "doc-1", content: "doc" });
        return;
      }
      if (req.method === "PATCH" && req.url === "/v1/default/banks/test-bank/documents/doc-1") {
        sendJson(res, 200, { id: "doc-1", tags: ["updated"] });
        return;
      }
      if (
        req.method === "GET" &&
        req.url === "/v1/default/banks/test-bank/entities?limit=5&offset=1"
      ) {
        sendJson(res, 200, { items: [{ id: "entity-1", text: "Alice" }] });
        return;
      }
      if (req.method === "GET" && req.url === "/v1/default/banks/test-bank/entities/entity-1") {
        sendJson(res, 200, { id: "entity-1", text: "Alice" });
        return;
      }
      if (
        req.method === "POST" &&
        req.url === "/v1/default/banks/test-bank/entities/entity-1/regenerate"
      ) {
        sendJson(res, 202, { operation_id: "entity-op" });
        return;
      }
      if (
        req.method === "GET" &&
        req.url ===
          "/v1/default/banks/test-bank/graph?type=world&q=alice&limit=7&tags=source%3Api&tags_match=any&document_id=doc-1&chunk_id=chunk-1"
      ) {
        sendJson(res, 200, { nodes: [{ id: "entity-1" }], edges: [] });
        return;
      }
      if (
        req.method === "GET" &&
        req.url === "/v1/default/banks/test-bank/entities/graph?limit=4&min_count=2"
      ) {
        sendJson(res, 200, { nodes: [{ id: "entity-1" }] });
        return;
      }
      if (
        req.method === "GET" &&
        req.url === "/v1/default/banks/test-bank/tags?q=source&source=memories&limit=5&offset=2"
      ) {
        sendJson(res, 200, { items: [{ tag: "source:pi" }] });
        return;
      }
      if (req.method === "PATCH" && req.url === "/v1/default/banks/test-bank") {
        sendJson(res, 200, { bank_id: "test-bank", name: "Updated" });
        return;
      }
      if (req.method === "PUT" && req.url === "/v1/default/banks/test-bank/profile") {
        sendJson(res, 200, { disposition: { skepticism: 1, literalism: 2, empathy: 3 } });
        return;
      }
      if (req.method === "POST" && req.url === "/v1/default/banks/test-bank/background") {
        sendJson(res, 200, { updated: true });
        return;
      }
      sendJson(res, 404, { detail: `unexpected ${req.method} ${req.url}` });
    });

    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("missing server address");
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  afterEach(async () => {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  });

  it("supports Pi fetch wrappers that reject Request objects", async () => {
    const originalFetch = globalThis.fetch;
    const strictFetch = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      if (input instanceof Request)
        throw new TypeError("Failed to parse URL from [object Request]");
      return originalFetch(input, init);
    });
    globalThis.fetch = strictFetch as typeof fetch;

    try {
      const client = createHindsightClient({
        ...DEFAULT_CONFIG,
        hindsight: { ...DEFAULT_CONFIG.hindsight, baseUrl },
      });

      await ensureProjectBank(client, "test-bank");
      await client.recall("test-bank", "query");
    } finally {
      globalThis.fetch = originalFetch;
    }

    expect(requests.map((request) => `${request.method} ${request.url}`)).toEqual([
      "GET /v1/default/banks/test-bank/profile",
      "PUT /v1/default/banks/test-bank",
      "POST /v1/default/banks/test-bank/memories/recall",
    ]);
    expect(strictFetch).toHaveBeenCalledWith(expect.any(String), expect.any(Object));
  });

  it("uses official client endpoints and Hindsight request fields", async () => {
    const client = createHindsightClient({
      ...DEFAULT_CONFIG,
      hindsight: { ...DEFAULT_CONFIG.hindsight, baseUrl },
    });

    await ensureProjectBank(client, "test-bank");
    await client.retain("test-bank", "raw content", {
      context: "ctx",
      tags: ["source:pi"],
      documentId: "pi-session:abc",
      updateMode: "append",
      async: true,
      metadata: { source: "test" },
      entities: [{ text: "Alice", type: "person" }],
    });
    await client.retain("test-bank", "scoped content", {
      context: "scoped ctx",
      tags: ["source:pi"],
      documentId: "pi-session:scoped",
      updateMode: "append",
      observationScopes: [["repo:abc"], ["bank:test-bank"]],
    });
    const recall = await client.recall("test-bank", "query", {
      tagGroups: [
        { tags: ["source:pi"], match: "any_strict" },
        { or: [{ tags: ["kind:decision"], match: "any_strict" }] },
      ],
      maxTokens: 123,
      budget: "low",
      queryTimestamp: "2024-01-01T00:00:00Z",
    });
    const reflection = await client.reflect("test-bank", "query", {
      budget: "low",
      maxTokens: 0,
      responseSchema: { type: "object", properties: { answer: { type: "string" } } },
      includeFacts: true,
      includeToolCalls: false,
      tagGroups: [{ tags: ["source:pi"], match: "any_strict" }],
    });
    const bankConfig = await client.getBankConfig?.("test-bank");
    const bankConfigUpdate = await client.updateBankConfig?.("test-bank", {
      retain_custom_instructions: "Write to db",
    });
    const bankConfigReset = await client.resetBankConfig?.("test-bank");
    const documents = await client.listDocuments?.("test-bank", {
      q: "session",
      tags: ["source:pi"],
      tagsMatch: "all",
      limit: 5,
      offset: 1,
    });
    const document = await client.getDocument?.("test-bank", "doc-1");
    const updatedDocument = await client.updateDocument?.("test-bank", "doc-1", {
      tags: ["updated"],
    });
    const entities = await client.listEntities?.("test-bank", { limit: 5, offset: 1 });
    const entity = await client.getEntity?.("test-bank", "entity-1");
    const regeneratedEntity = await client.regenerateEntity?.("test-bank", "entity-1");
    const graph = await client.getGraph?.("test-bank", {
      type: "world",
      q: "alice",
      limit: 7,
      tags: ["source:pi"],
      tagsMatch: "any",
      documentId: "doc-1",
      chunkId: "chunk-1",
    });
    const entityGraph = await client.getEntityGraph?.("test-bank", { limit: 4, minCount: 2 });
    const tags = await client.listTags?.("test-bank", {
      q: "source",
      source: "memories",
      limit: 5,
      offset: 2,
    });
    const bankProfileUpdate = await client.updateBankProfile?.("test-bank", {
      name: "Updated",
      reflectMission: "Reflect precisely",
    });
    const dispositionUpdate = await client.updateBankDisposition?.("test-bank", {
      skepticism: 1,
      literalism: 2,
      empathy: 3,
    });
    const backgroundUpdate = await client.addBankBackground?.("test-bank", {
      content: "Background",
      updateDisposition: true,
    });

    expect(recall).toEqual({ results: [{ text: "remembered fact" }] });
    expect(reflection).toEqual({ text: "reflection" });
    expect(bankConfig).toEqual({ config: { retain_custom_instructions: "Read from db" } });
    expect(bankConfigUpdate).toEqual({ updated: true });
    expect(bankConfigReset).toEqual({ reset: true });
    expect(documents).toEqual({ items: [{ id: "doc-1", tags: ["source:pi"] }] });
    expect(document).toEqual({ id: "doc-1", content: "doc" });
    expect(updatedDocument).toEqual({ id: "doc-1", tags: ["updated"] });
    expect(entities).toEqual({ items: [{ id: "entity-1", text: "Alice" }] });
    expect(entity).toEqual({ id: "entity-1", text: "Alice" });
    expect(regeneratedEntity).toEqual({ operation_id: "entity-op" });
    expect(graph).toEqual({ nodes: [{ id: "entity-1" }], edges: [] });
    expect(entityGraph).toEqual({ nodes: [{ id: "entity-1" }] });
    expect(tags).toEqual({ items: [{ tag: "source:pi" }] });
    expect(bankProfileUpdate).toEqual({ bank_id: "test-bank", name: "Updated" });
    expect(dispositionUpdate).toEqual({
      disposition: { skepticism: 1, literalism: 2, empathy: 3 },
    });
    expect(backgroundUpdate).toEqual({ updated: true });

    expect(requests.map((request) => `${request.method} ${request.url}`)).toEqual([
      "GET /v1/default/banks/test-bank/profile",
      "PUT /v1/default/banks/test-bank",
      "POST /v1/default/banks/test-bank/memories",
      "POST /v1/default/banks/test-bank/memories",
      "POST /v1/default/banks/test-bank/memories/recall",
      "POST /v1/default/banks/test-bank/reflect",
      "GET /v1/default/banks/test-bank/config",
      "PATCH /v1/default/banks/test-bank/config",
      "DELETE /v1/default/banks/test-bank/config",
      "GET /v1/default/banks/test-bank/documents?q=session&tags=source%3Api&tags_match=all&limit=5&offset=1",
      "GET /v1/default/banks/test-bank/documents/doc-1",
      "PATCH /v1/default/banks/test-bank/documents/doc-1",
      "GET /v1/default/banks/test-bank/entities?limit=5&offset=1",
      "GET /v1/default/banks/test-bank/entities/entity-1",
      "POST /v1/default/banks/test-bank/entities/entity-1/regenerate",
      "GET /v1/default/banks/test-bank/graph?type=world&q=alice&limit=7&tags=source%3Api&tags_match=any&document_id=doc-1&chunk_id=chunk-1",
      "GET /v1/default/banks/test-bank/entities/graph?limit=4&min_count=2",
      "GET /v1/default/banks/test-bank/tags?q=source&source=memories&limit=5&offset=2",
      "PATCH /v1/default/banks/test-bank",
      "PUT /v1/default/banks/test-bank/profile",
      "POST /v1/default/banks/test-bank/background",
    ]);

    expect(requests[2]?.body).toMatchObject({
      items: [
        {
          content: "raw content",
          context: "ctx",
          document_id: "pi-session:abc",
          update_mode: "append",
          tags: ["source:pi"],
          metadata: { source: "test" },
          entities: [{ text: "Alice", type: "person" }],
        },
      ],
      async: true,
    });
    expect(JSON.stringify(requests[2]?.body)).not.toContain("observation_scopes");
    expect(requests[3]?.body).toMatchObject({
      items: [
        {
          content: "scoped content",
          context: "scoped ctx",
          document_id: "pi-session:scoped",
          update_mode: "append",
          tags: ["source:pi"],
          observation_scopes: [["repo:abc"], ["bank:test-bank"]],
        },
      ],
    });
    expect(JSON.stringify(requests[3]?.body)).not.toContain("observationScopes");
    expect(requests[4]?.body).toMatchObject({
      query: "query",
      max_tokens: 123,
      budget: "low",
      query_timestamp: "2024-01-01T00:00:00Z",
      tag_groups: [
        { tags: ["source:pi"], match: "any_strict" },
        { or: [{ tags: ["kind:decision"], match: "any_strict" }] },
      ],
    });
    expect(requests[5]?.body).toMatchObject({
      query: "query",
      budget: "low",
      max_tokens: 0,
      response_schema: { type: "object", properties: { answer: { type: "string" } } },
      include: { facts: {}, tool_calls: null },
      tag_groups: [{ tags: ["source:pi"], match: "any_strict" }],
    });
    expect(requests[7]?.body).toEqual({
      updates: { retain_custom_instructions: "Write to db" },
    });
    expect(requests[11]?.body).toEqual({ tags: ["updated"] });
    expect(requests[18]?.body).toEqual({
      name: "Updated",
      reflect_mission: "Reflect precisely",
    });
    expect(requests[19]?.body).toEqual({
      disposition: { skepticism: 1, literalism: 2, empathy: 3 },
    });
    expect(requests[20]?.body).toEqual({ content: "Background", update_disposition: true });
  });
});
