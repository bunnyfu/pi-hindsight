import type { HindsightCapabilities, ResolvedConfig } from "./types.js";
import { baseTags, findRepoRoot } from "./banking.js";
import { stableSessionId } from "./session.js";
import { createMemoryIdentity } from "./memory-identity.js";
import { expandObservationScopes } from "./observation-scopes.js";
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
  capabilities?: HindsightCapabilities;
  activity?: HindsightActivity;
  memoryCount?: number;
  queueRemaining?: number;
}

export function bankSelectionMessage(projectBankId: string, config: ResolvedConfig): string {
  if (!config.banks.project.enabled) {
    return config.banks.global.enabled && config.banks.global.bankId
      ? `Hindsight global-only memory: ${config.banks.global.bankId}`
      : "Hindsight project bank disabled and no global bank configured.";
  }
  if (config.banks.project.bankId) {
    return `Hindsight bank configured: ${projectBankId}`;
  }
  return `Hindsight bank auto-selected: ${projectBankId}. Override with PI_HINDSIGHT_PROJECT_BANK_ID or .pi/hindsight.json banks.project.bankId.`;
}

function memoryProfile(config: ResolvedConfig): "project-only" | "project+global" | "global-only" {
  if (!config.banks.project.enabled) return "global-only";
  if (config.banks.global.enabled) return "project+global";
  return "project-only";
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
  const identity = {
    ...createMemoryIdentity(args.cwd, args.config, args.sessionFile),
    projectBankId: args.projectBankId,
  };
  let observationScopes: string[][] | { error: string } = [];
  try {
    observationScopes = args.config.observations.enabled
      ? expandObservationScopes(args.config.observations.scopes, identity)
      : [];
  } catch (error) {
    observationScopes = { error: error instanceof Error ? error.message : String(error) };
  }
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
      memoryProfile: memoryProfile(args.config),
      projectBankId: args.projectBankId,
      projectBankSelection: args.config.banks.project.bankId
        ? "configured"
        : args.config.banks.project.derive,
      bankMissions: {
        projectConfigured: Boolean(args.config.banks.project.mission),
        globalConfigured: Boolean(args.config.banks.global.mission),
      },
      observations: {
        enabled: args.config.observations.enabled,
        scopes: observationScopes,
      },
      overrideProjectBankId:
        "Set PI_HINDSIGHT_PROJECT_BANK_ID or .pi/hindsight.json banks.project.bankId",
      globalBankId: args.config.banks.global.enabled
        ? (args.config.banks.global.bankId ?? null)
        : null,
      memoryRoutes: {
        recall: [
          ...(args.config.banks.project.enabled ? ["project"] : []),
          ...(args.config.banks.global.enabled && args.config.banks.global.bankId
            ? ["global"]
            : []),
        ],
        autoRetain: args.config.banks.project.enabled ? "project" : null,
      },
      tags,
      queuePath: args.config.retain.queuePath,
      queueLength: args.queueLength,
      capabilities: args.capabilities
        ? {
            appendUpdateMode: args.capabilities.appendUpdateMode ? "supported" : "unsupported",
            checkedAt: args.capabilities.checkedAt,
            error: args.capabilities.error ?? null,
            probeDocumentId: args.capabilities.probeDocumentId ?? null,
            appendFallback: args.config.retain.appendFallback,
            action: args.capabilities.appendUpdateMode
              ? null
              : "Upgrade Hindsight or set retain.appendFallback to per-turn-documents.",
          }
        : { appendUpdateMode: "not checked", appendFallback: args.config.retain.appendFallback },
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
        contextTurns: args.config.recall.contextTurns,
        roles: args.config.recall.roles,
        maxQueryChars: args.config.recall.maxQueryChars,
        queryPreamble: args.config.recall.queryPreamble ?? null,
        includeDateInQuery: args.config.recall.includeDateInQuery,
        topK: args.config.recall.topK,
        timeoutMs: args.config.recall.timeoutMs,
        injectionPosition: args.config.recall.injectionPosition,
      },
      retain: {
        enabled: args.config.retain.enabled,
        async: args.config.retain.async,
        updateMode: args.config.retain.updateMode,
        appendFallback: args.config.retain.appendFallback,
        redactSecrets: args.config.retain.redactSecrets,
        includeToolResults: args.config.retain.includeToolResults,
        content: args.config.retain.content,
        toolFilter: args.config.retain.toolFilter,
        strip: args.config.retain.strip,
      },
      config: safeConfig(args.config),
    },
    null,
    2,
  );
}
