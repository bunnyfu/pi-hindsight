import { existsSync, readFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function projectConfigPath(cwd: string): string {
  return join(cwd, ".pi", "hindsight.json");
}

export function readProjectConfig(cwd: string): Record<string, unknown> {
  const path = projectConfigPath(cwd);
  if (!existsSync(path)) return {};
  const parsed = JSON.parse(readFileSync(path, "utf8")) as unknown;
  if (!isRecord(parsed)) throw new Error(`${path} must contain a JSON object`);
  return parsed;
}

export function deepMergeConfig(
  base: Record<string, unknown>,
  patch: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...base };
  for (const [key, value] of Object.entries(patch)) {
    out[key] = isRecord(value) && isRecord(out[key]) ? deepMergeConfig(out[key], value) : value;
  }
  return out;
}

export interface ProjectConfigPatchInput {
  enabled?: boolean;
  baseUrl?: string;
  timeoutMs?: number;
  projectBankId?: string;
  globalBankId?: string;
  enableGlobalBank?: boolean;
  recallEnabled?: boolean;
  recallBudget?: "low" | "mid" | "high";
  recallMaxTokens?: number;
  retainEnabled?: boolean;
  retainAsync?: boolean;
  retainUpdateMode?: "append" | "replace";
  queuePath?: string;
  importIncludeBranches?: "current-only" | "all-leaves";
  importManifestPath?: string;
  statusStyle?: "off" | "text" | "emoji" | "nerdfont";
  statusDetail?: "minimal" | "project" | "activity" | "verbose";
  statusMaxLength?: number;
  statusShowActivity?: boolean;
}

export function buildProjectConfigPatch(input: ProjectConfigPatchInput): Record<string, unknown> {
  const patch: Record<string, unknown> = {};
  if (input.enabled !== undefined) patch.enabled = input.enabled;
  if (input.baseUrl || input.timeoutMs !== undefined) {
    patch.hindsight = {
      ...(input.baseUrl ? { baseUrl: input.baseUrl } : {}),
      ...(input.timeoutMs !== undefined ? { timeoutMs: input.timeoutMs } : {}),
    };
  }
  if (input.projectBankId) {
    patch.banks = {
      ...(isRecord(patch.banks) ? patch.banks : {}),
      project: { enabled: true, derive: "manual", bankId: input.projectBankId },
    };
  }
  if (input.globalBankId || input.enableGlobalBank !== undefined) {
    patch.banks = {
      ...(isRecord(patch.banks) ? patch.banks : {}),
      global: {
        ...(input.enableGlobalBank !== undefined ? { enabled: input.enableGlobalBank } : {}),
        ...(input.globalBankId ? { bankId: input.globalBankId, enabled: true } : {}),
      },
    };
  }
  if (
    input.recallEnabled !== undefined ||
    input.recallBudget ||
    input.recallMaxTokens !== undefined
  ) {
    patch.recall = {
      ...(input.recallEnabled !== undefined ? { enabled: input.recallEnabled } : {}),
      ...(input.recallBudget ? { budget: input.recallBudget } : {}),
      ...(input.recallMaxTokens !== undefined ? { maxTokens: input.recallMaxTokens } : {}),
    };
  }
  if (
    input.queuePath ||
    input.retainEnabled !== undefined ||
    input.retainAsync !== undefined ||
    input.retainUpdateMode
  ) {
    patch.retain = {
      ...(input.retainEnabled !== undefined ? { enabled: input.retainEnabled } : {}),
      ...(input.retainAsync !== undefined ? { async: input.retainAsync } : {}),
      ...(input.retainUpdateMode ? { updateMode: input.retainUpdateMode } : {}),
      ...(input.queuePath ? { queuePath: input.queuePath } : {}),
    };
  }
  if (input.importIncludeBranches || input.importManifestPath) {
    patch.import = {
      ...(input.importIncludeBranches ? { includeBranches: input.importIncludeBranches } : {}),
      ...(input.importManifestPath ? { manifestPath: input.importManifestPath } : {}),
    };
  }
  if (
    input.statusStyle ||
    input.statusDetail ||
    input.statusMaxLength !== undefined ||
    input.statusShowActivity !== undefined
  ) {
    patch.status = {
      ...(input.statusStyle ? { style: input.statusStyle } : {}),
      ...(input.statusDetail ? { detail: input.statusDetail } : {}),
      ...(input.statusMaxLength !== undefined ? { maxLength: input.statusMaxLength } : {}),
      ...(input.statusShowActivity !== undefined ? { showActivity: input.statusShowActivity } : {}),
    };
  }
  return patch;
}

export async function writeProjectConfig(
  cwd: string,
  patch: Record<string, unknown>,
): Promise<{ path: string; config: Record<string, unknown> }> {
  const path = projectConfigPath(cwd);
  const next = deepMergeConfig(readProjectConfig(cwd), patch);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(next, null, 2)}\n`, "utf8");
  return { path, config: next };
}
