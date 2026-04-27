import { appendFile, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join } from "node:path";
import type { HindsightLikeClient, RetainJob } from "./types.js";

const queueLocks = new Map<string, Promise<void>>();

async function withQueueLock<T>(path: string, fn: () => Promise<T>): Promise<T> {
  const previous = queueLocks.get(path) ?? Promise.resolve();
  let release!: () => void;
  const next = new Promise<void>((resolve) => {
    release = resolve;
  });
  const lock = previous.catch(() => undefined).then(() => next);
  queueLocks.set(path, lock);
  await previous.catch(() => undefined);
  try {
    return await fn();
  } finally {
    release();
    if (queueLocks.get(path) === lock) queueLocks.delete(path);
  }
}

export function resolveQueuePath(cwd: string, queuePath: string): string {
  return isAbsolute(queuePath) ? queuePath : join(cwd, queuePath);
}

export async function enqueueRetainJob(path: string, job: RetainJob): Promise<void> {
  await withQueueLock(path, async () => {
    await mkdir(dirname(path), { recursive: true });
    await appendFile(path, `${JSON.stringify(job)}\n`, "utf8");
  });
}

export async function readRetainQueue(path: string): Promise<RetainJob[]> {
  try {
    const text = await readFile(path, "utf8");
    return text
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line) as RetainJob);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
}

export async function writeRetainQueue(path: string, jobs: RetainJob[]): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const tmp = `${path}.tmp`;
  await writeFile(
    tmp,
    jobs.map((job) => JSON.stringify(job)).join("\n") + (jobs.length ? "\n" : ""),
    "utf8",
  );
  await rename(tmp, path);
}

export type FlushRetainQueueOptions = {
  maxRetries?: number;
  maxJobs?: number;
  stopOnFirstFailure?: boolean;
};

export async function flushRetainQueue(
  path: string,
  client: HindsightLikeClient,
  options: FlushRetainQueueOptions | number = {},
): Promise<{ sent: number; remaining: number }> {
  return withQueueLock(path, async () => {
    const resolvedOptions: FlushRetainQueueOptions =
      typeof options === "number" ? { maxRetries: options } : options;
    const maxRetries = resolvedOptions.maxRetries ?? 5;
    const maxJobs = resolvedOptions.maxJobs ?? Number.POSITIVE_INFINITY;
    const jobs = await readRetainQueue(path);
    const remaining: RetainJob[] = [];
    let sent = 0;
    for (const [index, job] of jobs.entries()) {
      if (index >= maxJobs) {
        remaining.push(job, ...jobs.slice(index + 1));
        break;
      }
      try {
        await client.retain(job.bankId, job.item.content, {
          context: job.item.context,
          ...(job.item.timestamp ? { timestamp: job.item.timestamp } : {}),
          ...(job.item.metadata ? { metadata: job.item.metadata } : {}),
          ...(job.item.async !== undefined ? { async: job.item.async } : {}),
          ...(job.item.tags ? { tags: job.item.tags } : {}),
          documentId: job.documentId,
          updateMode: job.updateMode,
        });
        sent += 1;
      } catch (error) {
        const retries = job.retries + 1;
        const deadLetter = retries >= maxRetries;
        remaining.push({
          ...job,
          retries,
          lastError: error instanceof Error ? error.message : String(error),
          ...(deadLetter
            ? {
                lastError: `${error instanceof Error ? error.message : String(error)}; retry limit reached, retained in queue`,
              }
            : {}),
        });
        if (resolvedOptions.stopOnFirstFailure) {
          remaining.push(...jobs.slice(index + 1));
          break;
        }
      }
    }
    await writeRetainQueue(path, remaining);
    return { sent, remaining: remaining.length };
  });
}
