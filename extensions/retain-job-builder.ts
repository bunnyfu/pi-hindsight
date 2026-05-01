import { randomUUID } from "node:crypto";
import type { HindsightCapabilities, ResolvedConfig, RetainJob, UpdateMode } from "./types.js";
import { redactSecrets } from "./sanitize.js";
import { resolveRetainDocumentTarget } from "./capabilities.js";

export interface RetainJobBuildArgs {
  config: ResolvedConfig;
  bankId: string;
  content: string;
  context: string;
  tags: string[];
  documentId: string;
  updateMode: UpdateMode;
  metadata?: Record<string, string>;
  timestamp?: string;
  observationScopes?: string[][];
  entities?: RetainJob["item"]["entities"];
  capabilities?: HindsightCapabilities;
  async?: boolean;
}

export function buildRetainJob(args: RetainJobBuildArgs): RetainJob {
  const content = args.config.retain.redactSecrets ? redactSecrets(args.content) : args.content;
  const target = resolveRetainDocumentTarget({
    config: args.config,
    ...(args.capabilities ? { capabilities: args.capabilities } : {}),
    documentId: args.documentId,
    updateMode: args.updateMode,
  });
  return {
    id: randomUUID(),
    bankId: args.bankId,
    createdAt: new Date().toISOString(),
    documentId: target.documentId,
    updateMode: target.updateMode,
    item: {
      content,
      context: args.context,
      timestamp: args.timestamp ?? new Date().toISOString(),
      async: args.async ?? args.config.retain.async,
      ...((args.entities?.length ?? args.config.retain.entities.length)
        ? { entities: [...args.config.retain.entities, ...(args.entities ?? [])] }
        : {}),
      tags: args.tags,
      ...(args.metadata ? { metadata: args.metadata } : {}),
      ...(args.observationScopes?.length ? { observationScopes: args.observationScopes } : {}),
    },
    retries: 0,
  };
}
