import type { ExtensionCommandContext } from "@mariozechner/pi-coding-agent";
import type { ResolvedConfig } from "./types.js";
import { buildProjectConfigPatch, writeProjectConfig } from "./config-writer.js";

type Deps = {
  getConfig(): ResolvedConfig;
  getProjectBankId(): string;
  reloadConfig?(cwd: string): void;
};

const DONE = "Done";
const CANCEL = "Cancel";

function parsePositiveInt(value: string | undefined, field: string): number | undefined {
  if (value === undefined || value.trim() === "") return undefined;
  const parsed = Number(value.trim());
  if (!Number.isInteger(parsed) || parsed <= 0)
    throw new Error(`${field} must be a positive integer`);
  return parsed;
}

async function writeAndReload(
  ctx: ExtensionCommandContext,
  deps: Deps,
  patch: Record<string, unknown>,
): Promise<void> {
  const result = await writeProjectConfig(ctx.cwd, patch);
  deps.reloadConfig?.(ctx.cwd);
  ctx.ui.notify(`Wrote ${result.path}`, "info");
}

function statusLines(config: ResolvedConfig, projectBankId: string): string[] {
  return [
    `enabled: ${config.enabled}`,
    `baseUrl: ${config.hindsight.baseUrl}`,
    `timeoutMs: ${config.hindsight.timeoutMs}`,
    `projectBankId: ${projectBankId}${config.banks.project.bankId ? " (configured)" : " (auto)"}`,
    `global: ${config.banks.global.enabled ? (config.banks.global.bankId ?? "enabled, no id") : "disabled"}`,
    `recall: ${config.recall.enabled}, ${config.recall.budget}, ${config.recall.maxTokens} tokens`,
    `retain: ${config.retain.enabled}, async=${config.retain.async}, update=${config.retain.updateMode}`,
    `queuePath: ${config.retain.queuePath}`,
    `import branches: ${config.import.includeBranches}`,
    `import manifest: ${config.import.manifestPath}`,
    `status: ${config.status.style}, ${config.status.detail}, max=${config.status.maxLength}, activity=${config.status.showActivity}`,
  ];
}

