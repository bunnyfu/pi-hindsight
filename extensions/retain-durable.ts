import { randomUUID } from "node:crypto";
import type { HindsightLikeClient, ResolvedConfig, RetainJob, UpdateMode } from "./types.js";
import { enqueueRetainJob, flushRetainQueue, resolveQueuePath } from "./queue.js";
import { redactSecrets } from "./sanitize.js";

export type DurableRetainSource = "auto" | "tool" | "command" | "import";

export interface RetainDurablyArgs {
  cwd: string;
  config: ResolvedConfig;
  client: HindsightLikeClient;
  bankId: string;
  content: string;
  context: string;
  tags: string[];
  documentId: string;
  updateMode: UpdateMode;
  metadata?: Record<string, string>;
  source: DurableRetainSource;
  timestamp?: string;
}

export interface RetainDurablyResult {
  enqueued: boolean;
  sent: number;
  remaining: number;
  deadLettered: number;
}

export function buildDurableRetainJob(args: Omit<RetainDurablyArgs, "client">): RetainJob {
  const content = args.config.retain.redactSecrets ? redactSecrets(args.content) : args.content;
  return {
    id: randomUUID(),
    bankId: args.bankId,
    createdAt: new Date().toISOString(),
    documentId: args.documentId,
    updateMode: args.updateMode,
    item: {
      content,
      context: args.context,
      timestamp: args.timestamp ?? new Date().toISOString(),
      async: args.config.retain.async,
      tags: args.tags,
      metadata: {
        source: "pi-hindsight",
        retainSource: args.source,
        ...args.metadata,
      },
    },
    retries: 0,
  };
}

export async function retainDurably(args: RetainDurablyArgs): Promise<RetainDurablyResult> {
  const queuePath = resolveQueuePath(args.cwd, args.config.retain.queuePath);
  await enqueueRetainJob(queuePath, buildDurableRetainJob(args));
  const result = await flushRetainQueue(queuePath, args.client);
  return { enqueued: true, ...result };
}
