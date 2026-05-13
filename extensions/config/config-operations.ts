import {
  buildProjectConfigDeletes,
  buildProjectConfigPatch,
  writeGlobalConfig,
  writeProjectConfig,
  type ProjectConfigPatchInput,
} from "./config-writer.js";

export type ConfigOperationDeps = {
  getProjectBankId(): string;
  reloadConfig?(cwd: string): void;
};

export async function configureMemory(
  cwd: string,
  args: ProjectConfigPatchInput,
  deps: ConfigOperationDeps,
): Promise<{ path: string; config: Record<string, unknown>; projectBankId: string }> {
  const projectBankId = args.projectBankId || deps.getProjectBankId();
  const patch = buildProjectConfigPatch(args);
  const deletes = buildProjectConfigDeletes(args);
  const result =
    args.scope === "global"
      ? await writeGlobalConfig(patch, deletes)
      : await writeProjectConfig(cwd, patch, deletes);
  deps.reloadConfig?.(cwd);
  return { projectBankId, ...result };
}

export async function initMemoryConfig(
  cwd: string,
  deps: Pick<ConfigOperationDeps, "getProjectBankId"> & {
    getConfig(): { hindsight: { baseUrl: string } };
  },
): Promise<{ path: string; config: Record<string, unknown>; projectBankId: string }> {
  const projectBankId = deps.getProjectBankId();
  const result = await writeProjectConfig(
    cwd,
    buildProjectConfigPatch({
      projectBankId,
      baseUrl: deps.getConfig().hindsight.baseUrl,
    }),
  );
  return { projectBankId, ...result };
}
