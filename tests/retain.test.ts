import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG } from "../extensions/config.js";
import { buildRetainJob } from "../extensions/retain.js";
import type { AgentEndEvent } from "@mariozechner/pi-coding-agent";

describe("buildRetainJob", () => {
  it("stores structured JSON with append mode and context", () => {
    const messages = [
      { role: "user", content: "API_KEY=secret", timestamp: Date.now() },
    ] as unknown as AgentEndEvent["messages"];
    const job = buildRetainJob({
      config: DEFAULT_CONFIG,
      cwd: "/repo",
      sessionFile: "/tmp/s.jsonl",
      bankId: "bank",
      messages,
    });
    expect(job?.updateMode).toBe("append");
    expect(job?.documentId).toMatch(/^pi-session:/);
    expect(job?.item.context).toContain("Pi coding session");
    expect(job?.item.async).toBe(true);
    expect(job?.item.content).not.toContain("API_KEY=secret");
    expect(JSON.parse(job?.item.content ?? "[]")[0].role).toBe("user");
  });
});
