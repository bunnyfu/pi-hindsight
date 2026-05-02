import type { HindsightCapabilities, HindsightLikeClient, ResolvedConfig } from "./types.js";
import type { ProjectConfigPatchInput } from "./config-writer.js";

export interface MemoryOperationsDeps {
  getClient(): HindsightLikeClient;
  getConfig(): ResolvedConfig;
  getProjectBankId(): string;
  getCapabilities?(): HindsightCapabilities | undefined;
  reloadConfig?(cwd: string): void;
}

export type ConfigureMemoryArgs = ProjectConfigPatchInput;