export async function runHindsightSetupTui(
  ctx: ExtensionCommandContext,
  deps: Deps,
): Promise<void> {
  while (true) {
    const config = deps.getConfig();
    const projectBankId = deps.getProjectBankId();
    const choice = await ctx.ui.select("Hindsight setup", [
      ...statusLines(config, projectBankId).map((line) => `· ${line}`),
      "Set project bank ID",
      "Set Hindsight base URL",
      "Set timeout (ms)",
      config.enabled ? "Disable extension" : "Enable extension",
      config.banks.global.enabled ? "Disable global bank" : "Enable global bank",
      "Set global bank ID",
      config.recall.enabled ? "Disable recall" : "Enable recall",
      "Set recall budget",
      "Set recall max tokens",
      config.retain.enabled ? "Disable retain" : "Enable retain",
      config.retain.async ? "Use sync retain flush" : "Use async retain mode",
      "Set retain queue path",
      "Set import branch mode",
      "Set import manifest path",
      "Set status style",
      "Set status detail",
      "Set status max length",
      config.status.showActivity ? "Hide status activity" : "Show status activity",
      DONE,
      CANCEL,
    ]);

    if (!choice || choice === CANCEL || choice === DONE) return;
    if (choice.startsWith("· ")) continue;

    try {
      if (choice === "Set project bank ID") {
        const value = await ctx.ui.input("Project bank ID", projectBankId);
        if (value)
          await writeAndReload(ctx, deps, buildProjectConfigPatch({ projectBankId: value.trim() }));
      } else if (choice === "Set Hindsight base URL") {
        const value = await ctx.ui.input("Hindsight base URL", config.hindsight.baseUrl);
        if (value)
          await writeAndReload(ctx, deps, buildProjectConfigPatch({ baseUrl: value.trim() }));
      } else if (choice === "Set timeout (ms)") {
        const value = await ctx.ui.input(
          "Timeout in milliseconds",
          String(config.hindsight.timeoutMs),
        );
        const timeoutMs = parsePositiveInt(value, "timeoutMs");
        if (timeoutMs !== undefined)
          await writeAndReload(ctx, deps, buildProjectConfigPatch({ timeoutMs }));
      } else if (choice === "Disable extension" || choice === "Enable extension") {
        await writeAndReload(
          ctx,
          deps,
          buildProjectConfigPatch({ enabled: choice === "Enable extension" }),
        );
      } else if (choice === "Disable global bank" || choice === "Enable global bank") {
        await writeAndReload(
          ctx,
          deps,
          buildProjectConfigPatch({ enableGlobalBank: choice === "Enable global bank" }),
        );
      } else if (choice === "Set global bank ID") {
        const value = await ctx.ui.input("Global bank ID", config.banks.global.bankId ?? "");
        if (value)
          await writeAndReload(ctx, deps, buildProjectConfigPatch({ globalBankId: value.trim() }));
      } else if (choice === "Disable recall" || choice === "Enable recall") {
        await writeAndReload(
          ctx,
          deps,
          buildProjectConfigPatch({ recallEnabled: choice === "Enable recall" }),
        );
      } else if (choice === "Set recall budget") {
        const value = await ctx.ui.select("Recall budget", ["low", "mid", "high", CANCEL]);
        if (value && value !== CANCEL)
          await writeAndReload(
            ctx,
            deps,
            buildProjectConfigPatch({ recallBudget: value as "low" | "mid" | "high" }),
          );
      } else if (choice === "Set recall max tokens") {
        const value = await ctx.ui.input("Recall max tokens", String(config.recall.maxTokens));
        const recallMaxTokens = parsePositiveInt(value, "recallMaxTokens");
        if (recallMaxTokens !== undefined)
          await writeAndReload(ctx, deps, buildProjectConfigPatch({ recallMaxTokens }));
      } else if (choice === "Disable retain" || choice === "Enable retain") {
        await writeAndReload(
          ctx,
          deps,
          buildProjectConfigPatch({ retainEnabled: choice === "Enable retain" }),
        );
      } else if (choice === "Use sync retain flush" || choice === "Use async retain mode") {
        await writeAndReload(
          ctx,
          deps,
          buildProjectConfigPatch({ retainAsync: choice === "Use async retain mode" }),
        );
      } else if (choice === "Set retain queue path") {
        const value = await ctx.ui.input("Retain queue path", config.retain.queuePath);
        if (value)
          await writeAndReload(ctx, deps, buildProjectConfigPatch({ queuePath: value.trim() }));
      } else if (choice === "Set import branch mode") {
        const value = await ctx.ui.select("Import branch mode", [
          "current-only",
          "all-leaves",
          CANCEL,
        ]);
        if (value && value !== CANCEL)
          await writeAndReload(
            ctx,
            deps,
            buildProjectConfigPatch({
              importIncludeBranches: value as "current-only" | "all-leaves",
            }),
          );
      } else if (choice === "Set import manifest path") {
        const value = await ctx.ui.input("Import manifest path", config.import.manifestPath);
        if (value)
          await writeAndReload(
            ctx,
            deps,
            buildProjectConfigPatch({ importManifestPath: value.trim() }),
          );
      } else if (choice === "Set status style") {
        const value = await ctx.ui.select("Status style", [
          "off",
          "text",
          "emoji",
          "nerdfont",
          CANCEL,
        ]);
        if (value && value !== CANCEL)
          await writeAndReload(
            ctx,
            deps,
            buildProjectConfigPatch({
              statusStyle: value as "off" | "text" | "emoji" | "nerdfont",
            }),
          );
      } else if (choice === "Set status detail") {
        const value = await ctx.ui.select("Status detail", [
          "minimal",
          "project",
          "activity",
          "verbose",
          CANCEL,
        ]);
        if (value && value !== CANCEL)
          await writeAndReload(
            ctx,
            deps,
            buildProjectConfigPatch({
              statusDetail: value as "minimal" | "project" | "activity" | "verbose",
            }),
          );
      } else if (choice === "Set status max length") {
        const value = await ctx.ui.input("Status max length", String(config.status.maxLength));
        const statusMaxLength = parsePositiveInt(value, "statusMaxLength");
        if (statusMaxLength !== undefined)
          await writeAndReload(ctx, deps, buildProjectConfigPatch({ statusMaxLength }));
      } else if (choice === "Hide status activity" || choice === "Show status activity") {
        await writeAndReload(
          ctx,
          deps,
          buildProjectConfigPatch({ statusShowActivity: choice === "Show status activity" }),
        );
      }
    } catch (error) {
      ctx.ui.notify(error instanceof Error ? error.message : String(error), "error");
    }
  }
}
