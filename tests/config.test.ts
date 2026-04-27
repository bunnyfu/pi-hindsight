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
});
