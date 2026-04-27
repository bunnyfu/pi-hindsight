import { beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { enqueueRetainJob, readRetainQueue, resolveQueuePath } from "../extensions/queue.js";
import type { RetainJob } from "../extensions/types.js";

const mocked = vi.hoisted(() => ({
  client: {
    retain: vi.fn(async (..._args: unknown[]) => undefined),
    recall: vi.fn(async (..._args: unknown[]) => ({
      results: [{ text: "repo-specific remembered fact" }],
    })),
    reflect: vi.fn(async (..._args: unknown[]) => ({})),
    createBank: vi.fn(async (..._args: unknown[]) => undefined),
    getBankProfile: vi.fn(async (..._args: unknown[]) => ({})),
  },
  ensureProjectBank: vi.fn(async () => undefined),
  checkHindsight: vi.fn(async () => ({ ok: true })),
}));

vi.mock("../extensions/client.js", () => ({
  createHindsightClient: () => mocked.client,
  checkHindsight: mocked.checkHindsight,
}));

vi.mock("../extensions/bank-operations.js", () => ({
  ensureProjectBank: mocked.ensureProjectBank,
}));

describe("extension hooks", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocked.client.recall.mockImplementation(async (..._args: unknown[]) => ({
      results: [{ text: "repo-specific remembered fact" }],
    }));
    mocked.client.retain.mockImplementation(async (..._args: unknown[]) => undefined);
  });

  it("prepends recalled memory in context and keeps that block out of retained transcript content", async () => {
    const cwd = mkdtempSync(join(tmpdir(), "pi-hindsight-hooks-"));
    mkdirSync(join(cwd, ".git"));
    mkdirSync(join(cwd, ".pi"));
    writeFileSync(
      join(cwd, ".pi", "hindsight.json"),
      JSON.stringify({ hindsight: { baseUrl: "http://unused.test" } }),
    );
    const sessionFile = join(cwd, "session.jsonl");

    const handlers: Record<string, Array<(event: any, ctx: any) => Promise<any>>> = {};
    const pi = {
      on: vi.fn((name: string, handler: (event: any, ctx: any) => Promise<any>) => {
        handlers[name] = [...(handlers[name] ?? []), handler];
      }),
      registerTool: vi.fn(),
      registerCommand: vi.fn(),
    };
    const ctx = {
      cwd,
      ui: { setStatus: vi.fn(), notify: vi.fn() },
      sessionManager: { getSessionFile: () => sessionFile },
    };

    const { default: hindsightExtension } = await import("../extensions/index.js");
    hindsightExtension(pi as any);

    await handlers.session_start?.[0]?.({}, ctx);
    mocked.client.retain.mockClear();
    const originalMessages = [
      { role: "user", content: "What did we decide?", timestamp: Date.now() },
    ];
    const contextResult = await handlers.context?.[0]?.({ messages: originalMessages }, ctx);

    expect(contextResult.messages[0].content).toContain("<hindsight-memory>");
    expect(contextResult.messages[0].content).toContain("repo-specific remembered fact");
    expect(contextResult.messages.slice(1)).toEqual(originalMessages);

    await handlers.agent_end?.[0]?.(
      {
        messages: [
          contextResult.messages[0],
          ...originalMessages,
          { role: "assistant", content: "Decision still stands.", timestamp: Date.now() },
        ],
      },
      ctx,
    );

    const retainCalls = (mocked.client.retain.mock.calls as unknown[][]).filter(
      (call) => call[1] !== "Pi Hindsight append capability probe. Safe to ignore.",
    );
    expect(retainCalls).toHaveLength(1);
    const retainedContent = retainCalls[0]?.[1] as string;
    expect(retainedContent).toContain("What did we decide?");
    expect(retainedContent).toContain("Decision still stands.");
    expect(retainedContent).not.toContain("<hindsight-memory>");
    expect(retainedContent).not.toContain("repo-specific remembered fact");
  });

  it("uses repo scope for project recall and source scope for global recall", async () => {
    const cwd = mkdtempSync(join(tmpdir(), "pi-hindsight-hooks-"));
    mkdirSync(join(cwd, ".git"));
    mkdirSync(join(cwd, ".pi"));
    writeFileSync(
      join(cwd, ".pi", "hindsight.json"),
      JSON.stringify({ banks: { global: { enabled: true, bankId: "global-bank" } } }),
    );
    mocked.client.recall.mockImplementation(async (...args: unknown[]) => ({
      results: [{ text: `${String(args[0])} memory` }],
    }));

    const handlers: Record<string, Array<(event: any, ctx: any) => Promise<any>>> = {};
    const pi = {
      on: vi.fn((name: string, handler: (event: any, ctx: any) => Promise<any>) => {
        handlers[name] = [...(handlers[name] ?? []), handler];
      }),
      registerTool: vi.fn(),
      registerCommand: vi.fn(),
    };
    const ctx = {
      cwd,
      ui: { setStatus: vi.fn(), notify: vi.fn() },
      sessionManager: { getSessionFile: () => join(cwd, "session.jsonl") },
    };

    const { default: hindsightExtension } = await import("../extensions/index.js");
    hindsightExtension(pi as any);

    await handlers.session_start?.[0]?.({}, ctx);
    const contextResult = await handlers.context?.[0]?.(
      { messages: [{ role: "user", content: "What do I know?", timestamp: 1 }] },
      ctx,
    );

    expect(contextResult.messages[0].content).toContain("global-bank memory");
    expect(mocked.client.recall).toHaveBeenCalledTimes(2);
    expect(mocked.client.recall.mock.calls[0]?.[0]).toMatch(/^pi-project-/);
    expect(mocked.client.recall.mock.calls[0]?.[1]).toBe("What do I know?");
    expect(mocked.client.recall.mock.calls[0]?.[2]).toMatchObject({
      maxTokens: 800,
      types: ["world", "experience", "observation"],
      tags: [expect.stringMatching(/^repo:/)],
      tagsMatch: "any_strict",
    });
    expect(mocked.client.recall.mock.calls[1]?.[0]).toBe("global-bank");
    expect(mocked.client.recall.mock.calls[1]?.[2]).toMatchObject({
      tags: ["source:pi"],
      tagsMatch: "any_strict",
    });
  });

  it("honors append recall injection position", async () => {
    const cwd = mkdtempSync(join(tmpdir(), "pi-hindsight-hooks-"));
    mkdirSync(join(cwd, ".git"));
    mkdirSync(join(cwd, ".pi"));
    writeFileSync(
      join(cwd, ".pi", "hindsight.json"),
      JSON.stringify({ recall: { injectionPosition: "append" } }),
    );
    const handlers: Record<string, Array<(event: any, ctx: any) => Promise<any>>> = {};
    const pi = {
      on: vi.fn((name: string, handler: (event: any, ctx: any) => Promise<any>) => {
        handlers[name] = [...(handlers[name] ?? []), handler];
      }),
      registerTool: vi.fn(),
      registerCommand: vi.fn(),
    };
    const ctx = {
      cwd,
      ui: { setStatus: vi.fn(), notify: vi.fn() },
      sessionManager: { getSessionFile: () => join(cwd, "session.jsonl") },
    };

    const { default: hindsightExtension } = await import("../extensions/index.js");
    hindsightExtension(pi as any);
    await handlers.session_start?.[0]?.({}, ctx);
    const original = [{ role: "user", content: "q", timestamp: 1 }];
    const contextResult = await handlers.context?.[0]?.({ messages: original }, ctx);

    expect(contextResult.messages[0]).toEqual(original[0]);
    expect(contextResult.messages[1].role).toBe("system");
    expect(contextResult.messages[1].content).toContain("<hindsight-memory>");
  });

  it("explicit retain keeps base tags when extra tags are provided", async () => {
    const cwd = mkdtempSync(join(tmpdir(), "pi-hindsight-tools-"));
    mkdirSync(join(cwd, ".git"));
    const sessionFile = join(cwd, "session.jsonl");
    const tools: Record<string, any> = {};
    const pi = {
      on: vi.fn(),
      registerTool: vi.fn((tool: any) => {
        tools[tool.name] = tool;
      }),
      registerCommand: vi.fn(),
    };
    const ctx = {
      cwd,
      ui: { setStatus: vi.fn(), notify: vi.fn() },
      sessionManager: { getSessionFile: () => sessionFile },
    };

    const { default: hindsightExtension } = await import("../extensions/index.js");
    hindsightExtension(pi as any);
    await tools.hindsight_retain.execute(
      "tool-call",
      { content: "Remember config decision", context: "test", tags: ["decision:config"] },
      undefined,
      undefined,
      ctx,
    );

    const retainOptions = mocked.client.retain.mock.calls[0]?.[2] as { tags?: string[] };
    expect(retainOptions.tags).toEqual(
      expect.arrayContaining([
        "source:pi",
        "decision:config",
        expect.stringMatching(/^repo:/),
        expect.stringMatching(/^session:/),
      ]),
    );
  });

  it("does not emit retain status when retain is disabled", async () => {
    const cwd = mkdtempSync(join(tmpdir(), "pi-hindsight-hooks-"));
    mkdirSync(join(cwd, ".git"));
    mkdirSync(join(cwd, ".pi"));
    writeFileSync(
      join(cwd, ".pi", "hindsight.json"),
      JSON.stringify({ retain: { enabled: false } }),
    );
    const handlers: Record<string, Array<(event: any, ctx: any) => Promise<any>>> = {};
    const pi = {
      on: vi.fn((name: string, handler: (event: any, ctx: any) => Promise<any>) => {
        handlers[name] = [...(handlers[name] ?? []), handler];
      }),
      registerTool: vi.fn(),
      registerCommand: vi.fn(),
    };
    const ctx = {
      cwd,
      ui: { setStatus: vi.fn(), notify: vi.fn() },
      sessionManager: { getSessionFile: () => join(cwd, "session.jsonl") },
    };

    const { default: hindsightExtension } = await import("../extensions/index.js");
    hindsightExtension(pi as any);
    await handlers.session_start?.[0]?.({}, ctx);
    ctx.ui.setStatus.mockClear();

    await handlers.agent_end?.[0]?.(
      { messages: [{ role: "user", content: "hi", timestamp: 1 }] },
      ctx,
    );

    expect(mocked.client.retain).not.toHaveBeenCalled();
    expect(ctx.ui.setStatus).not.toHaveBeenCalled();
  });

  it("retains only new messages when agent_end receives overlapping transcripts", async () => {
    const cwd = mkdtempSync(join(tmpdir(), "pi-hindsight-hooks-"));
    mkdirSync(join(cwd, ".git"));
    mkdirSync(join(cwd, ".pi"));
    writeFileSync(
      join(cwd, ".pi", "hindsight.json"),
      JSON.stringify({ hindsight: { baseUrl: "http://unused.test" } }),
    );
    const handlers: Record<string, Array<(event: any, ctx: any) => Promise<any>>> = {};
    const pi = {
      on: vi.fn((name: string, handler: (event: any, ctx: any) => Promise<any>) => {
        handlers[name] = [...(handlers[name] ?? []), handler];
      }),
      registerTool: vi.fn(),
      registerCommand: vi.fn(),
    };
    const ctx = {
      cwd,
      ui: { setStatus: vi.fn(), notify: vi.fn() },
      sessionManager: { getSessionFile: () => join(cwd, "session.jsonl") },
    };
    const u1 = { role: "user", content: "u1", timestamp: 1 };
    const a1 = { role: "assistant", content: "a1", timestamp: 2 };
    const u2 = { role: "user", content: "u2", timestamp: 3 };
    const a2 = { role: "assistant", content: "a2", timestamp: 4 };

    const { default: hindsightExtension } = await import("../extensions/index.js");
    hindsightExtension(pi as any);
    await handlers.session_start?.[0]?.({}, ctx);
    mocked.client.retain.mockClear();
    await handlers.agent_end?.[0]?.({ messages: [u1, a1] }, ctx);
    await handlers.agent_end?.[0]?.({ messages: [u1, a1, u2, a2] }, ctx);

    const retainCalls = (mocked.client.retain.mock.calls as unknown[][]).filter(
      (call) => call[1] !== "Pi Hindsight append capability probe. Safe to ignore.",
    );
    expect(retainCalls).toHaveLength(2);
    const secondContent = retainCalls[1]?.[1] as string;
    expect(secondContent).toContain("u2");
    expect(secondContent).toContain("a2");
    expect(secondContent).not.toContain("u1");
    expect(secondContent).not.toContain("a1");
  });

  it("retains only new messages after lifecycle restart", async () => {
    const cwd = mkdtempSync(join(tmpdir(), "pi-hindsight-hooks-"));
    mkdirSync(join(cwd, ".git"));
    mkdirSync(join(cwd, ".pi"));
    writeFileSync(
      join(cwd, ".pi", "hindsight.json"),
      JSON.stringify({ hindsight: { baseUrl: "http://unused.test" } }),
    );
    const sessionFile = join(cwd, "session.jsonl");
    const u1 = { role: "user", content: "u1", timestamp: 1 };
    const a1 = { role: "assistant", content: "a1", timestamp: 2 };
    const u2 = { role: "user", content: "u2", timestamp: 3 };
    const a2 = { role: "assistant", content: "a2", timestamp: 4 };

    const { createMemoryLifecycle } = await import("../extensions/memory-lifecycle.js");
    const ctx = {
      cwd,
      ui: { setStatus: vi.fn(), notify: vi.fn() },
      sessionManager: { getSessionFile: () => sessionFile },
    };

    const first = createMemoryLifecycle(cwd);
    await first.initialize(ctx);
    mocked.client.retain.mockClear();
    await first.retain({ messages: [u1, a1] } as any, ctx);

    const second = createMemoryLifecycle(cwd);
    await second.initialize(ctx);
    await second.retain({ messages: [u1, a1, u2, a2] } as any, ctx);

    const retainCalls = (mocked.client.retain.mock.calls as unknown[][]).filter(
      (call) => call[1] !== "Pi Hindsight append capability probe. Safe to ignore.",
    );
    expect(retainCalls).toHaveLength(2);
    const secondContent = retainCalls[1]?.[1] as string;
    expect(secondContent).toContain("u2");
    expect(secondContent).toContain("a2");
    expect(secondContent).not.toContain("u1");
    expect(secondContent).not.toContain("a1");
  });

  it("uses configured shutdown flush bounds", async () => {
    const cwd = mkdtempSync(join(tmpdir(), "pi-hindsight-hooks-"));
    mkdirSync(join(cwd, ".git"));
    mkdirSync(join(cwd, ".pi"));
    writeFileSync(
      join(cwd, ".pi", "hindsight.json"),
      JSON.stringify({
        retain: { shutdownFlushMaxJobs: 2, shutdownFlushTimeoutMs: 1_000 },
        notifications: { startup: false },
      }),
    );
    const queuePath = resolveQueuePath(cwd, ".pi/hindsight/retain-queue.jsonl");
    const baseJob: RetainJob = {
      id: "1",
      bankId: "project-bank",
      createdAt: "now",
      documentId: "doc",
      updateMode: "append",
      item: { content: "raw", context: "ctx", async: true, tags: ["source:pi"] },
      retries: 0,
    };
    await enqueueRetainJob(queuePath, { ...baseJob, id: "1" });
    await enqueueRetainJob(queuePath, { ...baseJob, id: "2" });
    await enqueueRetainJob(queuePath, { ...baseJob, id: "3" });

    const { createMemoryLifecycle } = await import("../extensions/memory-lifecycle.js");
    const ctx = {
      cwd,
      ui: { setStatus: vi.fn(), notify: vi.fn() },
      sessionManager: { getSessionFile: () => join(cwd, "session.jsonl") },
    };

    const lifecycle = createMemoryLifecycle(cwd);
    await lifecycle.initialize(ctx);
    mocked.client.retain.mockClear();
    await lifecycle.shutdown(ctx);

    expect(mocked.client.retain).toHaveBeenCalledTimes(2);
    expect((await readRetainQueue(queuePath)).map((job) => job.id)).toEqual(["3"]);
  });

  it("emits optional recall and retain notifications", async () => {
    const cwd = mkdtempSync(join(tmpdir(), "pi-hindsight-hooks-"));
    mkdirSync(join(cwd, ".git"));
    mkdirSync(join(cwd, ".pi"));
    writeFileSync(
      join(cwd, ".pi", "hindsight.json"),
      JSON.stringify({
        notifications: { startup: false, recall: true, retain: true },
      }),
    );
    const handlers: Record<string, Array<(event: any, ctx: any) => Promise<any>>> = {};
    const pi = {
      on: vi.fn((name: string, handler: (event: any, ctx: any) => Promise<any>) => {
        handlers[name] = [...(handlers[name] ?? []), handler];
      }),
      registerTool: vi.fn(),
      registerCommand: vi.fn(),
    };
    const ctx = {
      cwd,
      ui: { setStatus: vi.fn(), notify: vi.fn() },
      sessionManager: { getSessionFile: () => join(cwd, "session.jsonl") },
    };

    const { default: hindsightExtension } = await import("../extensions/index.js");
    hindsightExtension(pi as any);
    await handlers.session_start?.[0]?.({}, ctx);
    await handlers.context?.[0]?.(
      { messages: [{ role: "user", content: "remember?", timestamp: 1 }] },
      ctx,
    );
    await handlers.agent_end?.[0]?.(
      { messages: [{ role: "assistant", content: "new decision", timestamp: 2 }] },
      ctx,
    );

    expect(ctx.ui.notify).toHaveBeenCalledWith(
      expect.stringMatching(/^Hindsight recalled 1 memory item from pi-project-/),
      "info",
    );
    expect(ctx.ui.notify).toHaveBeenCalledWith(
      expect.stringMatching(/^Hindsight retained 1 new message to pi-project-/),
      "info",
    );
  });
});
