import { readFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { HindsightLikeClient, ResolvedConfig } from "./types.js";
import { importDocumentId, stableSessionId } from "./session.js";
import { parseImportSessionJsonl, parsePiSessionJsonl } from "./import-parser.js";
import { leafIds, selectImportBranches } from "./import-branches.js";
import { resolveImportManifestPath, upsertImportManifestEntries } from "./import-manifest.js";
import { previewImportBranch, retainImportBranch } from "./import-retain.js";

export { parseImportSessionJsonl, parsePiSessionJsonl } from "./import-parser.js";
export { selectImportBranches } from "./import-branches.js";
export type { ImportBranch } from "./import-branches.js";
export type { ParsedMessage, ParsedSession } from "./import-parser.js";

export interface ImportSessionDocumentResult {
  documentId: string;
  leafId: string;
  messageCount: number;
  contentHash: string;
  contentBytes: number;
  tags: string[];
  updateMode: "append" | "replace";
  bankId: string;
  wouldWrite: boolean;
}

export interface ImportSessionResult {
  sessionFile: string;
  documentId: string;
  messageCount: number;
  retained: boolean;
  dryRun: boolean;
  manifestPath: string;
  documents: ImportSessionDocumentResult[];
}

export async function importPiSession(args: {
  sessionFile: string;
  bankId: string;
  client: HindsightLikeClient;
  config: ResolvedConfig;
  dryRun?: boolean;
  includeBranches?: ResolvedConfig["import"]["includeBranches"];
}): Promise<ImportSessionResult> {
  const text = await readFile(args.sessionFile, "utf8");
  const parsed = parseImportSessionJsonl(text);
  const cwd = parsed.cwd ?? dirname(args.sessionFile);
  const sessionId = parsed.sessionId ?? stableSessionId(args.sessionFile, cwd);
  const leaves = leafIds(parsed.messages);
  const includeBranches = args.includeBranches ?? args.config.import.includeBranches;
  const branches = selectImportBranches(parsed, includeBranches);
  const manifestPath = resolveImportManifestPath(cwd, args.config.import.manifestPath);

  const importConfig = { ...args.config, import: { ...args.config.import, includeBranches } };
  const results = await Promise.all(
    branches.map((branch) => {
      const common = {
        sessionFile: args.sessionFile,
        bankId: args.bankId,
        config: importConfig,
        parsed,
        cwd,
        sessionId,
        leaves,
        branch,
      };
      return args.dryRun
        ? Promise.resolve(previewImportBranch(common))
        : retainImportBranch({ ...common, client: args.client });
    }),
  );

  const documents = results.map((result) => result.document);
  if (!args.dryRun) {
    await upsertImportManifestEntries(
      manifestPath,
      results.map((result) => result.manifestEntry),
    );
  }

  const first = documents[0] ?? {
    documentId: importDocumentId(sessionId, "root"),
    leafId: "root",
    messageCount: 0,
    contentHash: "",
    contentBytes: 0,
    tags: [],
    updateMode: args.config.import.replaceExistingImportedDocs ? "replace" : "append",
    bankId: args.bankId,
    wouldWrite: !args.dryRun,
  };
  return {
    sessionFile: args.sessionFile,
    documentId: first.documentId,
    messageCount: documents.reduce((count, document) => count + document.messageCount, 0),
    retained: !args.dryRun,
    dryRun: Boolean(args.dryRun),
    manifestPath,
    documents,
  };
}
