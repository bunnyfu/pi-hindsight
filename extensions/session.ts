import { createHash } from "node:crypto";
import { basename } from "node:path";

export function stableSessionId(sessionFile: string | undefined, cwd: string): string {
  const basis = sessionFile || `ephemeral:${cwd}`;
  return createHash("sha256").update(basis).digest("hex").slice(0, 16);
}

export function liveDocumentId(sessionFile: string | undefined, cwd: string): string {
  return `pi-session:${stableSessionId(sessionFile, cwd)}`;
}

export function importDocumentId(sessionId: string, leafId: string): string {
  return `pi-import:${sessionId}:leaf:${leafId}`;
}

export function contextLabel(cwd: string, sessionFile: string | undefined): string {
  const suffix = sessionFile ? `, session ${basename(sessionFile)}` : ", ephemeral session";
  return `Pi coding session for repo "${basename(cwd)}"${suffix}`;
}

export function getSessionFile(ctx: {
  sessionManager?: { getSessionFile?: () => string | undefined };
}): string | undefined {
  return ctx.sessionManager?.getSessionFile?.();
}
