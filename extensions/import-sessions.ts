import { readFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { HindsightLikeClient, ResolvedConfig } from "./types.js";
import { importDocumentId, stableSessionId } from "./session.js";
import { baseTags } from "./banking.js";
import { redactSecrets } from "./sanitize.js";
import { parseImportSessionJsonl, parsePiSessionJsonl } from "./import-parser.js";
import { leafIds, selectImportBranches } from "./import-branches.js";
import {
  hashImportContent,
  resolveImportManifestPath,
  upsertImportManifestEntries,
  type ImportManifestEntry,
} from "./import-manifest.js";

export { parseImportSessionJsonl, parsePiSessionJsonl } from "./import-parser.js";
export { selectImportBranches } from "./import-branches.js";
export type { ImportBranch } from "./import-branches.js";
export type { ParsedMessage, ParsedSession } from "./import-parser.js";

export interface ImportSessionDocumentResult {
  documentId: string;
  leafId: string;
  messageCount: number;
  contentHash: string;
}

export interface ImportSessionResult {
  sessionFile: string;
  documentId: string;
  messageCount: number;
  retained: boolean;
  manifestPath: string;
  documents: ImportSessionDocumentResult[];
}

export async function importPiSession(args: {
  sessionFile: string;
  bankId: string;
  client: HindsightLikeClient;
  config: ResolvedConfig;
}): Promise<ImportSessionResult> {
  const text = await readFile(args.sessionFile, "utf8");
  const parsed = parseImportSessionJsonl(text);
  const cwd = parsed.cwd ?? dirname(args.sessionFile);
  const sessionId = parsed.sessionId ?? stableSessionId(args.sessionFile, cwd);
  const leaves = leafIds(parsed.messages);
  const branches = selectImportBranches(parsed, args.config.import.includeBranches);
  const documents: ImportSessionDocumentResult[] = [];
  const manifestEntries: ImportManifestEntry[] = [];
  const manifestPath = resolveImportManifestPath(cwd, args.config.import.manifestPath);

  for (const branch of branches) {
    const leafId = branch.leafId;
    const branchMessages = branch.messages;
    const documentId = importDocumentId(sessionId, leafId);
    const updateMode = args.config.import.replaceExistingImportedDocs ? "replace" : "append";
    const contentRaw = JSON.stringify(
      {
        source: "pi-session-import",
        sessionFile: args.sessionFile,
        cwd: parsed.cwd,
        sessionId,
        branchLeafId: leafId,
        messages: branchMessages.map((message) => message.data),
      },
      null,
      2,
    );
    const content = args.config.retain.redactSecrets ? redactSecrets(contentRaw) : contentRaw;
    const contentHash = hashImportContent(content);
    const tags = [
      ...baseTags(cwd, sessionId, leafId),
      "import:historical",
      "imported:true",
      `document:${documentId}`,
    ];
    if (leaves.length > 1) tags.push("forked:true");
    await args.client.retain(args.bankId, content, {
      context: `Historical Pi session import from ${args.sessionFile}, branch ${leafId}`,
      documentId,
      updateMode,
      async: args.config.retain.async,
      tags,
      metadata: {
        pi_session_file: args.sessionFile,
        imported: "true",
        cwd,
        session_id: sessionId,
        branch_leaf_id: leafId,
        include_branches: args.config.import.includeBranches,
        ...(parsed.sessionTimestamp ? { session_timestamp: parsed.sessionTimestamp } : {}),
      },
    });
    documents.push({ documentId, leafId, messageCount: branchMessages.length, contentHash });
    manifestEntries.push({
      documentId,
      bankId: args.bankId,
      sourceFile: args.sessionFile,
      importedAt: new Date().toISOString(),
      contentHash,
      messageCount: branchMessages.length,
      leafId,
      sessionId,
      cwd,
      includeBranches: args.config.import.includeBranches,
      updateMode,
    });
  }

  await upsertImportManifestEntries(manifestPath, manifestEntries);

  const first = documents[0] ?? {
    documentId: importDocumentId(sessionId, "root"),
    leafId: "root",
    messageCount: 0,
    contentHash: "",
  };
  return {
    sessionFile: args.sessionFile,
    documentId: first.documentId,
    messageCount: documents.reduce((count, document) => count + document.messageCount, 0),
    retained: true,
    manifestPath,
    documents,
  };
}
