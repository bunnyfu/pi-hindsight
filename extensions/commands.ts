import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import type { MemoryOperationsDeps } from "./memory-operations.js";
import { createMemoryOperations } from "./memory-operations.js";
import { runHindsightSetupTui } from "./setup-tui.js";
import type { SessionMemoryMode } from "./session-memory-meta.js";

function firstArg(args: unknown): string | undefined {
  if (Array.isArray(args)) return typeof args[0] === "string" ? args[0] : undefined;
  if (typeof args === "string") return args.split(/\s+/).filter(Boolean)[0];
  return undefined;
}

function secondArg(args: unknown): string | undefined {
  if (Array.isArray(args)) return typeof args[1] === "string" ? args[1] : undefined;
  if (typeof args === "string") return args.split(/\s+/).filter(Boolean)[1];
  return undefined;
}

function sessionFile(ctx: {
  sessionManager?: { getSessionFile?: () => string | undefined };
}): string | undefined {
  return ctx.sessionManager?.getSessionFile?.();
}

function isSessionMode(value: string | undefined): value is SessionMemoryMode {
  return value === "normal" || value === "read-only" || value === "ignored";
}

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

  pi.registerCommand("hindsight:session", {
    description: "Show current Hindsight session memory mode and tags.",
    handler: async (_args, ctx) => {
      const result = await operations.session(ctx.cwd, sessionFile(ctx));
      ctx.ui.notify(
        `Hindsight session mode=${result.meta.mode}; recall=${result.effective.recall}; retain=${result.effective.retain}; tags=${result.meta.tags.join(",") || "none"}`,
        "info",
      );
    },
  });

  pi.registerCommand("hindsight:mode", {
    description: "Set session memory mode: normal, read-only, or ignored.",
    handler: async (args, ctx) => {
      const mode = firstArg(args);
      if (!isSessionMode(mode)) {
        ctx.ui.notify("Usage: /hindsight:mode normal|read-only|ignored", "warning");
        return;
      }
      const result = await operations.setSessionMode(ctx.cwd, sessionFile(ctx), mode);
      ctx.ui.notify(
        `Hindsight session mode=${result.meta.mode}; recall=${result.effective.recall}; retain=${result.effective.retain}`,
        "info",
      );
    },
  });

  pi.registerCommand("hindsight:retain", {
    description: "Enable or disable retain for this session.",
    handler: async (args, ctx) => {
      const value = firstArg(args);
      if (value !== "on" && value !== "off") {
        ctx.ui.notify("Usage: /hindsight:retain on|off", "warning");
        return;
      }
      const result = await operations.setSessionRetain(ctx.cwd, sessionFile(ctx), value === "on");
      ctx.ui.notify(
        `Hindsight session retain requested=${value}; effective=${result.effective.retain ? "on" : "off"}; mode=${result.meta.mode}`,
        "info",
      );
    },
  });

  pi.registerCommand("hindsight:tag", {
    description: "Add or remove a Hindsight tag for this session.",
    handler: async (args, ctx) => {
      const action = firstArg(args);
      const tag = secondArg(args);
      if ((action !== "add" && action !== "remove") || !tag) {
        ctx.ui.notify("Usage: /hindsight:tag add|remove <tag>", "warning");
        return;
      }
      const result =
        action === "add"
          ? await operations.addSessionTag(ctx.cwd, sessionFile(ctx), tag)
          : await operations.removeSessionTag(ctx.cwd, sessionFile(ctx), tag);
      ctx.ui.notify(`Hindsight session tags=${result.meta.tags.join(",") || "none"}`, "info");
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
