import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG } from "../extensions/config/config.js";
import {
  detectAppendCapability,
  isAppendUnsupportedError,
  resolveRetainDocumentTarget,
} from "../extensions/client/capabilities.js";

describe("append capabilities", () => {
  it("assumes append support with hindsight-client 0.8 without a live probe", async () => {
    const capabilities = await detectAppendCapability({} as never, "bank");

    expect(capabilities.appendUpdateMode).toBe(true);
    expect(capabilities.version).toBeTruthy();
    expect(capabilities.probeDocumentId).toBe("pi-hindsight-capability:append:bank");
  });

  it("detects append validation errors from servers without append support", () => {
    const error = new Error(
      `retain failed: [{"loc":["body","items",0,"update_mode"],"msg":"Input should be 'replace'","input":"append"}]`,
    );
    expect(isAppendUnsupportedError(error)).toBe(true);
  });

  it("keeps stable append document IDs when append is supported or unknown", () => {
    expect(
      resolveRetainDocumentTarget({
        config: DEFAULT_CONFIG,
        documentId: "doc",
        updateMode: "append",
      }),
    ).toEqual({ documentId: "doc", updateMode: "append" });

    expect(
      resolveRetainDocumentTarget({
        config: DEFAULT_CONFIG,
        capabilities: { appendUpdateMode: true, checkedAt: "now" },
        documentId: "doc",
        updateMode: "append",
      }),
    ).toEqual({ documentId: "doc", updateMode: "append" });
  });

  it("refuses append when unsupported", () => {
    expect(() =>
      resolveRetainDocumentTarget({
        config: DEFAULT_CONFIG,
        capabilities: { appendUpdateMode: false, checkedAt: "now" },
        documentId: "doc",
        updateMode: "append",
      }),
    ).toThrow(/append update mode is unsupported/);
  });
});
