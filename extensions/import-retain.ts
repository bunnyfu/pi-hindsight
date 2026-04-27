import type { HindsightLikeClient, ResolvedConfig } from "./types.js";
import { importDocumentId } from "./session.js";
import { baseTags } from "./banking.js";
import { redactSecrets } from "./sanitize.js";
import { hashImportContent, type ImportManifestEntry } from "./import-manifest.js";
import type { ImportBranch } from "./import-branches.js";
import type { ParsedSession } from "./import-parser.js";

export interface ImportRetainArgs {
  sessionFile: string;
  bankId: string;
  client: HindsightLikeClient;
  config: ResolvedConfig;
  parsed: ParsedSession;
  cwd: string;
  sessionId: string;
  leaves: string[];
  branch: ImportBranch;
}

export interface ImportRetainResult {
  document: {
    documentId: string;
    leafId: string;
    messageCount: number;
    contentHash: string;
  };
  manifestEntry: ImportManifestEntry;
}

export async function retainImportBranch(args: ImportRetainArgs): Promise<ImportRetainResult> {
  const leafId = args.branch.leafId;
  const branchMessages = args.branch.messages;
  const documentId = importDocumentId(args.sessionId, leafId);
  const updateMode = args.config.import.replaceExistingImportedDocs ? "replace" : "append";
  const contentRaw = JSON.stringify(
    {
      source: "pi-session-import",
      sessionFile: args.sessionFile,
      cwd: args.parsed.cwd,
      sessionId: args.sessionId,
      branchLeafId: leafId,
      messages: branchMessages.map((message) => message.data),
    },
    null,
    2,
  );
  const content = args.config.retain.redactSecrets ? redactSecrets(contentRaw) : contentRaw;
  const contentHash = hashImportContent(content);
  const tags = [
    ...baseTags(args.cwd, args.sessionId, leafId),
    "import:historical",
    "imported:true",
    `document:${documentId}`,
  ];
  if (args.leaves.length > 1) tags.push("forked:true");
  await args.client.retain(args.bankId, content, {
    context: `Historical Pi session import from ${args.sessionFile}, branch ${leafId}`,
    documentId,
    updateMode,
    async: args.config.retain.async,
    tags,
    metadata: {
      pi_session_file: args.sessionFile,
      imported: "true",
      cwd: args.cwd,
      session_id: args.sessionId,
      branch_leaf_id: leafId,
      include_branches: args.config.import.includeBranches,
      ...(args.parsed.sessionTimestamp ? { session_timestamp: args.parsed.sessionTimestamp } : {}),
    },
  });
  return {
    document: { documentId, leafId, messageCount: branchMessages.length, contentHash },
    manifestEntry: {
      documentId,
      bankId: args.bankId,
      sourceFile: args.sessionFile,
      importedAt: new Date().toISOString(),
      contentHash,
      messageCount: branchMessages.length,
      leafId,
      sessionId: args.sessionId,
      cwd: args.cwd,
      includeBranches: args.config.import.includeBranches,
      updateMode,
    },
  };
}
