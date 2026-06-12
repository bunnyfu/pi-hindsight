import type { HindsightTagGroup, TagsMatch, ResolvedConfig } from "../types.js";
import { recallScopeTags } from "../banks/banking.js";
import { createMemoryIdentity } from "./memory-identity.js";

export interface MemoryRecallScope {
  kind: "project" | "global";
  bankId: string;
  tags: string[];
  tagsMatch: TagsMatch;
}

export function scopeTagsForBank(cwd: string, config: ResolvedConfig, bankId: string): string[] {
  return config.banks.user.enabled && bankId === config.banks.user.bankId
    ? ["source:pi"]
    : recallScopeTags(cwd);
}

export interface ScopedTagFilterInput {
  tags?: string[];
  tagsMatch?: TagsMatch;
  tagGroups?: HindsightTagGroup[];
}

export function composeScopedTagFilter(
  scopeTags: string[],
  filters: ScopedTagFilterInput = {},
): { tagGroups: HindsightTagGroup[] } | { tags: string[]; tagsMatch: "any_strict" } {
  const scopeGroup = { tags: scopeTags, match: "any_strict" } satisfies HindsightTagGroup;
  const callerGroups = filters.tagGroups ?? [];
  if (callerGroups.length || filters.tags?.length) {
    const flatTagGroup = filters.tags?.length
      ? [
          {
            tags: filters.tags,
            match: filters.tagsMatch ?? "any_strict",
          } satisfies HindsightTagGroup,
        ]
      : [];
    return { tagGroups: [scopeGroup, ...flatTagGroup, ...callerGroups] };
  }
  return { tags: scopeTags, tagsMatch: "any_strict" as const };
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

  if (config.banks.user.enabled && config.banks.user.bankId) {
    scopes.push({
      kind: "global",
      bankId: config.banks.user.bankId,
      tags: identity.globalRecallTags,
      tagsMatch: "any_strict",
    });
  }

  return scopes;
}
