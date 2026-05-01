import type { FieldId, ConfigResetKey } from "./config-field-paths.js";
import type { ConfigScope, ConfigSource } from "./config-writer.js";
export type { FieldId } from "./config-field-paths.js";

export type TabId = "Status" | "Connection" | "Banks" | "Recall" | "Retain" | "Import" | "UI";

export type ConfigEditingKind = "boolean" | "select" | "text" | "positive-int";

export type ConfigEditingField = {
  id: FieldId;
  tab: Exclude<TabId, "Status">;
  label: string;
  description: string;
  value: string;
  defaultValue: string;
  projectValue?: string;
  globalValue?: string;
  envValue?: string;
  source: ConfigSource;
  editableScopes: ConfigScope[];
  changed: boolean;
  resetKey: ConfigResetKey;
  kind: ConfigEditingKind;
  choices?: string[];
};

export type ConfigLayers = {
  project: Record<string, unknown>;
  global: Record<string, unknown>;
  env: NodeJS.ProcessEnv;
};

export type ConfigEditingTab = {
  id: TabId;
  fields: ConfigEditingField[];
  facts?: Array<[string, string]>;
};
