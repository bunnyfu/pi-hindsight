import type { HindsightLikeClient, ResolvedConfig, RetainJob, UpdateMode } from "../types.js";
import { buildDurableRetainJob } from "../lifecycle/retain-durable.js";
import {
  enqueueRetainWithStats,
  flushRetain,
  readQueuedRetains,
  removeQueuedRetains,
} from "../lifecycle/retain-queue.js";
import {
  importRetainJobMatchesReference,
  staleImportRetainJobForReference,
} from "./import-queue-identity.js";

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
  await removeQueuedRetains(args.cwd, args.config, (queued) =>
    staleImportRetainJobForReference(queued, job),
  );
  const existing = await readQueuedRetains(args.cwd, args.config);
  const existingJob = existing.find((queued) => importRetainJobMatchesReference(queued, job));
  if (!existingJob) await enqueueRetainWithStats(args.cwd, args.config, job);
  const result = await flushRetain(args.cwd, args.config, args.client, {
    stopOnFirstFailure: true,
  });
  const queued = await readQueuedRetains(args.cwd, args.config);
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
