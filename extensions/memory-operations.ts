import type { ExtensionCommandContext } from "@mariozechner/pi-coding-agent";
import type { HindsightCapabilities, HindsightLikeClient, ResolvedConfig } from "./types.js";
import { checkHindsight } from "./client.js";
import { readRetainQueue, flushRetainQueue, resolveQueuePath } from "./queue.js";
import { formatDebugReport, safeConfig } from "./diagnostics.js";
import {
  buildProjectConfigPatch,
  writeProjectConfig,
  type ProjectConfigPatchInput,
} from "./config-writer.js";
import { importPiSession } from "./import-sessions.js";
import {
  importManifestSummary,
  readImportManifest,
  resolveImportManifestPath,
} from "./import-manifest.js";
import { recallScopeTags } from "./banking.js";
import { stableSessionId } from "./session.js";
import { explicitRetainTags } from "./memory-identity.js";
import { retainDurably } from "./retain-durable.js";

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
    async recall(cwd: string, query: string, bank?: string) {
      const config = deps.getConfig();
      const bankId = bank || deps.getProjectBankId();
      const result = await deps.getClient().recall(bankId, query, {
        budget: config.recall.budget,
        maxTokens: config.recall.maxTokens,
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
    }) {
      const config = deps.getConfig();
      const bankId = args.bank || deps.getProjectBankId();
      const tags = explicitRetainTags(args.cwd, args.sessionFile, args.tags);
      const capabilities = deps.getCapabilities?.();
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
        ...(capabilities ? { capabilities } : {}),
      });
      return { bankId, tags, ...result, queued: result.enqueued };
    },

    async configure(cwd: string, args: ConfigureMemoryArgs) {
      const projectBankId = args.projectBankId || deps.getProjectBankId();
      const patch = buildProjectConfigPatch({ ...args, projectBankId });
      const result = await writeProjectConfig(cwd, patch);
      deps.reloadConfig?.(cwd);
      return { ...result, projectBankId };
    },

    async importSession(args: { sessionFile: string; bank?: string }) {
      const bankId = args.bank || deps.getProjectBankId();
      const result = await importPiSession({
        sessionFile: args.sessionFile,
        bankId,
        client: deps.getClient(),
        config: deps.getConfig(),
      });
      return { bankId, ...result };
    },

    async reflect(cwd: string, query: string, context?: string, bank?: string) {
      const config = deps.getConfig();
      const bankId = bank || deps.getProjectBankId();
      const result = await deps.getClient().reflect(bankId, query, {
        ...(context ? { context } : {}),
        budget: config.recall.budget,
        tags: recallTagsForBank(cwd, config, deps.getProjectBankId(), bankId),
        tagsMatch: "any_strict",
      });
      return { bankId, result };
    },

    async status(cwd: string) {
      const config = deps.getConfig();
      const [queue, manifest] = await Promise.all([
        readRetainQueue(resolveQueuePath(cwd, config.retain.queuePath)),
        readImportManifest(resolveImportManifestPath(cwd, config.import.manifestPath)),
      ]);
      return {
        config,
        bankId: deps.getProjectBankId(),
        queueLength: queue.length,
        imports: importManifestSummary(manifest),
      };
    },

    async doctor(cwd: string) {
      const config = deps.getConfig();
      const [health, queue, manifest] = await Promise.all([
        checkHindsight(deps.getClient(), deps.getProjectBankId()),
        readRetainQueue(resolveQueuePath(cwd, config.retain.queuePath)),
        readImportManifest(resolveImportManifestPath(cwd, config.import.manifestPath)),
      ]);
      return {
        health,
        ...(deps.getCapabilities?.() ? { capabilities: deps.getCapabilities() } : {}),
        queueLength: queue.length,
        imports: importManifestSummary(manifest),
      };
    },

    config() {
      return safeConfig(deps.getConfig());
    },

    async debug(ctx: ExtensionCommandContext) {
      const config = deps.getConfig();
      const [queue, health] = await Promise.all([
        readRetainQueue(resolveQueuePath(ctx.cwd, config.retain.queuePath)),
        checkHindsight(deps.getClient(), deps.getProjectBankId()),
      ]);
      const manifestPath = resolveImportManifestPath(ctx.cwd, config.import.manifestPath);
      const manifest = await readImportManifest(manifestPath);
      const imports = importManifestSummary(manifest);
      const sessionFile = ctx.sessionManager.getSessionFile?.();
      const capabilities = deps.getCapabilities?.();
      return {
        health,
        report: formatDebugReport({
          cwd: ctx.cwd,
          ...(sessionFile ? { sessionFile } : {}),
          projectBankId: deps.getProjectBankId(),
          config,
          queueLength: queue.length,
          importManifestPath: manifestPath,
          importCount: imports.count,
          ...(imports.latest ? { latestImport: imports.latest } : {}),
          health,
          ...(capabilities ? { capabilities } : {}),
        }),
      };
    },

    async init(cwd: string) {
      const result = await writeProjectConfig(
        cwd,
        buildProjectConfigPatch({
          projectBankId: deps.getProjectBankId(),
          baseUrl: deps.getConfig().hindsight.baseUrl,
        }),
      );
      deps.reloadConfig?.(cwd);
      return { ...result, projectBankId: deps.getProjectBankId() };
    },

    async flush(cwd: string) {
      return flushRetainQueue(
        resolveQueuePath(cwd, deps.getConfig().retain.queuePath),
        deps.getClient(),
      );
    },
  };
}

export type MemoryOperations = ReturnType<typeof createMemoryOperations>;
