import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG } from "../extensions/config.js";
import { formatHindsightStatus } from "../extensions/status.js";

describe("formatHindsightStatus", () => {
  it("separates style from detail and truncates length", () => {
    const config = {
      ...DEFAULT_CONFIG,
      status: {
        style: "text" as const,
        detail: "verbose" as const,
        maxLength: 16,
        showActivity: true,
      },
    };
    const value = formatHindsightStatus(config, {
      cwd: "/tmp/pi-hindsight",
      projectBankId: "pi-project-pi-hindsight-fe5616d2dd10",
      activity: "recalled",
      memoryCount: 3,
    });
    expect(value).toBeDefined();
    expect(value!.length).toBeLessThanOrEqual(16);
    expect(value).toMatch(/^mem:/);
  });

  it("supports emoji minimal status", () => {
    const config = {
      ...DEFAULT_CONFIG,
      status: {
        style: "emoji" as const,
        detail: "minimal" as const,
        maxLength: 20,
        showActivity: true,
      },
    };
    expect(
      formatHindsightStatus(config, { cwd: "/repo", projectBankId: "bank", activity: "retaining" }),
    ).toBe("🧠");
  });

  it("shows activity without long bank name when detail is activity", () => {
    const config = {
      ...DEFAULT_CONFIG,
      status: {
        style: "emoji" as const,
        detail: "activity" as const,
        maxLength: 40,
        showActivity: true,
      },
    };
    expect(
      formatHindsightStatus(config, {
        cwd: "/repo",
        projectBankId: "pi-project-bank-123",
        activity: "recalling",
      }),
    ).toBe("🧠 recalling");
  });

  it("uses brain explosion for failed emoji status", () => {
    const config = {
      ...DEFAULT_CONFIG,
      status: {
        style: "emoji" as const,
        detail: "activity" as const,
        maxLength: 40,
        showActivity: true,
      },
    };
    expect(
      formatHindsightStatus(config, {
        cwd: "/repo",
        projectBankId: "bank",
        activity: "recall-failed",
      }),
    ).toBe("🤯 recall-failed");
  });

  it("uses idle text instead of implying verified connectivity", () => {
    const config = {
      ...DEFAULT_CONFIG,
      status: {
        style: "text" as const,
        detail: "activity" as const,
        maxLength: 20,
        showActivity: true,
      },
    };
    expect(
      formatHindsightStatus(config, { cwd: "/repo", projectBankId: "bank", activity: "idle" }),
    ).toBe("mem:idle");
  });

  it("can hide status", () => {
    const config = {
      ...DEFAULT_CONFIG,
      status: {
        style: "off" as const,
        detail: "project" as const,
        maxLength: 20,
        showActivity: true,
      },
    };
    expect(
      formatHindsightStatus(config, { cwd: "/repo", projectBankId: "bank", activity: "idle" }),
    ).toBeUndefined();
  });
});
