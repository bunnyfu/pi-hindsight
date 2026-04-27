import { readFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { HindsightLikeClient, ResolvedConfig } from "./types.js";
import { importDocumentId, stableSessionId } from "./session.js";
import { parseImportSessionJsonl, parsePiSessionJsonl } from "./import-parser.js";
import { leafIds, selectImportBranches } from "./import-branches.js";
import { resolveImportManifestPath, upsertImportManifestEntries } from "./import-manifest.js";
import { retainImportBranch } from "./import-retain.js";

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
  const manifestPath = resolveImportManifestPath(cwd, args.config.import.manifestPath);

  const retained = await Promise.all(
    branches.map((branch) =>
      retainImportBranch({
        sessionFile: args.sessionFile,
        bankId: args.bankId,
        client: args.client,
        config: args.config,
        parsed,
        cwd,
        sessionId,
        leaves,
        branch,
      }),
    ),
  );

  const documents = retained.map((result) => result.document);
  await upsertImportManifestEntries(
    manifestPath,
    retained.map((result) => result.manifestEntry),
  );

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
