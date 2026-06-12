import { CLIENT_VERSION } from "@vectorize-io/hindsight-client";
import type {
  HindsightCapabilities,
  HindsightLikeClient,
  ResolvedConfig,
  UpdateMode,
} from "../types.js";

export function resolveRetainDocumentTarget(args: {
  config: ResolvedConfig;
  capabilities?: HindsightCapabilities;
  documentId: string;
  updateMode: UpdateMode;
}): { documentId: string; updateMode: UpdateMode } {
  if (args.updateMode !== "append")
    return { documentId: args.documentId, updateMode: args.updateMode };
  if (!args.capabilities || args.capabilities.appendUpdateMode) {
    return { documentId: args.documentId, updateMode: args.updateMode };
  }
  throw new Error("Hindsight append update mode is unsupported. Upgrade Hindsight.");
}

export function isAppendUnsupportedError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  const mentionsAppendMode = /append|update[_ ]?mode/i.test(message);
  const explicitUnsupported =
    /unsupported|invalid|unknown|unrecognized|not allowed|not permitted/i.test(message);
  const validationUnsupported =
    /update[_ ]?mode/i.test(message) &&
    /append/i.test(message) &&
    /input should be|expected|literal_error|permitted|allowed/i.test(message);
  return mentionsAppendMode && (explicitUnsupported || validationUnsupported);
}

export async function detectAppendCapability(
  _client: HindsightLikeClient,
  bankId: string,
): Promise<HindsightCapabilities> {
  // hindsight-client 0.8+ and matching Hindsight servers support append update mode.
  // Runtime retain failures still surface through isAppendUnsupportedError().
  return {
    version: CLIENT_VERSION,
    appendUpdateMode: true,
    checkedAt: new Date().toISOString(),
    probeDocumentId: `pi-hindsight-capability:append:${bankId}`,
  };
}
