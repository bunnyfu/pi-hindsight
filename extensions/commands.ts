import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import type { MemoryOperationsDeps } from "./memory-operations.js";
import { createMemoryOperations } from "./memory-operations.js";
import { runHindsightSetupTui } from "./setup-tui.js";
import { registerImportCommands } from "./command-imports.js";
import { registerMaintenanceCommands } from "./command-maintenance.js";
import { registerSessionCommands } from "./command-session.js";

export function registerCommands(pi: ExtensionAPI, deps: MemoryOperationsDeps) {
  const operations = createMemoryOperations(deps);

  pi.registerCommand("hindsight", {
    description: "Open Hindsight memory TUI.",
    handler: async (_args, ctx) => {
      await runHindsightSetupTui(ctx, deps);
    },
  });

  pi.registerCommand("hindsight:init", {
    description: "Write .pi/hindsight.json with the currently selected project bank.",
    handler: async (_args, ctx) => {
      const result = await operations.init(ctx.cwd);
      ctx.ui.notify(
        `Wrote ${result.path}; project bank ${result.projectBankId}. Run /hindsight to inspect status.`,
        "info",
      );
    },
  });

  registerImportCommands(pi, operations);
  registerSessionCommands(pi, operations);
  registerMaintenanceCommands(pi, operations);
}
