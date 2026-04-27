import { describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  buildProjectConfigPatch,
  deepMergeConfig,
  projectConfigPath,
  writeProjectConfig,
} from "../extensions/config-writer.js";

describe("config writer", () => {
  it("builds project bank override patch", () => {
    expect(buildProjectConfigPatch({ projectBankId: "bank", baseUrl: "http://h" })).toEqual({
      hindsight: { baseUrl: "http://h" },
      banks: { project: { enabled: true, derive: "manual", bankId: "bank" } },
    });
  });

  it("builds extended setup patches", () => {
    expect(
      buildProjectConfigPatch({
        timeoutMs: 1234,
        recallBudget: "mid",
        recallMaxTokens: 900,
        retainAsync: false,
        importIncludeBranches: "all-leaves",
        statusStyle: "emoji",
        statusDetail: "activity",
        statusMaxLength: 30,
        statusShowActivity: false,
      }),
    ).toEqual({
      hindsight: { timeoutMs: 1234 },
      recall: { budget: "mid", maxTokens: 900 },
      retain: { async: false },
      import: { includeBranches: "all-leaves" },
      status: { style: "emoji", detail: "activity", maxLength: 30, showActivity: false },
    });
  });

  it("deep merges without deleting existing config", () => {
    expect(
      deepMergeConfig(
        { recall: { maxTokens: 100 }, banks: { global: { enabled: false } } },
        { banks: { project: { bankId: "b" } } },
      ),
    ).toEqual({
      recall: { maxTokens: 100 },
      banks: { global: { enabled: false }, project: { bankId: "b" } },
    });
  });

  it("writes .pi/hindsight.json", async () => {
    const cwd = mkdtempSync(join(tmpdir(), "pi-hindsight-config-"));
    const result = await writeProjectConfig(
      cwd,
      buildProjectConfigPatch({ projectBankId: "bank" }),
    );
    expect(result.path).toBe(projectConfigPath(cwd));
    const written = JSON.parse(readFileSync(result.path, "utf8")) as Record<string, unknown>;
    expect(written).toMatchObject({ banks: { project: { bankId: "bank", derive: "manual" } } });
  });
});
