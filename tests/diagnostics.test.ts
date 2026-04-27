import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG } from "../extensions/config.js";
import { bankSelectionMessage, formatDebugReport, safeConfig } from "../extensions/diagnostics.js";

describe("diagnostics", () => {
  it("explains automatic bank selection and override", () => {
    expect(bankSelectionMessage("bank-1", DEFAULT_CONFIG)).toContain("auto-selected");
    expect(bankSelectionMessage("bank-1", DEFAULT_CONFIG)).toContain(
      "PI_HINDSIGHT_PROJECT_BANK_ID",
    );
  });

  it("explains configured bank selection", () => {
    const config = {
      ...DEFAULT_CONFIG,
      banks: {
        ...DEFAULT_CONFIG.banks,
        project: { ...DEFAULT_CONFIG.banks.project, bankId: "manual" },
      },
    };
    expect(bankSelectionMessage("manual", config)).toBe("Hindsight bank configured: manual");
  });

  it("redacts api key in debug config", () => {
    const config = {
      ...DEFAULT_CONFIG,
      hindsight: { ...DEFAULT_CONFIG.hindsight, apiKey: "secret" },
    };
    expect(safeConfig(config).hindsight.apiKey).toBe("[set]");
  });

  it("formats stable debug report", () => {
    const report = JSON.parse(
      formatDebugReport({
        cwd: process.cwd(),
        sessionFile: "/tmp/session.jsonl",
        projectBankId: "bank",
        config: DEFAULT_CONFIG,
        queueLength: 2,
        health: { ok: true },
      }),
    ) as Record<string, unknown>;

    expect(report.projectBankId).toBe("bank");
    expect(report.health).toBe("reachable");
    expect(report.queueLength).toBe(2);
    expect(report.overrideProjectBankId).toContain("PI_HINDSIGHT_PROJECT_BANK_ID");
    expect(report.tags).toEqual(expect.arrayContaining(["source:pi"]));
  });
});
