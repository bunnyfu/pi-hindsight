import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join } from "node:path";
import type { UpdateMode } from "./types.js";

export type ImportDocumentStatus = "pending" | "completed" | "failed" | "skipped";

export interface ImportCheckpointDocument {
  documentId: string;
  leafId: string;
  contentHash: string;
  messageCount: number;
  status: ImportDocumentStatus;
  updatedAt: string;
  error?: string;
}

export interface ImportCheckpoint {
  version: 1;
  runId: string;
  sourceFile: string;
  bankId: string;
  sessionId: string;
  cwd: string;
  includeBranches: "current-only" | "all-leaves";
  updateMode: UpdateMode;
  startedAt: string;
  updatedAt: string;
  documents: Record<string, ImportCheckpointDocument>;
}

export function resolveImportCheckpointPath(cwd: string, checkpointPath: string): string {
  return isAbsolute(checkpointPath) ? checkpointPath : join(cwd, checkpointPath);
}

export function importRunId(args: {
  sourceFile: string;
  bankId: string;
  sessionId: string;
  includeBranches: "current-only" | "all-leaves";
}): string {
  return ["pi-import", args.bankId, args.sessionId, args.includeBranches, args.sourceFile]
    .join(":")
    .replace(/\s+/g, "_");
}

export async function readImportCheckpoint(path: string): Promise<ImportCheckpoint | undefined> {
  try {
    const parsed = JSON.parse(await readFile(path, "utf8")) as unknown;
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed))
      throw new Error("import checkpoint must be a JSON object");
    const record = parsed as ImportCheckpoint;
    return { ...record, version: 1, documents: record.documents ?? {} };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error;
  }
}

export async function writeImportCheckpoint(
  path: string,
  checkpoint: ImportCheckpoint,
): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const tmp = `${path}.tmp`;
  await writeFile(tmp, `${JSON.stringify(checkpoint, null, 2)}\n`, "utf8");
  await rename(tmp, path);
}

export function createImportCheckpoint(args: {
  runId: string;
  sourceFile: string;
  bankId: string;
  sessionId: string;
  cwd: string;
  includeBranches: "current-only" | "all-leaves";
  updateMode: UpdateMode;
  now: string;
}): ImportCheckpoint {
  return {
    version: 1,
    runId: args.runId,
    sourceFile: args.sourceFile,
    bankId: args.bankId,
    sessionId: args.sessionId,
    cwd: args.cwd,
    includeBranches: args.includeBranches,
    updateMode: args.updateMode,
    startedAt: args.now,
    updatedAt: args.now,
    documents: {},
  };
}
