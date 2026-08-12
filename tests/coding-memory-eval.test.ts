/**
 * Client-side evaluation signals for sde-bench-style coding memory:
 * conversation final-state-wins, not git-only, tool-noise compaction.
 * Not a full sde-bench harness — locks mission text and retain projection shape.
 */
import { describe, expect, it } from "vitest";
import {
  defaultProjectBankMissions,
  defaultGlobalBankMissions,
} from "../extensions/banks/bank-operations.js";
import {
  CONVERSATION_RETAIN_MISSION,
  LIVE_SESSION_RETAIN_STRATEGY,
  PI_RETAIN_STRATEGIES,
} from "../extensions/banks/retain-strategies.js";
import { getBuiltInBankTemplate } from "../extensions/banks/bank-templates.js";
import { DEFAULT_CONFIG } from "../extensions/config/config.js";
import { buildRetainJob } from "../extensions/lifecycle/retain.js";
import { toolActionTarget } from "../extensions/utils/messages.js";
import type { AgentEndEvent } from "@earendil-works/pi-coding-agent";

describe("coding memory eval signals", () => {
  it("conv-final-state: project and conversation missions require final/last state wins", () => {
    const project = defaultProjectBankMissions().retainMission;
    expect(project).toMatch(/FINAL/i);
    expect(project).toMatch(/LAST/i);
    expect(project).toMatch(/amended|superseded|rejected/i);

    expect(CONVERSATION_RETAIN_MISSION).toMatch(/FINAL/i);
    expect(CONVERSATION_RETAIN_MISSION).toMatch(/REVISES|LAST/i);
    expect(CONVERSATION_RETAIN_MISSION).toMatch(/REJECTED|superseded/i);
    // Must not encourage one-fact-per-message extraction noise.
    expect(CONVERSATION_RETAIN_MISSION).toMatch(/Do NOT emit one fact per message/i);
  });

  it("conv-not-git-only: live sessions use conversation strategy; coding template defaults to conversation", () => {
    expect(LIVE_SESSION_RETAIN_STRATEGY).toBe("conversation");
    const template = getBuiltInBankTemplate("pi-coding-project");
    expect(template?.manifest.bank?.retain_default_strategy).toBe("conversation");
    expect(PI_RETAIN_STRATEGIES.conversation?.retain_mission).toBe(CONVERSATION_RETAIN_MISSION);
    expect(PI_RETAIN_STRATEGIES.git).toBeDefined();
    expect(PI_RETAIN_STRATEGIES.gitlog).toBeDefined();

    const messages = [
      {
        role: "user",
        content: "Use port 3000. Wait — actually use 8080.",
        timestamp: Date.now(),
      },
    ] as unknown as AgentEndEvent["messages"];
    const job = buildRetainJob({
      config: DEFAULT_CONFIG,
      cwd: "/repo",
      bankId: "bank",
      messages,
    });
    expect(job?.item.strategy).toBe("conversation");
    expect(job?.updateMode).toBe("append");
    const content = job?.item.content ?? "";
    expect(content).toContain("8080");
    expect(content).toContain("3000");
  });

  it("tool-noise: compactToolCalls is default and strips large tool args", () => {
    expect(DEFAULT_CONFIG.retain.compactToolCalls).toBe(true);
    const target = toolActionTarget({
      file_path: "extensions/utils/messages.ts",
      old_string: "a".repeat(500),
      new_string: "b".repeat(500),
    });
    expect(target).toBe("extensions/utils/messages.ts");

    const messages = [
      {
        role: "assistant",
        content: [
          {
            type: "toolCall",
            name: "edit",
            arguments: {
              file_path: "src/rule.ts",
              old_string: "const PORT = 3000",
              new_string: "const PORT = 8080",
            },
          },
        ],
        timestamp: Date.now(),
      },
    ] as unknown as AgentEndEvent["messages"];
    const job = buildRetainJob({
      config: DEFAULT_CONFIG,
      cwd: "/repo",
      bankId: "bank",
      messages,
    });
    expect(job?.item.content).toContain("src/rule.ts");
    expect(job?.item.content).not.toContain("const PORT");
    expect(job?.item.content).not.toContain("old_string");
  });

  it("user bank missions stay prefs-focused (not conversation final-state dump)", () => {
    const global = defaultGlobalBankMissions().retainMission;
    expect(global).toMatch(/preferences|workflows|habits/i);
    // Global/user bank should not be the home of repo decision final-state extraction.
    expect(global).not.toMatch(/FINAL settled state/);
  });
});
