import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import type { HindsightLikeClient, ResolvedConfig } from "./types.js";
import { checkHindsight } from "./client.js";
import { readRetainQueue, flushRetainQueue, resolveQueuePath } from "./queue.js";
import { formatDebugReport, safeConfig } from "./diagnostics.js";
import { buildProjectConfigPatch, writeProjectConfig } from "./config-writer.js";
import { importPiSession } from "./import-sessions.js";
import { runHindsightSetupTui } from "./setup-tui.js";
import {
  importManifestSummary,
  readImportManifest,
  resolveImportManifestPath,
} from "./import-manifest.js";

export function registerCommands(
  pi: ExtensionAPI,
  deps: {
    getClient(): HindsightLikeClient;
    getConfig(): ResolvedConfig;
    getProjectBankId(): string;
    reloadConfig?(cwd: string): void;
  },
) {
  pi.registerCommand("hindsight:status", {
    description: "Show Hindsight extension status.",
    handler: async (_args, ctx) => {
      const config = deps.getConfig();
      const [queue, manifest] = await Promise.all([
        readRetainQueue(resolveQueuePath(ctx.cwd, config.retain.queuePath)),
        readImportManifest(resolveImportManifestPath(ctx.cwd, config.import.manifestPath)),
      ]);
      const imports = importManifestSummary(manifest);
      ctx.ui.notify(
        `Hindsight ${config.enabled ? "on" : "off"}; bank ${deps.getProjectBankId()}; queue ${queue.length}; imports ${imports.count}`,
        "info",
      );
    },
  });

  pi.registerCommand("hindsight:doctor", {
    description: "Check Hindsight connectivity and queue.",
    handler: async (_args, ctx) => {
      const config = deps.getConfig();
      const health = await checkHindsight(deps.getClient(), deps.getProjectBankId());
      const [queue, manifest] = await Promise.all([
        readRetainQueue(resolveQueuePath(ctx.cwd, config.retain.queuePath)),
        readImportManifest(resolveImportManifestPath(ctx.cwd, config.import.manifestPath)),
      ]);
      const imports = importManifestSummary(manifest);
      ctx.ui.notify(
        `Hindsight ${health.ok ? "reachable" : `unreachable: ${health.error}`}; queue ${queue.length}; imports ${imports.count}`,
        health.ok ? "info" : "warning",
      );
    },
  });

  pi.registerCommand("hindsight:config", {
    description: "Show effective Hindsight config.",
    handler: async (_args, ctx) => {
      ctx.ui.notify(JSON.stringify(safeConfig(deps.getConfig()), null, 2), "info");
    },
  });

  pi.registerCommand("hindsight:debug", {
    description: "Show detailed Hindsight diagnostics.",
    handler: async (_args, ctx) => {
      const config = deps.getConfig();
      const [queue, health] = await Promise.all([
        readRetainQueue(resolveQueuePath(ctx.cwd, config.retain.queuePath)),
        checkHindsight(deps.getClient(), deps.getProjectBankId()),
      ]);
      const manifestPath = resolveImportManifestPath(ctx.cwd, config.import.manifestPath);
      const manifest = await readImportManifest(manifestPath);
      const imports = importManifestSummary(manifest);
      const sessionFile = ctx.sessionManager.getSessionFile?.();
      ctx.ui.notify(
        formatDebugReport({
          cwd: ctx.cwd,
          ...(sessionFile ? { sessionFile } : {}),
          projectBankId: deps.getProjectBankId(),
          config,
          queueLength: queue.length,
          importManifestPath: manifestPath,
          importCount: imports.count,
          ...(imports.latest ? { latestImport: imports.latest } : {}),
          health,
        }),
        health.ok ? "info" : "warning",
      );
    },
  });

  pi.registerCommand("hindsight:setup", {
    description: "Open interactive Hindsight configuration TUI.",
    handler: async (_args, ctx) => {
      await runHindsightSetupTui(ctx, deps);
    },
  });

  pi.registerCommand("hindsight:init", {
    description: "Write .pi/hindsight.json with the currently selected project bank.",
    handler: async (_args, ctx) => {
      const result = await writeProjectConfig(
        ctx.cwd,
        buildProjectConfigPatch({
          projectBankId: deps.getProjectBankId(),
          baseUrl: deps.getConfig().hindsight.baseUrl,
        }),
      );
      deps.reloadConfig?.(ctx.cwd);
      ctx.ui.notify(
        `Wrote ${result.path}; project bank ${deps.getProjectBankId()}. Run /hindsight:debug to verify.`,
        "info",
      );
    },
  });

  pi.registerCommand("hindsight:import", {
    description: "Import the current Pi session JSONL into Hindsight.",
    handler: async (_args, ctx) => {
      const sessionFile = ctx.sessionManager.getSessionFile?.();
      if (!sessionFile) {
        ctx.ui.notify(
          "No session file available; use hindsight_import tool with sessionFile.",
          "warning",
        );
        return;
      }
      const result = await importPiSession({
        sessionFile,
        bankId: deps.getProjectBankId(),
        client: deps.getClient(),
        config: deps.getConfig(),
      });
      ctx.ui.notify(
        `Imported ${result.messageCount} messages as ${result.documentId}; manifest ${result.manifestPath}`,
        "info",
      );
    },
  });

  pi.registerCommand("hindsight:flush", {
    description: "Flush queued retain jobs.",
    handler: async (_args, ctx) => {
      const result = await flushRetainQueue(
        resolveQueuePath(ctx.cwd, deps.getConfig().retain.queuePath),
        deps.getClient(),
      );
      ctx.ui.notify(
        `Hindsight flushed ${result.sent}; remaining ${result.remaining}`,
        result.remaining ? "warning" : "info",
      );
    },
  });
}
