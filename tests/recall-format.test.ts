import { describe, expect, it } from "vitest";
import { composeRecallQuery, renderRecallBlocks } from "../extensions/recall.js";
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
    expect(composeRecallQuery(messages, 1)).toBe("second");
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
});
