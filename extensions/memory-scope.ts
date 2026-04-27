import type { TagsMatch, ResolvedConfig } from "./types.js";
import { createMemoryIdentity } from "./memory-identity.js";

export interface MemoryRecallScope {
  kind: "project" | "global";
  bankId: string;
  tags: string[];
  tagsMatch: TagsMatch;
}

export function selectMemoryScopes(cwd: string, config: ResolvedConfig): MemoryRecallScope[] {
  const identity = createMemoryIdentity(cwd, config);
  const scopes: MemoryRecallScope[] = [];

  if (config.banks.project.enabled) {
    scopes.push({
      kind: "project",
      bankId: identity.projectBankId,
      tags: identity.projectRecallTags,
      tagsMatch: "any_strict",
    });
  }

  if (config.banks.global.enabled && config.banks.global.bankId) {
    scopes.push({
      kind: "global",
      bankId: config.banks.global.bankId,
      tags: identity.globalRecallTags,
      tagsMatch: "any_strict",
    });
  }

  return scopes;
}
