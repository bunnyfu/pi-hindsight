import type { HindsightTagGroup, TagsMatch, ResolvedConfig } from "../types.js";
import { recallScopeTags } from "../banks/banking.js";
import { createMemoryIdentity } from "./memory-identity.js";

export interface MemoryRecallScope {
  kind: "project" | "global";
  bankId: string;
  tagGroups: HindsightTagGroup[];
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
): { tagGroups: HindsightTagGroup[] } | Record<string, never> {
  const groups: HindsightTagGroup[] = [];
  if (scopeTags.length) groups.push({ tags: scopeTags, match: "any_strict" });
  if (filters.tags?.length)
    groups.push({ tags: filters.tags, match: filters.tagsMatch ?? "any_strict" });
  if (filters.tagGroups?.length) groups.push(...filters.tagGroups);
  return groups.length ? { tagGroups: groups } : {};
}

function scopeTagGroups(scopeTags: string[]): HindsightTagGroup[] {
  const composed = composeScopedTagFilter(scopeTags);
  return "tagGroups" in composed ? composed.tagGroups : [];
}

export function selectMemoryScopes(cwd: string, config: ResolvedConfig): MemoryRecallScope[] {
  const identity = createMemoryIdentity(cwd, config);
  const scopes: MemoryRecallScope[] = [];

  if (config.banks.project.enabled) {
    scopes.push({
      kind: "project",
      bankId: identity.projectBankId,
      tagGroups: scopeTagGroups(identity.projectRecallTags),
    });
  }

  if (config.banks.user.enabled && config.banks.user.bankId) {
    scopes.push({
      kind: "global",
      bankId: config.banks.user.bankId,
      tagGroups: scopeTagGroups(identity.globalRecallTags),
    });
  }

  return scopes;
}
