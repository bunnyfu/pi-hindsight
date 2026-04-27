import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { ResolvedConfig } from "./types.js";

const DEFAULT_CONFIG: ResolvedConfig = {
  enabled: true,
  hindsight: { baseUrl: "http://localhost:8888", timeoutMs: 30_000 },
  banks: {
    project: { enabled: true, derive: "repo" },
    global: { enabled: false },
  },
  recall: {
    enabled: true,
    budget: "low",
    maxTokens: 800,
    types: ["world", "experience", "observation"],
    recentTurnsForQuery: 2,
    injectionMode: "context",
    includeFactsInDebug: false,
  },
  retain: {
    enabled: true,
    async: true,
    updateMode: "append",
    appendFallback: "error",
    includeToolResults: "meaningful-only",
    redactSecrets: true,
    queuePath: ".pi/hindsight/retain-queue.jsonl",
    shutdownFlushMaxJobs: 10,
    shutdownFlushTimeoutMs: 2_000,
  },
  import: {
    includeBranches: "current-only",
    replaceExistingImportedDocs: true,
    manifestPath: ".pi/hindsight/import-manifest.json",
  },
  status: {
    style: "text",
    detail: "activity",
    maxLength: 24,
    showActivity: true,
  },
  notifications: {
    startup: true,
    recall: false,
    retain: false,
  },
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function merge<T>(base: T, patch: unknown): T {
  if (!isRecord(base) || !isRecord(patch)) return (patch ?? base) as T;
  const out: Record<string, unknown> = { ...base };
  for (const [key, value] of Object.entries(patch)) {
    out[key] = isRecord(value) && isRecord(out[key]) ? merge(out[key], value) : value;
  }
  return out as T;
}

function readJson(path: string): unknown {
  if (!existsSync(path)) return undefined;
  return JSON.parse(readFileSync(path, "utf8")) as unknown;
}

function envBool(env: NodeJS.ProcessEnv, name: string): boolean | undefined {
  const value = env[name];
  if (value === undefined) return undefined;
  return ["1", "true", "yes", "on"].includes(value.toLowerCase());
}

function bool(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function positiveInt(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isInteger(value) && value > 0 ? value : fallback;
}

function stringValue(value: unknown, fallback: string): string {
  return typeof value === "string" && value.length > 0 ? value : fallback;
}

function optionalString(value: unknown, fallback?: string): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : fallback;
}

function enumValue<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return typeof value === "string" && (allowed as readonly string[]).includes(value)
    ? (value as T)
    : fallback;
}

function stringArray(value: unknown, fallback: string[]): string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string") ? value : fallback;
}

