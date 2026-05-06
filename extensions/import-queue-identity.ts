import type { RetainJob, UpdateMode } from "./types.js";

export interface ImportRetainIdentity {
  bankId: string;
  documentId: string;
  updateMode: UpdateMode;
  sourceFile: string;
  cwd: string;
  sessionId: string;
  leafId: string;
  includeBranches: "current-only" | "all-leaves";
  importMode?: "curated" | "raw" | "forensic" | undefined;
  toolResults?: "errors-only" | "summary" | "content" | undefined;
  importQualityProfile?: "compatible" | "strict" | undefined;
  projectionVersion?: string | undefined;
  importProfile?: string | undefined;
  chunkIndex?: number | undefined;
  messageRange?: { start: number; end: number } | undefined;
  contentHash: string;
}

const IMPORT_RETAIN_METADATA_KEYS = [
  "pi_session_file",
  "imported",
  "cwd",
  "session_id",
  "branch_leaf_id",
  "import_mode",
  "import_quality_profile",
  "projection_version",
  "import_profile",
  "chunk_index",
  "message_range_start",
  "message_range_end",
  "content_hash",
  "include_branches",
  "tool_results",
] as const;

function identityMetadata(identity: ImportRetainIdentity): Record<string, string | undefined> {
  return {
    pi_session_file: identity.sourceFile,
    imported: "true",
    cwd: identity.cwd,
    session_id: identity.sessionId,
    branch_leaf_id: identity.leafId,
    import_mode: identity.importMode,
    import_quality_profile: identity.importQualityProfile,
    projection_version: identity.projectionVersion,
    import_profile: identity.importProfile,
    ...(identity.chunkIndex !== undefined ? { chunk_index: String(identity.chunkIndex) } : {}),
    ...(identity.messageRange
      ? {
          message_range_start: String(identity.messageRange.start),
          message_range_end: String(identity.messageRange.end),
        }
      : {}),
    content_hash: identity.contentHash,
    include_branches: identity.includeBranches,
    tool_results: identity.toolResults,
  };
}

function recordEqual(
  left: Record<string, string> | undefined,
  right: Record<string, string> | undefined,
): boolean {
  const leftEntries = Object.entries(left ?? {}).sort(([a], [b]) => a.localeCompare(b));
  const rightEntries = Object.entries(right ?? {}).sort(([a], [b]) => a.localeCompare(b));
  return JSON.stringify(leftEntries) === JSON.stringify(rightEntries);
}

function stableEqual(left: unknown, right: unknown): boolean {
  return JSON.stringify(left ?? null) === JSON.stringify(right ?? null);
}

export function isImportRetainJob(job: RetainJob): boolean {
  return (
    job.item.metadata?.source === "pi-hindsight" &&
    job.item.metadata.retainSource === "import" &&
    job.item.metadata.imported === "true"
  );
}

export function importRetainJobMatchesReference(job: RetainJob, reference: RetainJob): boolean {
  return (
    job.bankId === reference.bankId &&
    job.documentId === reference.documentId &&
    job.updateMode === reference.updateMode &&
    isImportRetainJob(job) &&
    isImportRetainJob(reference) &&
    job.item.content === reference.item.content &&
    job.item.context === reference.item.context &&
    recordEqual(job.item.metadata, reference.item.metadata) &&
    stableEqual(job.item.tags, reference.item.tags) &&
    stableEqual(job.item.observationScopes, reference.item.observationScopes)
  );
}

export function staleImportRetainJobForReference(job: RetainJob, reference: RetainJob): boolean {
  return (
    job.bankId === reference.bankId &&
    job.documentId === reference.documentId &&
    isImportRetainJob(job) &&
    !importRetainJobMatchesReference(job, reference)
  );
}

export function importRetainJobMatchesIdentity(
  job: RetainJob,
  identity: ImportRetainIdentity,
): boolean {
  if (
    job.bankId !== identity.bankId ||
    job.documentId !== identity.documentId ||
    job.updateMode !== identity.updateMode ||
    !isImportRetainJob(job)
  ) {
    return false;
  }
  const expected = identityMetadata(identity);
  const metadata = job.item.metadata ?? {};
  return IMPORT_RETAIN_METADATA_KEYS.every((key) => metadata[key] === expected[key]);
}
