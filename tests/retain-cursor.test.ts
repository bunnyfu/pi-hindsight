import { describe, expect, it } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  addRetainFingerprints,
  readRetainFingerprints,
  RETAIN_CURSOR_LIMITS,
} from "../extensions/retain-cursor.js";

describe("retain cursor", () => {
  it("prunes old fingerprints per session", async () => {
    const cwd = mkdtempSync(join(tmpdir(), "pi-hindsight-cursor-"));
    const original = RETAIN_CURSOR_LIMITS.maxFingerprintsPerSession;
    RETAIN_CURSOR_LIMITS.maxFingerprintsPerSession = 3;
    try {
      await addRetainFingerprints(cwd, "session", ["a", "b", "c"]);
      await addRetainFingerprints(cwd, "session", ["d", "e"]);
      expect([...(await readRetainFingerprints(cwd, "session"))]).toEqual(["c", "d", "e"]);
    } finally {
      RETAIN_CURSOR_LIMITS.maxFingerprintsPerSession = original;
    }
  });
});
