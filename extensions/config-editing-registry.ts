import { DEFAULT_CONFIG } from "./config.js";
import type { ResolvedConfig } from "./types.js";
import type { ConfigScope, MemoryProfile } from "./config-writer.js";
import type { ConfigEditingField, FieldId } from "./config-editing-types.js";

function memoryProfileLabel(config: ResolvedConfig): MemoryProfile {
  if (!config.banks.project.enabled) return "global-only";
  if (config.banks.global.enabled) return "project+global";
  return "project-only";
}

export function enabledDisabled(value: boolean): string {
  return value ? "enabled" : "disabled";
}

function changed(value: string, defaultValue: string): boolean {
  return value !== defaultValue;
}

export function apiKeyEnvName(config: ResolvedConfig): string {
  return config.hindsight.apiKeyRef?.startsWith("env:")
    ? config.hindsight.apiKeyRef.slice(4)
    : "not set";
}

type BaseConfigEditingField = Omit<
  ConfigEditingField,
  "projectValue" | "globalValue" | "envValue" | "source" | "editableScopes"
>;

export function buildBaseConfigEditingFields(
  config: ResolvedConfig,
  projectBankId: string,
): BaseConfigEditingField[] {
  const defaults = DEFAULT_CONFIG;
  const profile = memoryProfileLabel(config);
  const defaultProfile = memoryProfileLabel(defaults);
  const globalBankId = config.banks.global.bankId ?? "not set";
  const defaultGlobalBankId = defaults.banks.global.bankId ?? "not set";
  const fields: Array<
    Omit<
      ConfigEditingField,
      "projectValue" | "globalValue" | "envValue" | "source" | "editableScopes"
    >
  > = [
    {
      id: "enabled",
      tab: "Connection",
      label: "Extension active",
      description: "Master switch. When off, automatic recall and retain are skipped.",
      value: enabledDisabled(config.enabled),
      defaultValue: enabledDisabled(defaults.enabled),
      changed: config.enabled !== defaults.enabled,
      resetKey: "enabled",
      kind: "boolean",
    },
    {
      id: "baseUrl",
      tab: "Connection",
      label: "Hindsight API URL",
      description: "Server endpoint used for recall, retain, reflect, and bank setup.",
      value: config.hindsight.baseUrl,
      defaultValue: defaults.hindsight.baseUrl,
      changed: changed(config.hindsight.baseUrl, defaults.hindsight.baseUrl),
      resetKey: "hindsight.baseUrl",

      kind: "text",
    },
    {
      id: "apiKeyEnv",
      tab: "Connection",
      label: "API key env var",
      description:
        "Environment variable name that contains the Hindsight API key. Raw secrets are never written.",
      value: apiKeyEnvName(config),
      defaultValue: "not set",
      changed: apiKeyEnvName(config) !== "not set",
      resetKey: "hindsight.apiKey",

      kind: "text",
    },
    {
      id: "timeoutMs",
      tab: "Connection",
      label: "Request timeout",
      description: "Maximum time to wait for Hindsight network calls.",
      value: `${config.hindsight.timeoutMs} ms`,
      defaultValue: `${defaults.hindsight.timeoutMs} ms`,
      changed: config.hindsight.timeoutMs !== defaults.hindsight.timeoutMs,
      resetKey: "hindsight.timeoutMs",

      kind: "positive-int",
    },
    {
      id: "memoryProfile",
      tab: "Banks",
      label: "Memory scope",
      description:
        "Project-only is safest. Project+global also recalls personal cross-project memory.",
      value: profile,
      defaultValue: defaultProfile,
      changed: profile !== defaultProfile,
      resetKey: "banks.profile",

      kind: "select",
      choices: ["project-only", "project+global", "global-only"],
    },
    {
      id: "projectBankId",
      tab: "Banks",
      label: "Project bank ID",
      description: "Bank used for this repository. Default derives a stable ID from repo identity.",
      value: projectBankId,
      defaultValue: "auto-derived",
      changed: Boolean(config.banks.project.bankId),
      resetKey: "banks.project.bankId",

      kind: "text",
    },
    {
      id: "globalBankEnabled",
      tab: "Banks",
      label: "Global memory enabled",
      description: "Allows cross-project recall from a shared bank.",
      value: enabledDisabled(config.banks.global.enabled),
      defaultValue: enabledDisabled(defaults.banks.global.enabled),
      changed: config.banks.global.enabled !== defaults.banks.global.enabled,
      resetKey: "banks.global.enabled",

      kind: "boolean",
    },
    {
      id: "globalBankId",
      tab: "Banks",
      label: "Global bank ID",
      description: "Shared bank used only when global memory is enabled.",
      value: globalBankId,
      defaultValue: defaultGlobalBankId,
      changed: globalBankId !== defaultGlobalBankId,
      resetKey: "banks.global.bankId",

      kind: "text",
    },
    {
      id: "recallEnabled",
      tab: "Recall",
      label: "Automatic recall",
      description: "Looks up memory before answer generation and injects it ephemerally.",
      value: enabledDisabled(config.recall.enabled),
      defaultValue: enabledDisabled(defaults.recall.enabled),
      changed: config.recall.enabled !== defaults.recall.enabled,
      resetKey: "recall.enabled",

      kind: "boolean",
    },
    {
      id: "recallBudget",
      tab: "Recall",
      label: "Recall depth",
      description: "Low, mid, or high retrieval effort.",
      value: config.recall.budget,
      defaultValue: defaults.recall.budget,
      changed: config.recall.budget !== defaults.recall.budget,
      resetKey: "recall.budget",

      kind: "select",
      choices: ["low", "mid", "high"],
    },
    {
      id: "recallMaxTokens",
      tab: "Recall",
      label: "Recall token limit",
      description: "Maximum memory tokens injected into context.",
      value: String(config.recall.maxTokens),
      defaultValue: String(defaults.recall.maxTokens),
      changed: config.recall.maxTokens !== defaults.recall.maxTokens,
      resetKey: "recall.maxTokens",

      kind: "positive-int",
    },
    {
      id: "retainEnabled",
      tab: "Retain",
      label: "Automatic retain",
      description: "Stores raw structured conversation deltas after turns.",
      value: enabledDisabled(config.retain.enabled),
      defaultValue: enabledDisabled(defaults.retain.enabled),
      changed: config.retain.enabled !== defaults.retain.enabled,
      resetKey: "retain.enabled",

      kind: "boolean",
    },
    {
      id: "retainAsync",
      tab: "Retain",
      label: "Queued retain writes",
      description: "Writes retain jobs through durable queue instead of blocking UI.",
      value: enabledDisabled(config.retain.async),
      defaultValue: enabledDisabled(defaults.retain.async),
      changed: config.retain.async !== defaults.retain.async,
      resetKey: "retain.async",

      kind: "boolean",
    },
    {
      id: "queuePath",
      tab: "Retain",
      label: "Retain queue file",
      description: "JSONL retry queue used when Hindsight is unavailable.",
      value: config.retain.queuePath,
      defaultValue: defaults.retain.queuePath,
      changed: changed(config.retain.queuePath, defaults.retain.queuePath),
      resetKey: "retain.queuePath",

      kind: "text",
    },
    {
      id: "importBranches",
      tab: "Import",
      label: "Historical import scope",
      description: "Import current branch only, or every leaf branch explicitly.",
      value: config.import.includeBranches,
      defaultValue: defaults.import.includeBranches,
      changed: config.import.includeBranches !== defaults.import.includeBranches,
      resetKey: "import.includeBranches",

      kind: "select",
      choices: ["current-only", "all-leaves"],
    },
    {
      id: "importManifest",
      tab: "Import",
      label: "Import manifest file",
      description: "Tracks imported sessions so reimports stay deterministic.",
      value: config.import.manifestPath,
      defaultValue: defaults.import.manifestPath,
      changed: changed(config.import.manifestPath, defaults.import.manifestPath),
      resetKey: "import.manifestPath",
      kind: "text",
    },
    {
      id: "importCheckpoint",
      tab: "Import",
      label: "Import checkpoint file",
      description: "Tracks import progress so interrupted imports can resume safely.",
      value: config.import.checkpointPath,
      defaultValue: defaults.import.checkpointPath,
      changed: changed(config.import.checkpointPath, defaults.import.checkpointPath),
      resetKey: "import.checkpointPath",
      kind: "text",
    },
    {
      id: "importReplaceExisting",
      tab: "Import",
      label: "Replace existing import docs",
      description:
        "Uses deterministic replace mode for historical reimports instead of appending duplicates.",
      value: enabledDisabled(config.import.replaceExistingImportedDocs),
      defaultValue: enabledDisabled(defaults.import.replaceExistingImportedDocs),
      changed:
        config.import.replaceExistingImportedDocs !== defaults.import.replaceExistingImportedDocs,
      resetKey: "import.replaceExistingImportedDocs",
      kind: "boolean",
    },
    {
      id: "importResume",
      tab: "Import",
      label: "Resume interrupted imports",
      description: "Skips completed import documents when checkpoint content hashes match.",
      value: enabledDisabled(config.import.resume),
      defaultValue: enabledDisabled(defaults.import.resume),
      changed: config.import.resume !== defaults.import.resume,
      resetKey: "import.resume",
      kind: "boolean",
    },
    {
      id: "statusStyle",
      tab: "UI",
      label: "Footer status style",
      description: "Off, plain text, emoji, or nerdfont symbols.",
      value: config.status.style,
      defaultValue: defaults.status.style,
      changed: config.status.style !== defaults.status.style,
      resetKey: "status.style",

      kind: "select",
      choices: ["off", "text", "emoji", "nerdfont"],
    },
    {
      id: "statusDetail",
      tab: "UI",
      label: "Footer status detail",
      description: "How much Hindsight info appears in Pi footer.",
      value: config.status.detail,
      defaultValue: defaults.status.detail,
      changed: config.status.detail !== defaults.status.detail,
      resetKey: "status.detail",

      kind: "select",
      choices: ["minimal", "project", "activity", "verbose"],
    },
    {
      id: "statusMaxLength",
      tab: "UI",
      label: "Footer max length",
      description: "Maximum characters used by Hindsight footer status.",
      value: String(config.status.maxLength),
      defaultValue: String(defaults.status.maxLength),
      changed: config.status.maxLength !== defaults.status.maxLength,
      resetKey: "status.maxLength",

      kind: "positive-int",
    },
    {
      id: "statusActivity",
      tab: "UI",
      label: "Show live activity",
      description: "Displays recall/retain activity in the status line.",
      value: enabledDisabled(config.status.showActivity),
      defaultValue: enabledDisabled(defaults.status.showActivity),
      changed: config.status.showActivity !== defaults.status.showActivity,
      resetKey: "status.showActivity",

      kind: "boolean",
    },
    {
      id: "notifyStartup",
      tab: "UI",
      label: "Startup notification",
      description: "Shows selected Hindsight bank when Pi session starts.",
      value: enabledDisabled(config.notifications.startup),
      defaultValue: enabledDisabled(defaults.notifications.startup),
      changed: config.notifications.startup !== defaults.notifications.startup,
      resetKey: "notifications.startup",

      kind: "boolean",
    },
    {
      id: "notifyRecall",
      tab: "UI",
      label: "Recall notifications",
      description: "Shows a toast when automatic recall runs.",
      value: enabledDisabled(config.notifications.recall),
      defaultValue: enabledDisabled(defaults.notifications.recall),
      changed: config.notifications.recall !== defaults.notifications.recall,
      resetKey: "notifications.recall",

      kind: "boolean",
    },
    {
      id: "notifyRetain",
      tab: "UI",
      label: "Retain notifications",
      description: "Shows a toast when automatic retain queues memory.",
      value: enabledDisabled(config.notifications.retain),
      defaultValue: enabledDisabled(defaults.notifications.retain),
      changed: config.notifications.retain !== defaults.notifications.retain,
      resetKey: "notifications.retain",

      kind: "boolean",
    },
  ];
  return fields;
}

