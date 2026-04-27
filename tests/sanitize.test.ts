import { describe, expect, it } from "vitest";
import { redactSecrets } from "../extensions/sanitize.js";

describe("redactSecrets", () => {
  it("redacts common credentials", () => {
    const text =
      "Authorization: Bearer abcdefghijklmnopqrstuvwxyz API_KEY=supersecret sk-abcdefghijklmnopqrstuvwxyz";
    const redacted = redactSecrets(text);
    expect(redacted).not.toContain("abcdefghijklmnopqrstuvwxyz");
    expect(redacted).toContain("[REDACTED");
  });
});
