import { describe, expect, it } from "vitest";
import { composeRecallQuery, recallForContext, renderRecallBlocks } from "../extensions/recall.js";
import { DEFAULT_CONFIG } from "../extensions/config.js";
import type { AgentMessage } from "@mariozechner/pi-agent-core";

describe("recall formatting", () => {
  it("builds query from recent user messages", () => {
    const messages = [
      { role: "user", content: "first", timestamp: 1 },
      {
        role: "assistant",
        content: [{ type: "text", text: "answer" }],
        timestamp: 2,
        api: "x",
        provider: "x",
        model: "m",
        usage: {},
        stopReason: "stop",
      },
      { role: "user", content: "second", timestamp: 3 },
    ] as unknown as AgentMessage[];
    expect(composeRecallQuery(messages, 1)).toBe("user: second");
  });

  it("respects roles, context turns, max query chars, and ignores injected memory", () => {
    const messages = [
      { role: "user", content: "first user", timestamp: 1 },
      { role: "assistant", content: "first assistant", timestamp: 2 },
      { role: "user", content: "<hindsight-memory>old</hindsight-memory>", timestamp: 3 },
      { role: "assistant", content: "second assistant with long suffix", timestamp: 4 },
    ] as unknown as AgentMessage[];

    expect(
      composeRecallQuery(messages, {
        roles: ["assistant"],
        contextTurns: 1,
        maxQueryChars: 12,
      }),
    ).toBe("long suffix");
  });

  it("keeps legitimate user mentions of the hindsight-memory token", () => {
    const messages = [
      { role: "user", content: "Please explain literal <hindsight-memory> tags", timestamp: 1 },
    ] as unknown as AgentMessage[];

    expect(
      composeRecallQuery(messages, {
        roles: ["user"],
        contextTurns: 1,
        maxQueryChars: 200,
      }),
    ).toBe("user: Please explain literal <hindsight-memory> tags");
  });

  it("adds deterministic preamble and optional date", () => {
    const messages = [
      { role: "user", content: "ship it", timestamp: 1 },
    ] as unknown as AgentMessage[];

    expect(
      composeRecallQuery(messages, {
        roles: ["user"],
        contextTurns: 1,
        maxQueryChars: 200,
        preamble: "Find relevant project memory.",
        includeDate: true,
        now: new Date("2026-04-27T12:00:00.000Z"),
      }),
    ).toBe("Find relevant project memory.\n\nCurrent date: 2026-04-27\n\nuser: ship it");
  });

  it("renders memory block", () => {
    const rendered = renderRecallBlocks([
      {
        bankId: "b",
        query: "q",
        memoryCount: 1,
        rendered: "",
        results: [{ text: "Remember X", tags: ["source:pi"] }],
      },
    ]);
    expect(rendered).toContain("<hindsight-memory>");
    expect(rendered).toContain("Remember X");
  });

  it("limits rendered memories with topK", () => {
    const rendered = renderRecallBlocks(
      [
        {
          bankId: "b",
          query: "q",
          memoryCount: 2,
          rendered: "",
          results: [{ text: "one" }, { text: "two" }],
        },
      ],
      1,
    );
    expect(rendered).toContain("one");
    expect(rendered).not.toContain("two");
  });

  it("times out slow recall", async () => {
    await expect(
      recallForContext({
        client: {
          retain: async () => undefined,
          recall: async () => new Promise(() => undefined),
          reflect: async () => ({}),
        },
        config: {
          ...DEFAULT_CONFIG,
          recall: { ...DEFAULT_CONFIG.recall, timeoutMs: 5 },
        },
        scopes: [{ bankId: "b" }],
        messages: [{ role: "user", content: "q", timestamp: 1 }] as unknown as AgentMessage[],
      }),
    ).rejects.toThrow(/timed out/);
  });
});