export const CONFIG_FIELD_PATHS: Record<FieldId, string[]> = {
  enabled: ["enabled"],
  baseUrl: ["hindsight", "baseUrl"],
  apiKeyEnv: ["hindsight", "apiKey"],
  timeoutMs: ["hindsight", "timeoutMs"],
  memoryProfile: ["banks", "project", "enabled"],
  projectBankId: ["banks", "project", "bankId"],
  globalBankEnabled: ["banks", "global", "enabled"],
  globalBankId: ["banks", "global", "bankId"],
  recallEnabled: ["recall", "enabled"],
  recallBudget: ["recall", "budget"],
  recallMaxTokens: ["recall", "maxTokens"],
  retainEnabled: ["retain", "enabled"],
  retainAsync: ["retain", "async"],
  queuePath: ["retain", "queuePath"],
  importBranches: ["import", "includeBranches"],
  importManifest: ["import", "manifestPath"],
  importCheckpoint: ["import", "checkpointPath"],
  importReplaceExisting: ["import", "replaceExistingImportedDocs"],
  importResume: ["import", "resume"],
  statusStyle: ["status", "style"],
  statusDetail: ["status", "detail"],
  statusMaxLength: ["status", "maxLength"],
  statusActivity: ["status", "showActivity"],
  notifyStartup: ["notifications", "startup"],
  notifyRecall: ["notifications", "recall"],
  notifyRetain: ["notifications", "retain"],
};

