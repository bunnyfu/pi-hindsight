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
    includeToolResults: "meaningful-only",
    redactSecrets: true,
    queuePath: ".pi/hindsight/retain-queue.jsonl",
  },
  import: {
    includeBranches: "current-only",
    includeCompactionSummaries: true,
    includeBranchSummaries: true,
    replaceExistingImportedDocs: true,
    manifestPath: ".pi/hindsight/import-manifest.json",
  },
  status: {
    style: "text",
    detail: "project",
    maxLength: 24,
    showActivity: true,
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
  return config;
}

export { DEFAULT_CONFIG };
