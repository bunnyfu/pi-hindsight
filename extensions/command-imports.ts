import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import type { createMemoryOperations } from "./memory-operations.js";
import { completeFlags, firstNonFlagArg, sessionFile, argList } from "./command-utils.js";
import { renderImportSessionMessage, renderProjectImportMessage } from "./import-presentation.js";

type Operations = ReturnType<typeof createMemoryOperations>;

function importOptions(args: unknown): {
  dryRun: boolean;
  includeBranches?: "all-leaves";
} {
  const flags = new Set(argList(args));
  return {
    dryRun: flags.has("--dry-run") || flags.has("--preview"),
    ...(flags.has("--all-leaves") ? { includeBranches: "all-leaves" as const } : {}),
  };
}

function importStartMessage(scope: string, options: ReturnType<typeof importOptions>): string {
  const mode = options.dryRun ? "preview" : "import";
  const branches =
    options.includeBranches === "all-leaves" ? "all branch leaves" : "current branch";
  return `Starting Hindsight ${scope} ${mode}; branches=${branches}; write=${options.dryRun ? "no" : "yes"}`;
}

export function registerImportCommands(pi: ExtensionAPI, operations: Operations): void {
  pi.registerCommand("hindsight:import", {
    description: "Import the current Pi session JSONL into Hindsight.",
    getArgumentCompletions: (prefix) => completeFlags(prefix, ["--dry-run", "--all-leaves"]),
    handler: async (args, ctx) => {
      const current = ctx.sessionManager.getSessionFile?.();
      if (!current) {
        ctx.ui.notify(
          "No session file available; use hindsight_import tool with sessionFile.",
          "warning",
        );
        return;
      }
      const options = importOptions(args);
      ctx.ui.notify(importStartMessage("current session", options), "info");
      const result = await operations.importSession({
        sessionFile: current,
        cwd: ctx.cwd,
        ...options,
      });
      ctx.ui.notify(renderImportSessionMessage(result), "info");
    },
  });

  pi.registerCommand("hindsight:import-current", {
    description: "Import the current Pi session JSONL into Hindsight.",
    getArgumentCompletions: (prefix) => completeFlags(prefix, ["--dry-run", "--all-leaves"]),
    handler: async (args, ctx) => {
      const current = sessionFile(ctx);
      if (!current) {
        ctx.ui.notify("No current session file available.", "warning");
        return;
      }
      const options = importOptions(args);
      ctx.ui.notify(importStartMessage("current session", options), "info");
      const result = await operations.importSession({
        sessionFile: current,
        cwd: ctx.cwd,
        ...options,
      });
      ctx.ui.notify(renderImportSessionMessage(result, "current"), "info");
    },
  });

  pi.registerCommand("hindsight:import-file", {
    description: "Import an explicit Pi session JSONL file into Hindsight.",
    getArgumentCompletions: (prefix) => completeFlags(prefix, ["--dry-run", "--all-leaves"]),
    handler: async (args, ctx) => {
      const file = firstNonFlagArg(args);
      if (!file) {
        ctx.ui.notify("Usage: /hindsight:import-file <path> [--dry-run] [--all-leaves]", "warning");
        return;
      }
      const options = importOptions(args);
      ctx.ui.notify(importStartMessage("file", options), "info");
      const result = await operations.importSession({
        sessionFile: file,
        cwd: ctx.cwd,
        ...options,
      });
      ctx.ui.notify(renderImportSessionMessage(result, { file }), "info");
    },
  });

  pi.registerCommand("hindsight:import-project-sessions", {
    description: "Import Pi session JSONL files scoped to the current repo/cwd.",
    getArgumentCompletions: (prefix) => completeFlags(prefix, ["--dry-run", "--all-leaves"]),
    handler: async (args, ctx) => {
      const current = sessionFile(ctx);
      const options = importOptions(args);
      ctx.ui.notify(importStartMessage("project sessions", options), "info");
      const result = await operations.importProjectSessions({
        cwd: ctx.cwd,
        ...(current ? { currentSessionFile: current } : {}),
        ...options,
      });
      ctx.ui.notify(renderProjectImportMessage(result), "info");
    },
  });
}
