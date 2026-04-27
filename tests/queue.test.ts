import { describe, expect, it } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  enqueueRetainJob,
  flushRetainQueue,
  readDeadLetterQueue,
  readRetainQueue,
  resolveDeadLetterQueuePath,
  resolveQueuePath,
} from "../extensions/queue.js";
import type { RetainJob } from "../extensions/types.js";

const job: RetainJob = {
  id: "1",
  bankId: "b",
  createdAt: "now",
  documentId: "doc",
  updateMode: "append",
  item: { content: "raw", context: "ctx", async: true, tags: ["source:pi"] },
  retries: 0,
};

describe("retain queue", () => {
  it("persists and flushes jobs", async () => {
    const path = join(mkdtempSync(join(tmpdir(), "pi-hindsight-q-")), "q.jsonl");
    await enqueueRetainJob(path, job);
    expect(await readRetainQueue(path)).toHaveLength(1);
    const calls: unknown[] = [];
    const result = await flushRetainQueue(path, {
      retain: async (...args: unknown[]) => {
        calls.push(args);
      },
      recall: async () => [],
      reflect: async () => ({}),
    });
    expect(result.sent).toBe(1);
    expect(await readRetainQueue(path)).toHaveLength(0);
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject(["b", "raw", { async: true }]);
  });

  it("moves exhausted failed jobs to the dead-letter queue", async () => {
    const path = join(mkdtempSync(join(tmpdir(), "pi-hindsight-q-")), "q.jsonl");
    await enqueueRetainJob(path, job);
    const result = await flushRetainQueue(
      path,
      {
        retain: async () => {
          throw new Error("down");
        },
        recall: async () => [],
        reflect: async () => ({}),
      },
      1,
    );
    expect(result).toMatchObject({ sent: 0, remaining: 0, deadLettered: 1 });
    expect(await readRetainQueue(path)).toHaveLength(0);
    const dead = await readDeadLetterQueue(path);
    expect(dead).toHaveLength(1);
    expect(dead[0]?.retries).toBe(1);
    expect(dead[0]?.lastError).toContain("moved to dead-letter queue");
    expect(dead[0]?.deadLetteredAt).toBeDefined();
  });

  it("can bound shutdown flushing to avoid blocking session switches", async () => {
    const path = join(mkdtempSync(join(tmpdir(), "pi-hindsight-q-")), "q.jsonl");
    await enqueueRetainJob(path, { ...job, id: "1" });
    await enqueueRetainJob(path, { ...job, id: "2" });
    await enqueueRetainJob(path, { ...job, id: "3" });
    const calls: unknown[] = [];
    const result = await flushRetainQueue(
      path,
      {
        retain: async (...args: unknown[]) => {
          calls.push(args);
        },
        recall: async () => [],
        reflect: async () => ({}),
      },
      { maxJobs: 1 },
    );
    expect(result.sent).toBe(1);
    expect(calls).toHaveLength(1);
    expect((await readRetainQueue(path)).map((item) => item.id)).toEqual(["2", "3"]);
  });

  it("stops shutdown flushing after first failure", async () => {
    const path = join(mkdtempSync(join(tmpdir(), "pi-hindsight-q-")), "q.jsonl");
    await enqueueRetainJob(path, { ...job, id: "1" });
    await enqueueRetainJob(path, { ...job, id: "2" });
    const result = await flushRetainQueue(
      path,
      {
        retain: async () => {
          throw new Error("down");
        },
        recall: async () => [],
        reflect: async () => ({}),
      },
      { stopOnFirstFailure: true },
    );
    expect(result.sent).toBe(0);
    const remaining = await readRetainQueue(path);
    expect(remaining.map((item) => item.id)).toEqual(["1", "2"]);
    expect(remaining[0]?.retries).toBe(1);
    expect(remaining[1]?.retries).toBe(0);
  });

  it("does not lose jobs appended while a flush is in progress", async () => {
    const path = join(mkdtempSync(join(tmpdir(), "pi-hindsight-q-")), "q.jsonl");
    await enqueueRetainJob(path, { ...job, id: "1" });
    let releaseRetain!: () => void;
    const retainStarted = new Promise<void>((resolve) => {
      releaseRetain = resolve;
    });
    let retainEntered!: () => void;
    const retainEnteredPromise = new Promise<void>((resolve) => {
      retainEntered = resolve;
    });

    const flush = flushRetainQueue(path, {
      retain: async () => {
        retainEntered();
        await retainStarted;
      },
      recall: async () => [],
      reflect: async () => ({}),
    });
    await retainEnteredPromise;
    const enqueue = enqueueRetainJob(path, { ...job, id: "2" });
    releaseRetain();

    await Promise.all([flush, enqueue]);
    expect((await readRetainQueue(path)).map((item) => item.id)).toEqual(["2"]);
  });

  it("resolves relative queue paths against cwd", () => {
    expect(resolveQueuePath("/repo", ".pi/hindsight/q.jsonl")).toBe(
      join("/repo", ".pi/hindsight/q.jsonl"),
    );
    expect(resolveQueuePath("/repo", "/tmp/q.jsonl")).toBe("/tmp/q.jsonl");
    expect(resolveDeadLetterQueuePath("/tmp/q.jsonl")).toBe("/tmp/q.jsonl.dead.jsonl");
  });
});
