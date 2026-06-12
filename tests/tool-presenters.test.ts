import { describe, expect, it } from "vitest";
import { retainToolResponse } from "../extensions/tui/tool-presenters.js";

describe("tool presenters", () => {
  it("summarizes immediate retain results", () => {
    const response = retainToolResponse({
      bankId: "bank",
      documentId: "doc-1",
      remaining: 0,
      deadLettered: 0,
      operationIds: ["op-1"],
    } as never);

    expect(response.content[0]?.text).toBe("Retained in bank as doc-1. Operation IDs: op-1.");
  });

  it("summarizes queued retain results with dead-letter hints", () => {
    const response = retainToolResponse({
      bankId: "bank",
      documentId: "doc-1",
      remaining: 2,
      deadLettered: 1,
    } as never);

    expect(response.content[0]?.text).toBe(
      "Queued for bank; 2 jobs pending. 1 job moved to dead-letter queue; run /hindsight to inspect.",
    );
  });
});
