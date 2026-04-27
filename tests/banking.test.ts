import { describe, expect, it } from "vitest";
import { mkdtempSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DEFAULT_CONFIG } from "../extensions/config.js";
import {
  baseTags,
  deriveProjectBankId,
  findRepoRoot,
  recallScopeTags,
} from "../extensions/banking.js";
import { liveDocumentId } from "../extensions/session.js";

describe("banking/session identity", () => {
  it("derives stable project bank from repo root", () => {
    const root = mkdtempSync(join(tmpdir(), "pi-hindsight-repo-"));
    mkdirSync(join(root, ".git"));
    const child = join(root, "a", "b");
    mkdirSync(child, { recursive: true });
    expect(findRepoRoot(child)).toBe(root);
    expect(deriveProjectBankId(child, DEFAULT_CONFIG)).toBe(
      deriveProjectBankId(root, DEFAULT_CONFIG),
    );
  });

  it("uses stable live document ids", () => {
    expect(liveDocumentId("/tmp/session.jsonl", "/repo")).toBe(
      liveDocumentId("/tmp/session.jsonl", "/repo"),
    );
    expect(baseTags("/repo", "s1")).toContain("session:s1");
    expect(recallScopeTags("/repo")).toEqual([expect.stringMatching(/^repo:/)]);
  });
});
