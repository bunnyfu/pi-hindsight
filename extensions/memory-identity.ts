import type { ResolvedConfig } from "./types.js";
import { baseTags, deriveProjectBankId, recallScopeTags, repoKey } from "./banking.js";
import { importDocumentId, liveDocumentId, stableSessionId } from "./session.js";

export interface MemoryIdentity {
  cwd: string;
  sessionFile?: string;
  repoKey: string;
  sessionId: string;
  projectBankId: string;
  liveDocumentId: string;
  baseTags: string[];
  projectRecallTags: string[];
  globalRecallTags: string[];
}

export function uniqueTags(tags: string[]): string[] {
  return [...new Set(tags.filter(Boolean))];
}

export function mergeBaseAndExtraTags(base: string[], extra: string[] | undefined): string[] {
  return uniqueTags([...base, ...(extra ?? [])]);
}

export function createMemoryIdentity(
  cwd: string,
  config: ResolvedConfig,
  sessionFile?: string,
): MemoryIdentity {
  const sessionId = stableSessionId(sessionFile, cwd);
  return {
    cwd,
    ...(sessionFile ? { sessionFile } : {}),
    repoKey: repoKey(cwd),
    sessionId,
    projectBankId: deriveProjectBankId(cwd, config),
    liveDocumentId: liveDocumentId(sessionFile, cwd),
    baseTags: baseTags(cwd, sessionId),
    projectRecallTags: recallScopeTags(cwd),
    globalRecallTags: ["source:pi"],
  };
}

export function explicitRetainTags(
  cwd: string,
  sessionFile: string | undefined,
  extraTags: string[] | undefined,
): string[] {
  return mergeBaseAndExtraTags(baseTags(cwd, stableSessionId(sessionFile, cwd)), extraTags);
}

export { importDocumentId, liveDocumentId, stableSessionId };
