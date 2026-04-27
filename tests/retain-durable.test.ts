import { describe, expect, it } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DEFAULT_CONFIG } from "../extensions/config.js";
import { createMemoryOperations } from "../extensions/memory-operations.js";
import { flushRetainQueue, readRetainQueue, resolveQueuePath } from "../extensions/queue.js";
import type { HindsightLikeClient, ResolvedConfig } from "../extensions/types.js";

function testConfig(queuePath = ".pi/hindsight/q.jsonl"): ResolvedConfig {
  return {
    ...DEFAULT_CONFIG,
    retain: { ...DEFAULT_CONFIG.retain, queuePath, redactSecrets: true },
  };
}

function client(retain: HindsightLikeClient["retain"]): HindsightLikeClient {
  return {
    retain,
    recall: async () => [],
    reflect: async () => ({}),
  };
}

describe("durable explicit retain", () => {
  it("queues explicit retain when Hindsight is down", async () => {
    const cwd = mkdtempSync(join(tmpdir(), "pi-hindsight-retain-"));
    const config = testConfig();
    const operations = createMemoryOperations({
      getClient: () =>
        client(async () => {
          throw new Error("down");
        }),
      getConfig: () => config,
      getProjectBankId: () => "project-bank",
    });

    const result = await operations.retainExplicit({
      cwd,
      sessionFile: "/tmp/session.jsonl",
      content: "Durable fact with API_KEY=super-secret",
      context: "unit test explicit retain",
      tags: ["decision:test"],
    });

    expect(result).toMatchObject({
      bankId: "project-bank",
      enqueued: true,
      queued: true,
      sent: 0,
      remaining: 1,
      deadLettered: 0,
    });
    expect(result.tags).toEqual(expect.arrayContaining(["source:pi", "decision:test"]));

    const queued = await readRetainQueue(resolveQueuePath(cwd, config.retain.queuePath));
    expect(queued).toHaveLength(1);
    expect(queued[0]).toMatchObject({
      bankId: "project-bank",
      updateMode: "append",
      retries: 1,
      item: {
        context: "unit test explicit retain",
        async: true,
        metadata: {
          source: "pi-hindsight",
          retainSource: "tool",
          cwd,
          pi_session_file: "/tmp/session.jsonl",
        },
      },
    });
    expect(queued[0]?.documentId).toMatch(/^pi-explicit:/);
    expect(queued[0]?.item.content).toContain("Durable fact");
    expect(queued[0]?.item.content).not.toContain("super-secret");
    expect(queued[0]?.item.tags).toEqual(expect.arrayContaining(["source:pi", "decision:test"]));
  });

  it("flushes queued explicit retain later", async () => {
    const cwd = mkdtempSync(join(tmpdir(), "pi-hindsight-retain-"));
    const config = testConfig();
    const operations = createMemoryOperations({
      getClient: () =>
        client(async () => {
          throw new Error("down");
        }),
      getConfig: () => config,
      getProjectBankId: () => "project-bank",
    });

    await operations.retainExplicit({
      cwd,
      content: "Decision: queue first.",
      context: "unit test explicit retain",
    });

    const calls: unknown[] = [];
    const queuePath = resolveQueuePath(cwd, config.retain.queuePath);
    const result = await flushRetainQueue(
      queuePath,
      client(async (...args: unknown[]) => {
        calls.push(args);
      }),
    );

    expect(result).toMatchObject({ sent: 1, remaining: 0, deadLettered: 0 });
    expect(await readRetainQueue(queuePath)).toHaveLength(0);
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject([
      "project-bank",
      "Decision: queue first.",
      {
        context: "unit test explicit retain",
        async: true,
        updateMode: "append",
      },
    ]);
  });

  it("refuses explicit append retain when known unsupported and fallback is error", async () => {
    const cwd = mkdtempSync(join(tmpdir(), "pi-hindsight-retain-"));
    const config = testConfig();
    const operations = createMemoryOperations({
      getClient: () => client(async () => undefined),
      getConfig: () => config,
      getProjectBankId: () => "project-bank",
      getCapabilities: () => ({ appendUpdateMode: false, checkedAt: "now" }),
    });

    await expect(
      operations.retainExplicit({
        cwd,
        content: "Decision: no overwrite.",
        context: "unit test explicit retain",
      }),
    ).rejects.toThrow(/append update mode is unsupported/);
    expect(await readRetainQueue(resolveQueuePath(cwd, config.retain.queuePath))).toHaveLength(0);
  });

  it("uses per-delta explicit documents when append is unsupported and fallback is configured", async () => {
    const cwd = mkdtempSync(join(tmpdir(), "pi-hindsight-retain-"));
    const config: ResolvedConfig = {
      ...testConfig(),
      retain: { ...testConfig().retain, appendFallback: "per-turn-documents" },
    };
    const operations = createMemoryOperations({
      getClient: () =>
        client(async () => {
          throw new Error("down");
        }),
      getConfig: () => config,
      getProjectBankId: () => "project-bank",
      getCapabilities: () => ({ appendUpdateMode: false, checkedAt: "now" }),
    });

    await operations.retainExplicit({
      cwd,
      content: "Decision: use per-delta docs.",
      context: "unit test explicit retain",
    });

    const queued = await readRetainQueue(resolveQueuePath(cwd, config.retain.queuePath));
    expect(queued).toHaveLength(1);
    expect(queued[0]?.documentId).toMatch(/^pi-explicit:.*:delta:/);
    expect(queued[0]?.updateMode).toBe("replace");
  });

  it("sends explicit retain immediately after enqueue when Hindsight is up", async () => {
    const cwd = mkdtempSync(join(tmpdir(), "pi-hindsight-retain-"));
    const config = testConfig();
    const calls: unknown[] = [];
    const operations = createMemoryOperations({
      getClient: () =>
        client(async (...args: unknown[]) => {
          calls.push(args);
        }),
      getConfig: () => config,
      getProjectBankId: () => "project-bank",
    });

    const result = await operations.retainExplicit({
      cwd,
      content: "Decision: flush now.",
      context: "unit test explicit retain",
    });

    expect(result).toMatchObject({ enqueued: true, sent: 1, remaining: 0, deadLettered: 0 });
    expect(await readRetainQueue(resolveQueuePath(cwd, config.retain.queuePath))).toHaveLength(0);
    expect(calls).toHaveLength(1);
  });
});
