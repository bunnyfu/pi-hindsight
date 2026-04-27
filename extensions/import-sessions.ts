import { readFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { HindsightLikeClient, ResolvedConfig } from "./types.js";
import { importDocumentId, stableSessionId } from "./session.js";
import { baseTags } from "./banking.js";
import { redactSecrets } from "./sanitize.js";
import {
  hashImportContent,
  resolveImportManifestPath,
  upsertImportManifestEntries,
  type ImportManifestEntry,
} from "./import-manifest.js";

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

interface JsonlEntry {
  type?: string;
  id?: string;
  parentId?: string | null;
  timestamp?: string;
  cwd?: string;
  message?: unknown;
}

export interface ParsedMessage {
  id?: string;
  parentId: string | null;
  timestamp?: string;
  data: Record<string, unknown>;
}

export interface ParsedSession {
  cwd?: string;
  sessionId?: string;
  sessionTimestamp?: string;
  messages: ParsedMessage[];
}

export interface ImportBranch {
  leafId: string;
  messages: ParsedMessage[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function fallbackLeafId(messages: ParsedMessage[]): string {
  const last = messages.at(-1);
  if (last?.id) return last.id;
  return "root";
}

function leafIds(messages: ParsedMessage[]): string[] {
  const ids = new Set(
    messages.map((message) => message.id).filter((id): id is string => typeof id === "string"),
  );
  const parents = new Set(
    messages
      .map((message) => message.parentId)
      .filter((id): id is string => typeof id === "string"),
  );
  const leaves = [...ids].filter((id) => !parents.has(id));
  return leaves.length ? leaves : [fallbackLeafId(messages)];
}

function messagesForLeaf(messages: ParsedMessage[], leafId: string): ParsedMessage[] {
  const byId = new Map(
    messages
      .map((message) => [message.id, message])
      .filter((entry): entry is [string, ParsedMessage] => typeof entry[0] === "string"),
  );
  const path: ParsedMessage[] = [];
  const seen = new Set<string>();
  let current: string | null | undefined = leafId;

  while (current) {
    if (seen.has(current)) break;
    seen.add(current);
    const message = byId.get(current);
    if (!message) break;
    path.push(message);
    current = message.parentId;
  }

  if (!path.length && messages.length === 1) return messages;
  return path.reverse();
}

export function parseImportSessionJsonl(text: string): ParsedSession {
  const messages: ParsedMessage[] = [];
  let cwd: string | undefined;
  let sessionId: string | undefined;
  let sessionTimestamp: string | undefined;
  for (const line of text.split("\n")) {
    if (!line.trim()) continue;
    const entry = JSON.parse(line) as JsonlEntry;
    if (entry.type === "session") {
      if (typeof entry.cwd === "string") cwd = entry.cwd;
      if (typeof entry.id === "string") sessionId = entry.id;
      if (typeof entry.timestamp === "string") sessionTimestamp = entry.timestamp;
    }
    if (entry.type !== "message" || !isRecord(entry.message)) continue;
    messages.push({
      ...(typeof entry.id === "string" ? { id: entry.id } : {}),
      parentId: entry.parentId ?? null,
      ...(typeof entry.timestamp === "string" ? { timestamp: entry.timestamp } : {}),
      data: {
        ...(typeof entry.id === "string" ? { id: entry.id } : {}),
        parentId: entry.parentId ?? null,
        ...(typeof entry.timestamp === "string" ? { timestamp: entry.timestamp } : {}),
        ...entry.message,
      },
    });
  }
  return {
    ...(cwd ? { cwd } : {}),
    ...(sessionId ? { sessionId } : {}),
    ...(sessionTimestamp ? { sessionTimestamp } : {}),
    messages,
  };
}

export function parsePiSessionJsonl(text: string): {
  cwd?: string;
  messages: Record<string, unknown>[];
} {
  const parsed = parseImportSessionJsonl(text);
  return {
    ...(parsed.cwd ? { cwd: parsed.cwd } : {}),
    messages: parsed.messages.map((message) => message.data),
  };
}

export function selectImportBranches(
  parsed: ParsedSession,
  includeBranches: ResolvedConfig["import"]["includeBranches"],
): ImportBranch[] {
  const leaves = leafIds(parsed.messages);
  const selectedLeaves =
    includeBranches === "all-leaves" ? leaves : [fallbackLeafId(parsed.messages)];
  return selectedLeaves.map((leafId) => ({
    leafId,
    messages: messagesForLeaf(parsed.messages, leafId),
  }));
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
