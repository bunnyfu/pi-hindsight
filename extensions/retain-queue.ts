import type { HindsightLikeClient, RetainJob, ResolvedConfig } from "./types.js";
import {
  enqueueRetainJob,
  enqueueRetainJobWithStats,
  flushRetainQueue,
  readRetainQueue,
  resolveQueuePath,
  summarizeRetainQueue,
} from "./queue.js";

export function retainQueuePath(cwd: string, config: ResolvedConfig): string {
  return resolveQueuePath(cwd, config.retain.queuePath);
}

export async function enqueueRetain(
  cwd: string,
  config: ResolvedConfig,
  job: RetainJob,
): Promise<void> {
  await enqueueRetainJob(retainQueuePath(cwd, config), job);
}

export async function enqueueRetainWithStats(cwd: string, config: ResolvedConfig, job: RetainJob) {
  return enqueueRetainJobWithStats(retainQueuePath(cwd, config), job);
}

export async function flushRetain(
  cwd: string,
  config: ResolvedConfig,
  client: HindsightLikeClient,
  options?: Parameters<typeof flushRetainQueue>[2],
) {
  return flushRetainQueue(retainQueuePath(cwd, config), client, options);
}

export async function readQueuedRetains(cwd: string, config: ResolvedConfig): Promise<RetainJob[]> {
  return readRetainQueue(retainQueuePath(cwd, config));
}

export async function summarizeRetain(cwd: string, config: ResolvedConfig) {
  return summarizeRetainQueue(retainQueuePath(cwd, config));
}
