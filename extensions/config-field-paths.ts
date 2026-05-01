export type FieldId =
  | "enabled"
  | "baseUrl"
  | "apiKeyEnv"
  | "timeoutMs"
  | "memoryProfile"
  | "projectBankId"
  | "globalBankEnabled"
  | "globalBankId"
  | "recallEnabled"
  | "recallBudget"
  | "recallMaxTokens"
  | "retainEnabled"
  | "retainAsync"
  | "queuePath"
  | "importBranches"
  | "importManifest"
  | "importCheckpoint"
  | "importReplaceExisting"
  | "importResume"
  | "statusStyle"
  | "statusDetail"
  | "statusMaxLength"
  | "statusActivity"
  | "notifyStartup"
  | "notifyRecall"
  | "notifyRetain";

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

export const CONFIG_RESET_PATHS = {
  enabled: [["enabled"]],
  "hindsight.baseUrl": [["hindsight", "baseUrl"]],
  "hindsight.timeoutMs": [["hindsight", "timeoutMs"]],
  "hindsight.apiKey": [
    ["hindsight", "apiKey"],
    ["hindsight", "apiKeyRef"],
  ],
  "banks.profile": [
    ["banks", "project", "enabled"],
    ["banks", "global", "enabled"],
  ],
  "banks.project.bankId": [
    ["banks", "project", "bankId"],
    ["banks", "project", "derive"],
  ],
  "banks.global.enabled": [["banks", "global", "enabled"]],
  "banks.global.bankId": [["banks", "global", "bankId"]],
  "recall.enabled": [["recall", "enabled"]],
  "recall.budget": [["recall", "budget"]],
  "recall.maxTokens": [["recall", "maxTokens"]],
  "retain.enabled": [["retain", "enabled"]],
  "retain.async": [["retain", "async"]],
  "retain.queuePath": [["retain", "queuePath"]],
  "import.includeBranches": [["import", "includeBranches"]],
  "import.manifestPath": [["import", "manifestPath"]],
  "import.checkpointPath": [["import", "checkpointPath"]],
  "import.replaceExistingImportedDocs": [["import", "replaceExistingImportedDocs"]],
  "import.resume": [["import", "resume"]],
  "status.style": [["status", "style"]],
  "status.detail": [["status", "detail"]],
  "status.maxLength": [["status", "maxLength"]],
  "status.showActivity": [["status", "showActivity"]],
  "notifications.startup": [["notifications", "startup"]],
  "notifications.recall": [["notifications", "recall"]],
  "notifications.retain": [["notifications", "retain"]],
} as const satisfies Record<string, readonly (readonly string[])[]>;

export type ConfigResetKey = keyof typeof CONFIG_RESET_PATHS;

export function resetPathsForConfigKeys(keys: ConfigResetKey[]): string[][] {
  return keys.flatMap((key) => CONFIG_RESET_PATHS[key].map((path) => [...path]));
}
