import { describe, expect, it, vi } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DEFAULT_CONFIG } from "../extensions/config/config.js";
import {
  buildGitLogRetainJob,
  collectGitLogForSeed,
  seedGitLog,
} from "../extensions/lifecycle/git-seed.js";
import type { HindsightLikeClient } from "../extensions/types.js";

describe("git seed", () => {
  it("collects newest-first commit subjects with stable document id", async () => {
    const result = await collectGitLogForSeed({
      cwd: "/repo",
      limit: 2,
      execGit: async (args) => {
        if (args[0] === "rev-parse") return "abcdef1234567890\n";
        if (args[0] === "log") {
          return "aaaaaaaaaaaa\tfirst commit\nbbbbbbbbbbbb\tsecond commit\n";
        }
        throw new Error(`unexpected git ${args.join(" ")}`);
      },
    });
    expect(result).not.toHaveProperty("error");
    if ("error" in result) return;
    expect(result.headSha).toBe("abcdef1234567890");
    expect(result.commitCount).toBe(2);
    expect(result.documentId).toBe("pi-gitlog:abcdef123456");
    expect(result.content).toContain("first commit");
    expect(result.content).toContain("second commit");
  });

  it("builds a gitlog strategy replace job", () => {
    const job = buildGitLogRetainJob({
      config: DEFAULT_CONFIG,
      cwd: "/repo",
      bankId: "bank",
      content: "# log",
      documentId: "pi-gitlog:abc",
      headSha: "abcdef1234567890",
    });
    expect(job.item.strategy).toBe("gitlog");
    expect(job.updateMode).toBe("replace");
    expect(job.item.tags).toEqual(expect.arrayContaining(["source:git", "harness:pi"]));
    expect(job.documentId).toBe("pi-gitlog:abc");
  });

  it("dry-runs seed without enqueue", async () => {
    const client: HindsightLikeClient = {
      retain: vi.fn(),
      recall: vi.fn(),
      reflect: vi.fn(),
    };
    const cwd = mkdtempSync(join(tmpdir(), "pi-hindsight-git-seed-"));
    const result = await seedGitLog({
      cwd,
      bankId: "bank",
      config: DEFAULT_CONFIG,
      client,
      dryRun: true,
      execGit: async (args) => {
        if (args[0] === "rev-parse") return "deadbeefcafebabe\n";
        return "deadbeefcafe\tseed me\n";
      },
    });
    expect(result.ok).toBe(true);
    expect(result.dryRun).toBe(true);
    expect(result.commitCount).toBe(1);
    expect(vi.mocked(client.retain)).not.toHaveBeenCalled();
  });
});
