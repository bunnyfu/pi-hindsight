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
    expect(report.capabilities).toMatchObject({
      appendUpdateMode: "not checked",
      appendFallback: "error",
    });
    expect(report.bankMissions).toEqual({ projectConfigured: false, globalConfigured: false });
    expect(report.observations).toEqual({
      enabled: true,
      scopes: [["harness:pi"], [expect.stringMatching(/^repo:/)]],
    });
    expect(report.overrideProjectBankId).toContain("PI_HINDSIGHT_PROJECT_BANK_ID");
    expect(report.tags).toEqual(expect.arrayContaining(["source:pi"]));
  });

  it("formats observation scope diagnostics", () => {
    const report = JSON.parse(
      formatDebugReport({
        cwd: process.cwd(),
        projectBankId: "bank",
        config: {
          ...DEFAULT_CONFIG,
          observations: { enabled: true, scopes: [["repo:{repoKey}"], ["bank:{projectBankId}"]] },
        },
        queueLength: 0,
      }),
    ) as Record<string, any>;

    expect(report.observations.enabled).toBe(true);
    expect(report.observations.scopes).toEqual([[expect.stringMatching(/^repo:/)], ["bank:bank"]]);
  });

  it("formats append capability diagnostics", () => {
    const report = JSON.parse(
      formatDebugReport({
        cwd: process.cwd(),
        projectBankId: "bank",
        config: DEFAULT_CONFIG,
        queueLength: 0,
        capabilities: {
          appendUpdateMode: false,
          checkedAt: "2026-04-27T12:00:00.000Z",
          error: "unsupported",
          probeDocumentId: "pi-hindsight-capability:append:bank",
        },
      }),
    ) as Record<string, unknown>;

    expect(report.capabilities).toMatchObject({
      appendUpdateMode: "unsupported",
      appendFallback: "error",
      error: "unsupported",
      probeDocumentId: "pi-hindsight-capability:append:bank",
      action: "Upgrade Hindsight or set retain.appendFallback to per-turn-documents.",
    });
  });
});
