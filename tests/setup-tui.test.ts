import { describe, expect, it } from "vitest";
import { buildRetainReceiptStatusFacts } from "../extensions/setup-tui.js";

const receipt = {
  createdAt: "2026-05-02T00:00:00.000Z",
  bankId: "global-luxus",
  documentId: "pi-explicit:session123:abcdef1234567890",
  queueJobId: "job-1",
  updateMode: "replace" as const,
  source: "tool" as const,
  context: "context",
  tags: ["preference"],
};

describe("setup TUI receipt facts", () => {
  it("shows recent exact retain document IDs without raw content", () => {
    expect(buildRetainReceiptStatusFacts([receipt])).toEqual([
      ["Recent retain", "global-luxus pi-explicit:abcdef1234567890"],
    ]);
  });

  it("shows empty receipt state", () => {
    expect(buildRetainReceiptStatusFacts([])).toEqual([["Retain receipts", "none"]]);
  });
});
