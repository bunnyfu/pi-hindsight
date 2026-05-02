import type { ResolvedConfig } from "./types.js";
import { readGlobalConfig, readProjectConfig, type ConfigSource } from "./config-writer.js";
import type {
  ConfigEditingField,
  ConfigEditingTab,
  ConfigLayers,
  FieldId,
  TabId,
} from "./config-editing-types.js";
import {
  buildBaseConfigEditingFields,
  buildStatusFacts,
  configEnvValues,
  editableScopesForField,
  enabledDisabled,
  CONFIG_FIELD_PATHS,
} from "./config-editing-registry.js";

export type {
  ConfigEditingField,
  ConfigEditingKind,
  ConfigEditingTab,
  ConfigLayers,
  FieldId,
  TabId,
} from "./config-editing-types.js";
export {
  inputDefaultForConfigEditingField,
  patchForConfigEditingField,
} from "./config-editing-actions.js";

export { enabledDisabled } from "./config-editing-registry.js";

export function readConfigLayers(cwd: string): ConfigLayers {
  return { project: readProjectConfig(cwd), global: readGlobalConfig(), env: process.env };
}

function valueAt(config: Record<string, unknown>, path: string[]): unknown {
  let value: unknown = config;
  for (const part of path) {
    if (typeof value !== "object" || value === null || Array.isArray(value)) return undefined;
    value = (value as Record<string, unknown>)[part];
  }
  return value;
}

function displayLayerValue(value: unknown): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value === "boolean") return enabledDisabled(value);
  if (typeof value === "string" || typeof value === "number") return String(value);
  if (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    (value as { source?: unknown }).source === "env" &&
    typeof (value as { name?: unknown }).name === "string"
  ) {
    return String((value as { name: string }).name);
  }
  return JSON.stringify(value);
}

function sourceFor(layers: ConfigLayers, path: string[], envValue?: string): ConfigSource {
  if (envValue !== undefined) return "env";
  if (valueAt(layers.project, path) !== undefined) return "project";
  if (valueAt(layers.global, path) !== undefined) return "global";
  return "default";
}

function layerField(
  base: Omit<
    ConfigEditingField,
    "projectValue" | "globalValue" | "envValue" | "source" | "editableScopes" | "changed"
  >,
  layers: ConfigLayers,
  path: string[],
  envValue: string | undefined,
): ConfigEditingField {
  const projectValue = displayLayerValue(valueAt(layers.project, path));
  const globalValue = displayLayerValue(valueAt(layers.global, path));
  const source = sourceFor(layers, path, envValue);
  return {
    ...base,
    ...(projectValue !== undefined ? { projectValue } : {}),
    ...(globalValue !== undefined ? { globalValue } : {}),
    ...(envValue !== undefined ? { envValue } : {}),
    source,
    editableScopes: editableScopesForField(base.id),
    changed: source !== "default",
  };
}

export function buildConfigEditingFields(
  config: ResolvedConfig,
  projectBankId: string,
  layers: ConfigLayers,
): ConfigEditingField[] {
  const envValues = configEnvValues(layers.env);
  return buildBaseConfigEditingFields(config, projectBankId).map((field) =>
    layerField(field, layers, CONFIG_FIELD_PATHS[field.id], envValues[field.id]),
  );
}

export function buildConfigEditingTabs(
  config: ResolvedConfig,
  projectBankId: string,
  layers: ConfigLayers,
  statusFacts: Array<[string, string]> = [],
  options: { showAdvanced?: boolean } = {},
): ConfigEditingTab[] {
  const fields = buildConfigEditingFields(config, projectBankId, layers);
  const ids: TabId[] = ["Status", "Connection", "Banks", "Recall", "Retain", "Import", "UI"];
  return ids.map((id) => ({
    id,
    fields:
      id === "Status"
        ? []
        : fields.filter((field) => field.tab === id && (options.showAdvanced || !field.advanced)),
    ...(id === "Status" ? { facts: buildStatusFacts(config, projectBankId, statusFacts) } : {}),
  }));
}
