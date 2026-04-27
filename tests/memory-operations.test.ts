import { describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DEFAULT_CONFIG } from "../extensions/config.js";
import { createMemoryOperations } from "../extensions/memory-operations.js";
import type { HindsightLikeClient } from "../extensions/types.js";

function client(): HindsightLikeClient {
  return {
    retain: async () => undefined,
    recall: async () => [],
    reflect: async () => ({}),
  };
}

describe("memory operations", () => {
  it("configures memory profiles without implicit project/global overrides", async () => {
    const cwd = mkdtempSync(join(tmpdir(), "pi-hindsight-ops-"));
    const operations = createMemoryOperations({
      getClient: () => client(),
      getConfig: () => DEFAULT_CONFIG,
      getProjectBankId: () => "project-bank",
    });

    await operations.configure(cwd, { memoryProfile: "global-only", globalBankId: "shared" });
    let written = JSON.parse(readFileSync(join(cwd, ".pi", "hindsight.json"), "utf8")) as Record<
      string,
      any
    >;
    expect(written.banks).toMatchObject({
      project: { enabled: false },
      global: { enabled: true, bankId: "shared" },
    });

    await operations.configure(cwd, { timeoutMs: 1234 });
    written = JSON.parse(readFileSync(join(cwd, ".pi", "hindsight.json"), "utf8")) as Record<
      string,
      any
    >;
    expect(written.banks).toMatchObject({
      project: { enabled: false },
      global: { enabled: true, bankId: "shared" },
    });
    expect(written.hindsight).toMatchObject({ timeoutMs: 1234 });

    await operations.configure(cwd, { memoryProfile: "project-only", globalBankId: "shared" });
    written = JSON.parse(readFileSync(join(cwd, ".pi", "hindsight.json"), "utf8")) as Record<
      string,
      any
    >;
    expect(written.banks).toMatchObject({
      project: { enabled: true },
      global: { enabled: false },
    });
  });
});