export const PROJECT_ONLY_FIELD_IDS = new Set<FieldId>([
  "projectBankId",
  "memoryProfile",
  "queuePath",
  "importBranches",
  "importManifest",
  "importCheckpoint",
  "importReplaceExisting",
  "importResume",
]);

export function editableScopesForField(fieldId: FieldId): ConfigScope[] {
  return PROJECT_ONLY_FIELD_IDS.has(fieldId) ? ["project"] : ["project", "global"];
}

export function configEnvValues(env: NodeJS.ProcessEnv): Partial<Record<FieldId, string>> {
  return {
    ...(env.PI_HINDSIGHT_ENABLED ? { enabled: env.PI_HINDSIGHT_ENABLED } : {}),
    ...(env.HINDSIGHT_BASE_URL ? { baseUrl: env.HINDSIGHT_BASE_URL } : {}),
    ...(env.HINDSIGHT_API_KEY || env.HINDSIGHT_API_KEY_REF
      ? { apiKeyEnv: env.HINDSIGHT_API_KEY_REF ?? "HINDSIGHT_API_KEY" }
      : {}),
    ...(env.PI_HINDSIGHT_PROJECT_BANK_ID
      ? { projectBankId: env.PI_HINDSIGHT_PROJECT_BANK_ID }
      : {}),
    ...(env.PI_HINDSIGHT_GLOBAL_BANK_ID
      ? { globalBankId: env.PI_HINDSIGHT_GLOBAL_BANK_ID, globalBankEnabled: "enabled" }
      : {}),
  };
}

export function buildStatusFacts(
  config: ResolvedConfig,
  projectBankId: string,
): Array<[string, string]> {
  const profile = memoryProfileLabel(config);
  return [
    ["Extension", enabledDisabled(config.enabled)],
    ["Memory scope", profile],
    ["Active project bank", config.banks.project.enabled ? projectBankId : "disabled"],
    [
      "Global bank",
      config.banks.global.enabled ? (config.banks.global.bankId ?? "missing id") : "disabled",
    ],
    ["Recall", enabledDisabled(config.recall.enabled)],
    ["Retain", enabledDisabled(config.retain.enabled)],
    ["Retain queue", config.retain.queuePath],
    ["Hindsight API", config.hindsight.baseUrl],
  ];
}
