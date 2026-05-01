import type { HindsightLikeClient, ResolvedConfig } from "./types.js";
import { importPiSession, importProjectSessions } from "./import-sessions.js";

export type ImportOperationDeps = {
  getClient(): HindsightLikeClient;
  getConfig(): ResolvedConfig;
  getProjectBankId(): string;
};

export async function importMemorySession(
  args: {
    sessionFile: string;
    cwd?: string;
    bank?: string;
    dryRun?: boolean;
    includeBranches?: ResolvedConfig["import"]["includeBranches"];
  },
  deps: ImportOperationDeps,
) {
  const bankId = args.bank || deps.getProjectBankId();
  const result = await importPiSession({
    sessionFile: args.sessionFile,
    ...(args.cwd ? { cwd: args.cwd } : {}),
    bankId,
    client: deps.getClient(),
    config: deps.getConfig(),
    ...(args.dryRun !== undefined ? { dryRun: args.dryRun } : {}),
    ...(args.includeBranches ? { includeBranches: args.includeBranches } : {}),
  });
  return { bankId, ...result };
}

export async function importMemoryProjectSessions(
  args: {
    cwd: string;
    currentSessionFile?: string;
    searchDir?: string;
    bank?: string;
    dryRun?: boolean;
    includeBranches?: ResolvedConfig["import"]["includeBranches"];
  },
  deps: ImportOperationDeps,
) {
  const bankId = args.bank || deps.getProjectBankId();
  const result = await importProjectSessions({
    cwd: args.cwd,
    ...(args.currentSessionFile ? { currentSessionFile: args.currentSessionFile } : {}),
    ...(args.searchDir ? { searchDir: args.searchDir } : {}),
    bankId,
    client: deps.getClient(),
    config: deps.getConfig(),
    ...(args.dryRun !== undefined ? { dryRun: args.dryRun } : {}),
    ...(args.includeBranches ? { includeBranches: args.includeBranches } : {}),
  });
  return { bankId, ...result };
}
