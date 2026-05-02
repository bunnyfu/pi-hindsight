import type { HindsightLikeClient, ResolvedConfig, RetainJob, UpdateMode } from "./types.js";
import { buildDurableRetainJob } from "./retain-durable.js";
import { enqueueRetainWithStats, flushRetain, readQueuedRetains } from "./retain-queue.js";

export interface ImportRetainDeliveryArgs {
  cwd: string;
  config: ResolvedConfig;
  client: HindsightLikeClient;
  bankId: string;
  content: string;
  context: string;
  documentId: string;
  updateMode: UpdateMode;
  tags: string[];
  metadata?: Record<string, string>;
  observationScopes?: string[][];
}

export interface ImportRetainDeliveryResult {
  queueJobId: string;
  enqueued: boolean;
  delivered: boolean;
  sent: number;
  remaining: number;
  deadLettered: number;
}

function stillQueued(jobs: RetainJob[], jobId: string): boolean {
  return jobs.some((job) => job.id === jobId);
}

export async function deliverImportRetain(
  args: ImportRetainDeliveryArgs,
): Promise<ImportRetainDeliveryResult> {
  const existing = await readQueuedRetains(args.cwd, args.config).catch(() => []);
  const existingJob = existing.find((queued) => queued.documentId === args.documentId);
  const job = buildDurableRetainJob({
    cwd: args.cwd,
    config: args.config,
    bankId: args.bankId,
    content: args.content,
    context: args.context,
    documentId: args.documentId,
    updateMode: args.updateMode,
    tags: args.tags,
    source: "import",
    ...(args.metadata ? { metadata: args.metadata } : {}),
    ...(args.observationScopes?.length ? { observationScopes: args.observationScopes } : {}),
  });
  if (!existingJob) await enqueueRetainWithStats(args.cwd, args.config, job);
  const result = await flushRetain(args.cwd, args.config, args.client, {
    stopOnFirstFailure: true,
  });
  const queued = await readQueuedRetains(args.cwd, args.config).catch(() => []);
  const queueJobId = existingJob?.id ?? job.id;
  return {
    queueJobId,
    enqueued: true,
    delivered: !stillQueued(queued, queueJobId),
    sent: result.sent,
    remaining: result.remaining,
    deadLettered: result.deadLettered,
  };
}
