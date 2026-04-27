import { describe, expect, it } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resolveConfig } from "../extensions/config.js";

function tmp() {
  return mkdtempSync(join(tmpdir(), "pi-hindsight-"));
}

describe("resolveConfig", () => {
  it("applies project config then env overrides", () => {
    const cwd = tmp();
    mkdirSync(join(cwd, ".pi"));
    writeFileSync(
      join(cwd, ".pi", "hindsight.json"),
      JSON.stringify({ recall: { maxTokens: 123 }, banks: { project: { derive: "cwd" } } }),
    );
    const config = resolveConfig(cwd, {
      HINDSIGHT_BASE_URL: "http://h",
      PI_HINDSIGHT_PROJECT_BANK_ID: "manual-bank",
    });
    expect(config.recall.maxTokens).toBe(123);
    expect(config.hindsight.baseUrl).toBe("http://h");
    expect(config.banks.project.bankId).toBe("manual-bank");
    expect(config.banks.project.derive).toBe("manual");
  });

  it("reads boolean overrides from injected env", () => {
    const cwd = tmp();
    expect(resolveConfig(cwd, { PI_HINDSIGHT_ENABLED: "false" }).enabled).toBe(false);
    expect(resolveConfig(cwd, { PI_HINDSIGHT_ENABLED: "true" }).enabled).toBe(true);
  });

  it("normalizes invalid config values back to defaults", () => {
    const cwd = tmp();
    mkdirSync(join(cwd, ".pi"));
    writeFileSync(
      join(cwd, ".pi", "hindsight.json"),
      JSON.stringify({
        recall: { budget: "huge", maxTokens: -1, types: ["world", 42] },
        retain: { includeToolResults: "sometimes", queuePath: "" },
        import: {
          includeBranches: "all-the-branches",
          includeCompactionSummaries: false,
          includeBranchSummaries: false,
        },
        status: { style: "sparkles", maxLength: 0 },
        notifications: { startup: "yes", recall: true, retain: true },
      }),
    );

    const config = resolveConfig(cwd);
    expect(config.recall.budget).toBe("low");
    expect(config.recall.maxTokens).toBe(800);
    expect(config.recall.types).toEqual(["world", "experience", "observation"]);
    expect(config.retain.includeToolResults).toBe("meaningful-only");
    expect(config.retain.queuePath).toBe(".pi/hindsight/retain-queue.jsonl");
    expect(config.import.includeBranches).toBe("current-only");
    expect(config).not.toHaveProperty("import.includeCompactionSummaries");
    expect(config).not.toHaveProperty("import.includeBranchSummaries");
    expect(config.status.style).toBe("text");
    expect(config.status.maxLength).toBe(24);
    expect(config.notifications.startup).toBe(true);
    expect(config.notifications.recall).toBe(true);
    expect(config.notifications.retain).toBe(true);
  });
});
