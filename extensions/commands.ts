import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import type { MemoryOperationsDeps } from "./memory-operations.js";
import { createMemoryOperations } from "./memory-operations.js";
import { runHindsightSetupTui } from "./setup-tui.js";

export function registerCommands(pi: ExtensionAPI, deps: MemoryOperationsDeps) {
  const operations = createMemoryOperations(deps);

  pi.registerCommand("hindsight:status", {
    description: "Show Hindsight extension status.",
    handler: async (_args, ctx) => {
      const status = await operations.status(ctx.cwd);
      ctx.ui.notify(
        `Hindsight ${status.config.enabled ? "on" : "off"}; bank ${status.bankId}; queue ${status.queueLength}; imports ${status.imports.count}`,
        "info",
      );
    },
  });

  pi.registerCommand("hindsight:doctor", {
    description: "Check Hindsight connectivity and queue.",
    handler: async (_args, ctx) => {
      const doctor = await operations.doctor(ctx.cwd);
      const append = doctor.capabilities
        ? doctor.capabilities.appendUpdateMode
          ? "append supported"
          : "append unsupported"
        : "append not checked";
      ctx.ui.notify(
        `Hindsight ${doctor.health.ok ? "reachable" : `unreachable: ${doctor.health.error}`}; ${append}; queue ${doctor.queueLength}; imports ${doctor.imports.count}`,
        doctor.health.ok && doctor.capabilities?.appendUpdateMode !== false ? "info" : "warning",
      );
    },
  });

  pi.registerCommand("hindsight:config", {
    description: "Show effective Hindsight config.",
    handler: async (_args, ctx) => {
      ctx.ui.notify(JSON.stringify(operations.config(), null, 2), "info");
    },
  });

  pi.registerCommand("hindsight:debug", {
    description: "Show detailed Hindsight diagnostics.",
    handler: async (_args, ctx) => {
      const debug = await operations.debug(ctx);
      ctx.ui.notify(debug.report, debug.health.ok ? "info" : "warning");
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
      const result = await operations.init(ctx.cwd);
      ctx.ui.notify(
        `Wrote ${result.path}; project bank ${result.projectBankId}. Run /hindsight:debug to verify.`,
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
      const result = await operations.importSession({ sessionFile });
      ctx.ui.notify(
        `Imported ${result.messageCount} messages as ${result.documentId}; manifest ${result.manifestPath}`,
        "info",
      );
    },
  });

  pi.registerCommand("hindsight:flush", {
    description: "Flush queued retain jobs.",
    handler: async (_args, ctx) => {
      const result = await operations.flush(ctx.cwd);
      ctx.ui.notify(
        `Hindsight flushed ${result.sent}; dead-lettered ${result.deadLettered}; remaining ${result.remaining}`,
        result.remaining || result.deadLettered ? "warning" : "info",
      );
    },
  });
}
