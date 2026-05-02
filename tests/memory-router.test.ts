import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG } from "../extensions/config.js";
import { routeMemoryCandidate } from "../extensions/memory-router.js";

describe("memory router", () => {
  it("defaults to explicit-only dry-run with no writes", () => {
    const decision = routeMemoryCandidate({
      content: "Kai prefers terse replies across projects",
      config: DEFAULT_CONFIG,
    });

    expect(decision).toMatchObject({
      route: "global",
      mode: "explicit-only",
      writes: [],
    });
    expect(decision.reason).toContain("dry-run only");
  });

  it("can describe router writes when router mode is enabled", () => {
    const decision = routeMemoryCandidate({
      content: "Kai prefers terse replies for this repo config workflow",
      config: { ...DEFAULT_CONFIG, globalRetain: { mode: "router" } },
    });

    expect(decision.route).toBe("both");
    expect(decision.writes).toEqual(["project", "global"]);
  });
});
