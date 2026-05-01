import type { HindsightCapabilities, HindsightLikeClient, ResolvedConfig } from "./types.js";
import { flushRetain } from "./retain-queue.js";
import { type ProjectConfigPatchInput } from "./config-writer.js";
import { configureMemory, initMemoryConfig } from "./config-operations.js";
import { importMemoryProjectSessions, importMemorySession } from "./import-operations.js";

import { recallScopeTags } from "./banking.js";
import { stableSessionId } from "./session.js";
import { createMemoryIdentity, explicitRetainTags } from "./memory-identity.js";
import { expandObservationScopes } from "./observation-scopes.js";
import { retainDurably } from "./retain-durable.js";
import { readLastRecallSnapshot, resolveLastRecallPath } from "./recall-visibility.js";
import { pruneTranscriptRecallBlocks, scanTranscriptForRecallBlocks } from "./recall-cleanup.js";
import {
  getEffectiveSessionMemoryMode,
  readSessionMemoryMeta,
  type SessionMemoryMode,
} from "./session-memory-meta.js";
import {
  addMemorySessionTag,
  readMemorySession,
  removeMemorySessionTag,
  setMemorySessionMode,
  setMemorySessionRetain,
  setNextMemoryRetainOff,
} from "./session-operations.js";

export interface MemoryOperationsDeps {
  getClient(): HindsightLikeClient;
  getConfig(): ResolvedConfig;
  getProjectBankId(): string;
  getCapabilities?(): HindsightCapabilities | undefined;
  reloadConfig?(cwd: string): void;
}

export type ConfigureMemoryArgs = ProjectConfigPatchInput;

function recallTagsForBank(
  cwd: string,
  config: ResolvedConfig,
  projectBankId: string,
  bankId: string,
): string[] {
  return config.banks.global.enabled && bankId === config.banks.global.bankId
    ? ["source:pi"]
    : recallScopeTags(cwd);
}

export function createMemoryOperations(deps: MemoryOperationsDeps) {
  return {
    async recall(
      cwd: string,
      query: string,
      bank?: string,
      sessionFile?: string,
      queryTimestamp?: string,
    ) {
      const meta = await readSessionMemoryMeta(cwd, sessionFile);
      if (!getEffectiveSessionMemoryMode(meta).recall)
        throw new Error("Hindsight recall is disabled for this session");
      const config = deps.getConfig();
      const bankId = bank || deps.getProjectBankId();
      const result = await deps.getClient().recall(bankId, query, {
        budget: config.recall.budget,
        maxTokens: config.recall.maxTokens,
        ...(queryTimestamp || config.recall.queryTimestamp
          ? { queryTimestamp: queryTimestamp ?? config.recall.queryTimestamp }
          : {}),
        tags: recallTagsForBank(cwd, config, deps.getProjectBankId(), bankId),
        tagsMatch: "any_strict",
      });
      return { bankId, result };
    },

    async retainExplicit(args: {
      cwd: string;
      sessionFile?: string;
      content: string;
      context: string;
      bank?: string;
      tags?: string[];
      entities?: ResolvedConfig["retain"]["entities"];
    }) {
      const meta = await readSessionMemoryMeta(args.cwd, args.sessionFile);
      if (!getEffectiveSessionMemoryMode(meta).retain)
        throw new Error("Hindsight retain is disabled for this session");
      const config = deps.getConfig();
      const bankId = args.bank || deps.getProjectBankId();
      const tags = explicitRetainTags(args.cwd, args.sessionFile, [
        ...(args.tags ?? []),
        ...meta.tags,
      ]);
      const capabilities = deps.getCapabilities?.();
      const identity = createMemoryIdentity(args.cwd, config, args.sessionFile);
      const observationScopes = config.observations.enabled
        ? expandObservationScopes(config.observations.scopes, {
            ...identity,
            projectBankId: bankId,
          })
        : [];
      const result = await retainDurably({
        cwd: args.cwd,
        config,
        client: deps.getClient(),
        bankId,
        content: args.content,
        context: args.context,
        tags,
        updateMode: "append",
        documentId: `pi-explicit:${stableSessionId(args.sessionFile, args.cwd)}`,
        metadata: {
          cwd: args.cwd,
          ...(args.sessionFile ? { pi_session_file: args.sessionFile } : {}),
        },
        source: "tool",
        ...(observationScopes.length ? { observationScopes } : {}),
        ...(args.entities?.length ? { entities: args.entities } : {}),
        ...(capabilities ? { capabilities } : {}),
      });
      return { bankId, tags, ...result, queued: result.enqueued };
    },

    async configure(cwd: string, args: ConfigureMemoryArgs) {
      return configureMemory(cwd, args, deps);
    },

    async importSession(args: {
      sessionFile: string;
      cwd?: string;
      bank?: string;
      dryRun?: boolean;
      includeBranches?: ResolvedConfig["import"]["includeBranches"];
    }) {
      return importMemorySession(args, deps);
    },

    async importProjectSessions(args: {
      cwd: string;
      currentSessionFile?: string;
      searchDir?: string;
      bank?: string;
      dryRun?: boolean;
      includeBranches?: ResolvedConfig["import"]["includeBranches"];
    }) {
      return importMemoryProjectSessions(args, deps);
    },

    async reflect(
      cwd: string,
      query: string,
      context?: string,
      bank?: string,
      responseSchema?: Record<string, unknown>,
    ) {
      const config = deps.getConfig();
      const bankId = bank || deps.getProjectBankId();
      const result = await deps.getClient().reflect(bankId, query, {
        ...(context ? { context } : {}),
        budget: config.recall.budget,
        ...(responseSchema ? { responseSchema } : {}),
        tags: recallTagsForBank(cwd, config, deps.getProjectBankId(), bankId),
        tagsMatch: "any_strict",
      });
      return { bankId, result };
    },

    async init(cwd: string) {
      const result = await initMemoryConfig(cwd, deps);
      deps.reloadConfig?.(cwd);
      return result;
    },

    async session(cwd: string, sessionFile?: string) {
      return readMemorySession(cwd, sessionFile);
    },

    async setSessionMode(cwd: string, sessionFile: string | undefined, mode: SessionMemoryMode) {
      return setMemorySessionMode(cwd, sessionFile, mode);
    },

    async setSessionRetain(cwd: string, sessionFile: string | undefined, enabled: boolean) {
      return setMemorySessionRetain(cwd, sessionFile, enabled);
    },

    async setNextRetainOff(cwd: string, sessionFile: string | undefined) {
      return setNextMemoryRetainOff(cwd, sessionFile);
    },

    async addSessionTag(cwd: string, sessionFile: string | undefined, tag: string) {
      return addMemorySessionTag(cwd, sessionFile, tag);
    },

    async removeSessionTag(cwd: string, sessionFile: string | undefined, tag: string) {
      return removeMemorySessionTag(cwd, sessionFile, tag);
    },

    async lastRecall(cwd: string) {
      const config = deps.getConfig();
      const path = resolveLastRecallPath(cwd, config.recall.lastRecallPath);
      const snapshot = await readLastRecallSnapshot(cwd, config.recall.lastRecallPath);
      return { path, snapshot };
    },

    async recallCleanup(sessionFile: string, prune: boolean) {
      return prune
        ? pruneTranscriptRecallBlocks(sessionFile)
        : scanTranscriptForRecallBlocks(sessionFile);
    },

    async flush(cwd: string) {
      return flushRetain(cwd, deps.getConfig(), deps.getClient());
    },
  };
}

export type MemoryOperations = ReturnType<typeof createMemoryOperations>;
