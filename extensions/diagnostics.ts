import type { ResolvedConfig } from "./types.js";
import { baseTags, findRepoRoot } from "./banking.js";
import { stableSessionId } from "./session.js";
import type { ImportManifestEntry } from "./import-manifest.js";
import {
  formatHindsightActivity,
  formatHindsightStatus,
  type HindsightActivity,
} from "./status.js";

export interface DebugReportArgs {
  cwd: string;
  sessionFile?: string;
  projectBankId: string;
  config: ResolvedConfig;
  queueLength: number;
  importManifestPath?: string;
  importCount?: number;
  latestImport?: ImportManifestEntry;
  health?: { ok: boolean; error?: string };
  activity?: HindsightActivity;
  memoryCount?: number;
  queueRemaining?: number;
}

export function bankSelectionMessage(projectBankId: string, config: ResolvedConfig): string {
  if (config.banks.project.bankId) {
    return `Hindsight bank configured: ${projectBankId}`;
  }
  return `Hindsight bank auto-selected: ${projectBankId}. Override with PI_HINDSIGHT_PROJECT_BANK_ID or .pi/hindsight.json banks.project.bankId.`;
}

export function safeConfig(config: ResolvedConfig): ResolvedConfig {
  return {
    ...config,
    hindsight: {
      ...config.hindsight,
      ...(config.hindsight.apiKey ? { apiKey: "[set]" } : {}),
    },
  };
}

export function formatDebugReport(args: DebugReportArgs): string {
  const sessionId = stableSessionId(args.sessionFile, args.cwd);
  const tags = baseTags(args.cwd, sessionId);
  const health = args.health
    ? args.health.ok
      ? "reachable"
      : `unreachable: ${args.health.error}`
    : "not checked";
  const activity = args.activity ?? "idle";
  return JSON.stringify(
    {
      enabled: args.config.enabled,
      health,
      cwd: args.cwd,
      repoRoot: findRepoRoot(args.cwd),
      sessionFile: args.sessionFile ?? null,
      sessionId,
      projectBankId: args.projectBankId,
      projectBankSelection: args.config.banks.project.bankId
        ? "configured"
        : args.config.banks.project.derive,
      overrideProjectBankId:
        "Set PI_HINDSIGHT_PROJECT_BANK_ID or .pi/hindsight.json banks.project.bankId",
      globalBankId: args.config.banks.global.enabled
        ? (args.config.banks.global.bankId ?? null)
        : null,
      tags,
      queuePath: args.config.retain.queuePath,
      queueLength: args.queueLength,
      imports: {
        manifestPath: args.importManifestPath ?? args.config.import.manifestPath,
        count: args.importCount ?? 0,
        latest: args.latestImport
          ? {
              documentId: args.latestImport.documentId,
              sourceFile: args.latestImport.sourceFile,
              importedAt: args.latestImport.importedAt,
              messageCount: args.latestImport.messageCount,
              leafId: args.latestImport.leafId,
              sessionId: args.latestImport.sessionId,
              contentHash: args.latestImport.contentHash,
            }
          : null,
      },
      status: args.config.status,
      statusPreview:
        formatHindsightStatus(args.config, {
          cwd: args.cwd,
          projectBankId: args.projectBankId,
          activity,
          ...(args.memoryCount !== undefined ? { memoryCount: args.memoryCount } : {}),
          ...(args.queueRemaining !== undefined ? { queueRemaining: args.queueRemaining } : {}),
        }) ?? null,
      activity: formatHindsightActivity(activity, args.memoryCount, args.queueRemaining),
      recall: {
        enabled: args.config.recall.enabled,
        budget: args.config.recall.budget,
        maxTokens: args.config.recall.maxTokens,
        types: args.config.recall.types,
        recentTurnsForQuery: args.config.recall.recentTurnsForQuery,
      },
      retain: {
        enabled: args.config.retain.enabled,
        async: args.config.retain.async,
        updateMode: args.config.retain.updateMode,
        redactSecrets: args.config.retain.redactSecrets,
        includeToolResults: args.config.retain.includeToolResults,
      },
      config: safeConfig(args.config),
    },
    null,
    2,
  );
}
