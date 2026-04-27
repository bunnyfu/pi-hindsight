import { describe, expect, it, vi } from "vitest";
import { mkdtempSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DEFAULT_CONFIG } from "../extensions/config.js";
import { registerCommands } from "../extensions/commands.js";
import { setSessionMemoryMode } from "../extensions/session-memory-meta.js";
import type { HindsightLikeClient } from "../extensions/types.js";

function client(): HindsightLikeClient {
  return {
    retain: async () => undefined,
    recall: async () => [],
    reflect: async () => ({}),
  };
}

describe("hindsight commands", () => {
  it("reports requested and effective retain state under read-only mode", async () => {
    const cwd = mkdtempSync(join(tmpdir(), "pi-hindsight-commands-"));
    mkdirSync(join(cwd, ".git"));
    const sessionFile = join(cwd, "session.jsonl");
    await setSessionMemoryMode(cwd, sessionFile, "read-only");
    const commands = new Map<string, { handler: (args: unknown, ctx: any) => Promise<void> }>();
    registerCommands(
      {
        registerCommand: (
          name: string,
          command: { handler: (args: unknown, ctx: any) => Promise<void> },
        ) => {
          commands.set(name, command);
        },
      } as any,
      {
        getClient: () => client(),
        getConfig: () => DEFAULT_CONFIG,
        getProjectBankId: () => "bank",
      },
    );
    const ctx = {
      cwd,
      ui: { notify: vi.fn(), setStatus: vi.fn() },
      sessionManager: { getSessionFile: () => sessionFile },
    };

    await commands.get("hindsight:retain")?.handler(["on"], ctx);

    expect(ctx.ui.notify).toHaveBeenCalledWith(
      "Hindsight session retain requested=on; effective=off; mode=read-only",
      "info",
    );
  });
});