export function normalizeConfig(config: ResolvedConfig): ResolvedConfig {
  const apiKey = optionalString(config.hindsight?.apiKey, DEFAULT_CONFIG.hindsight.apiKey);
  const projectBankId = optionalString(
    config.banks?.project?.bankId,
    DEFAULT_CONFIG.banks.project.bankId,
  );
  const globalBankId = optionalString(
    config.banks?.global?.bankId,
    DEFAULT_CONFIG.banks.global.bankId,
  );
  return {
    enabled: bool(config.enabled, DEFAULT_CONFIG.enabled),
    hindsight: {
      baseUrl: stringValue(config.hindsight?.baseUrl, DEFAULT_CONFIG.hindsight.baseUrl),
      ...(apiKey ? { apiKey } : {}),
      timeoutMs: positiveInt(config.hindsight?.timeoutMs, DEFAULT_CONFIG.hindsight.timeoutMs),
    },
    banks: {
      project: {
        enabled: bool(config.banks?.project?.enabled, DEFAULT_CONFIG.banks.project.enabled),
        ...(projectBankId ? { bankId: projectBankId } : {}),
        derive: enumValue(
          config.banks?.project?.derive,
          ["repo", "cwd", "manual"],
          DEFAULT_CONFIG.banks.project.derive,
        ),
      },
      global: {
        enabled: bool(config.banks?.global?.enabled, DEFAULT_CONFIG.banks.global.enabled),
        ...(globalBankId ? { bankId: globalBankId } : {}),
      },
    },
    recall: {
      enabled: bool(config.recall?.enabled, DEFAULT_CONFIG.recall.enabled),
      budget: enumValue(
        config.recall?.budget,
        ["low", "mid", "high"],
        DEFAULT_CONFIG.recall.budget,
      ),
      maxTokens: positiveInt(config.recall?.maxTokens, DEFAULT_CONFIG.recall.maxTokens),
      types: stringArray(config.recall?.types, DEFAULT_CONFIG.recall.types),
      recentTurnsForQuery: positiveInt(
        config.recall?.recentTurnsForQuery,
        DEFAULT_CONFIG.recall.recentTurnsForQuery,
      ),
      injectionMode: "context",
      includeFactsInDebug: bool(
        config.recall?.includeFactsInDebug,
        DEFAULT_CONFIG.recall.includeFactsInDebug,
      ),
    },
    retain: {
      enabled: bool(config.retain?.enabled, DEFAULT_CONFIG.retain.enabled),
      async: bool(config.retain?.async, DEFAULT_CONFIG.retain.async),
      updateMode: enumValue(
        config.retain?.updateMode,
        ["append", "replace"],
        DEFAULT_CONFIG.retain.updateMode,
      ),
      appendFallback: enumValue(
        config.retain?.appendFallback,
        ["error", "per-turn-documents"],
        DEFAULT_CONFIG.retain.appendFallback,
      ),
      includeToolResults: enumValue(
        config.retain?.includeToolResults,
        ["meaningful-only", "all", "none"],
        DEFAULT_CONFIG.retain.includeToolResults,
      ),
      redactSecrets: bool(config.retain?.redactSecrets, DEFAULT_CONFIG.retain.redactSecrets),
      queuePath: stringValue(config.retain?.queuePath, DEFAULT_CONFIG.retain.queuePath),
      shutdownFlushMaxJobs: positiveInt(
        config.retain?.shutdownFlushMaxJobs,
        DEFAULT_CONFIG.retain.shutdownFlushMaxJobs,
      ),
      shutdownFlushTimeoutMs: positiveInt(
        config.retain?.shutdownFlushTimeoutMs,
        DEFAULT_CONFIG.retain.shutdownFlushTimeoutMs,
      ),
    },
    import: {
      includeBranches: enumValue(
        config.import?.includeBranches,
        ["current-only", "all-leaves"],
        DEFAULT_CONFIG.import.includeBranches,
      ),
      replaceExistingImportedDocs: bool(
        config.import?.replaceExistingImportedDocs,
        DEFAULT_CONFIG.import.replaceExistingImportedDocs,
      ),
      manifestPath: stringValue(config.import?.manifestPath, DEFAULT_CONFIG.import.manifestPath),
    },
    status: {
      style: enumValue(
        config.status?.style,
        ["off", "text", "emoji", "nerdfont"],
        DEFAULT_CONFIG.status.style,
      ),
      detail: enumValue(
        config.status?.detail,
        ["minimal", "project", "activity", "verbose"],
        DEFAULT_CONFIG.status.detail,
      ),
      maxLength: positiveInt(config.status?.maxLength, DEFAULT_CONFIG.status.maxLength),
      showActivity: bool(config.status?.showActivity, DEFAULT_CONFIG.status.showActivity),
    },
    notifications: {
      startup: bool(config.notifications?.startup, DEFAULT_CONFIG.notifications.startup),
      recall: bool(config.notifications?.recall, DEFAULT_CONFIG.notifications.recall),
      retain: bool(config.notifications?.retain, DEFAULT_CONFIG.notifications.retain),
    },
  };
}

export function resolveConfig(cwd: string, env: NodeJS.ProcessEnv = process.env): ResolvedConfig {
  let config = DEFAULT_CONFIG;
  const home = env.HOME;
  if (home) config = merge(config, readJson(join(home, ".pi", "agent", "hindsight.json")));
  config = merge(config, readJson(join(cwd, ".pi", "hindsight.json")));

  const enabled = envBool(env, "PI_HINDSIGHT_ENABLED");
  if (enabled !== undefined) config = merge(config, { enabled });
  if (env.HINDSIGHT_BASE_URL)
    config = merge(config, { hindsight: { baseUrl: env.HINDSIGHT_BASE_URL } });
  if (env.HINDSIGHT_API_KEY)
    config = merge(config, { hindsight: { apiKey: env.HINDSIGHT_API_KEY } });
  if (env.PI_HINDSIGHT_PROJECT_BANK_ID) {
    config = merge(config, {
      banks: { project: { bankId: env.PI_HINDSIGHT_PROJECT_BANK_ID, derive: "manual" } },
    });
  }
  if (env.PI_HINDSIGHT_GLOBAL_BANK_ID) {
    config = merge(config, {
      banks: { global: { enabled: true, bankId: env.PI_HINDSIGHT_GLOBAL_BANK_ID } },
    });
  }
  return normalizeConfig(config);
}

export { DEFAULT_CONFIG };
