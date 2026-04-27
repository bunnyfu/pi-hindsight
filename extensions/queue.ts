import { appendFile, mkdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join } from "node:path";
import type { HindsightLikeClient, RetainJob } from "./types.js";

const queueLocks = new Map<string, Promise<void>>();

const LOCK_RETRY_MS = 25;
const LOCK_TIMEOUT_MS = 5_000;
const LOCK_STALE_MS = 30_000;

export const RETAIN_QUEUE_LOCK = {
  retryMs: LOCK_RETRY_MS,
  timeoutMs: LOCK_TIMEOUT_MS,
  staleMs: LOCK_STALE_MS,
};

export interface QueueLockOwner {
  pid?: number;
  acquiredAt?: string;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function writeQueueLockOwner(lockPath: string): Promise<void> {
  await writeFile(
    `${lockPath}/owner`,
    JSON.stringify({ pid: process.pid, acquiredAt: new Date().toISOString() }),
    "utf8",
  );
}

function startQueueLockHeartbeat(lockPath: string): NodeJS.Timeout {
  const heartbeatMs = Math.max(1, Math.min(5_000, Math.floor(RETAIN_QUEUE_LOCK.staleMs / 2)));
  const heartbeat = setInterval(() => {
    void writeQueueLockOwner(lockPath).catch(() => undefined);
  }, heartbeatMs);
  heartbeat.unref?.();
  return heartbeat;
}

export function isQueueLockOwnerStale(
  owner: QueueLockOwner | undefined,
  now = Date.now(),
  staleMs = RETAIN_QUEUE_LOCK.staleMs,
): boolean {
  if (!owner) return true;
  const acquiredAt = owner.acquiredAt ? Date.parse(owner.acquiredAt) : Number.NaN;
  return !Number.isFinite(acquiredAt) || now - acquiredAt > staleMs;
}

async function readQueueLockOwner(lockPath: string): Promise<QueueLockOwner | undefined> {
  try {
    return JSON.parse(await readFile(`${lockPath}/owner`, "utf8")) as QueueLockOwner;
  } catch {
    return undefined;
  }
}

async function isOwnerlessLockDirectoryStale(lockPath: string): Promise<boolean> {
  try {
    const info = await stat(lockPath);
    return Date.now() - info.mtimeMs > RETAIN_QUEUE_LOCK.staleMs;
  } catch {
    return true;
  }
}

async function acquireFileLock(path: string): Promise<() => Promise<void>> {
  const lockPath = `${path}.lock`;
  const started = Date.now();
  await mkdir(dirname(path), { recursive: true });
  while (true) {
    try {
      await mkdir(lockPath, { recursive: false });
      await writeQueueLockOwner(lockPath);
      const heartbeat = startQueueLockHeartbeat(lockPath);
      return async () => {
        clearInterval(heartbeat);
        await rm(lockPath, { recursive: true, force: true });
      };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      const owner = await readQueueLockOwner(lockPath);
      const stale = owner
        ? isQueueLockOwnerStale(owner)
        : await isOwnerlessLockDirectoryStale(lockPath);
      if (stale) {
        await rm(lockPath, { recursive: true, force: true });
        continue;
      }
      if (Date.now() - started > RETAIN_QUEUE_LOCK.timeoutMs)
        throw new Error(`Timed out waiting for retain queue lock ${lockPath}`);
      await sleep(RETAIN_QUEUE_LOCK.retryMs);
    }
  }
}

async function withQueueLock<T>(path: string, fn: () => Promise<T>): Promise<T> {
  const previous = queueLocks.get(path) ?? Promise.resolve();
  let release!: () => void;
  const next = new Promise<void>((resolve) => {
    release = resolve;
  });
  const lock = previous.catch(() => undefined).then(() => next);
  queueLocks.set(path, lock);
  await previous.catch(() => undefined);
  const releaseFileLock = await acquireFileLock(path);
  try {
    return await fn();
  } finally {
    try {
      await releaseFileLock();
    } finally {
      release();
      if (queueLocks.get(path) === lock) queueLocks.delete(path);
    }
  }
}

export function resolveQueuePath(cwd: string, queuePath: string): string {
  return isAbsolute(queuePath) ? queuePath : join(cwd, queuePath);
}

export function resolveDeadLetterQueuePath(path: string): string {
  return `${path}.dead.jsonl`;
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

export async function readDeadLetterQueue(path: string): Promise<RetainJob[]> {
  return readRetainQueue(resolveDeadLetterQueuePath(path));
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
  maxElapsedMs?: number;
};

export interface FlushRetainQueueResult {
  sent: number;
  remaining: number;
  deadLettered: number;
}

export async function flushRetainQueue(
  path: string,
  client: HindsightLikeClient,
  options: FlushRetainQueueOptions | number = {},
): Promise<FlushRetainQueueResult> {
  return withQueueLock(path, async () => {
    const resolvedOptions: FlushRetainQueueOptions =
      typeof options === "number" ? { maxRetries: options } : options;
    const maxRetries = resolvedOptions.maxRetries ?? 5;
    const maxJobs = resolvedOptions.maxJobs ?? Number.POSITIVE_INFINITY;
    const maxElapsedMs = resolvedOptions.maxElapsedMs ?? Number.POSITIVE_INFINITY;
    const started = Date.now();
    const jobs = await readRetainQueue(path);
    const remaining: RetainJob[] = [];
    const deadLetteredJobs: RetainJob[] = [];
    let sent = 0;
    for (const [index, job] of jobs.entries()) {
      if (index >= maxJobs || Date.now() - started >= maxElapsedMs) {
        remaining.push(...jobs.slice(index));
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
        const failedJob = {
          ...job,
          retries,
          lastError: error instanceof Error ? error.message : String(error),
          ...(deadLetter
            ? {
                deadLetteredAt: new Date().toISOString(),
                lastError: `${error instanceof Error ? error.message : String(error)}; retry limit reached, moved to dead-letter queue`,
              }
            : {}),
        };
        if (deadLetter) deadLetteredJobs.push(failedJob);
        else remaining.push(failedJob);
        if (resolvedOptions.stopOnFirstFailure) {
          remaining.push(...jobs.slice(index + 1));
          break;
        }
      }
    }
    await writeRetainQueue(path, remaining);
    for (const deadLetteredJob of deadLetteredJobs) {
      await enqueueRetainJob(resolveDeadLetterQueuePath(path), deadLetteredJob);
    }
    return { sent, remaining: remaining.length, deadLettered: deadLetteredJobs.length };
  });
}
