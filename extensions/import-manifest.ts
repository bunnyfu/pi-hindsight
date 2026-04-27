import { createHash } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join } from "node:path";
import type { UpdateMode } from "./types.js";

export interface ImportManifestEntry {
  documentId: string;
  bankId: string;
  sourceFile: string;
  importedAt: string;
  contentHash: string;
  messageCount: number;
  leafId: string;
  sessionId: string;
  cwd: string;
  includeBranches: "current-only" | "all-leaves";
  updateMode: UpdateMode;
}

export interface ImportManifest {
  version: 1;
  imports: Record<string, ImportManifestEntry>;
}

export function resolveImportManifestPath(cwd: string, manifestPath: string): string {
  return isAbsolute(manifestPath) ? manifestPath : join(cwd, manifestPath);
}

export function hashImportContent(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}

export async function readImportManifest(path: string): Promise<ImportManifest> {
  try {
    const parsed = JSON.parse(await readFile(path, "utf8")) as unknown;
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed))
      throw new Error("manifest must be a JSON object");
    const record = parsed as Partial<ImportManifest>;
    return { version: 1, imports: record.imports ?? {} };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return { version: 1, imports: {} };
    throw error;
  }
}

export async function writeImportManifest(path: string, manifest: ImportManifest): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const tmp = `${path}.tmp`;
  await writeFile(tmp, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  await rename(tmp, path);
}

export async function upsertImportManifestEntries(
  path: string,
  entries: ImportManifestEntry[],
): Promise<ImportManifest> {
  const manifest = await readImportManifest(path);
  for (const entry of entries) manifest.imports[entry.documentId] = entry;
  await writeImportManifest(path, manifest);
  return manifest;
}

export function importManifestSummary(manifest: ImportManifest): {
  count: number;
  latest?: ImportManifestEntry;
} {
  const entries = Object.values(manifest.imports).sort((a, b) =>
    b.importedAt.localeCompare(a.importedAt),
  );
  return { count: entries.length, ...(entries[0] ? { latest: entries[0] } : {}) };
}
