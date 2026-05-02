import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG } from "../extensions/config.js";
import { routeMemoryCandidate, type MemoryRouterAdapter } from "../extensions/memory-router.js";

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
      signals: ["global"],
    });
    expect(decision.reason).toContain("dry-run only");
    expect(decision.matchedSignals).toEqual(
      expect.arrayContaining(["preference", "cross-project workflow/style"]),
    );
  });

  it("can describe router writes when router mode is enabled", () => {
    const decision = routeMemoryCandidate({
      content: "Kai prefers terse replies for this repo config workflow",
      config: { ...DEFAULT_CONFIG, globalRetain: { mode: "router" } },
    });

    expect(decision.route).toBe("both");
    expect(decision.writes).toEqual(["project", "global"]);
  });

  it("passes mission context through the router adapter seam", () => {
    const calls: unknown[] = [];
    const adapter: MemoryRouterAdapter = {
      classify(args) {
        calls.push(args);
        return {
          route: "global",
          confidence: 0.9,
          signals: ["global"],
          matchedSignals: ["mission"],
        };
      },
    };

    const decision = routeMemoryCandidate(
      {
        content: "remember this",
        config: {
          ...DEFAULT_CONFIG,
          banks: {
            ...DEFAULT_CONFIG.banks,
            project: { ...DEFAULT_CONFIG.banks.project, mission: "Project mission" },
            global: { ...DEFAULT_CONFIG.banks.global, mission: "Global mission" },
          },
        },
      },
      adapter,
    );

    expect(calls[0]).toMatchObject({
      projectMission: "Project mission",
      globalMission: "Global mission",
    });
    expect(decision.projectMission).toBe("Project mission");
    expect(decision.globalMission).toBe("Global mission");
  });
});
