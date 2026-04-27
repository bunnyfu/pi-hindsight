import { createHash } from "node:crypto";
import type {
  HindsightCapabilities,
  HindsightLikeClient,
  ResolvedConfig,
  UpdateMode,
} from "./types.js";

export function perDeltaDocumentId(baseDocumentId: string, parts: unknown[]): string {
  const hash = createHash("sha256").update(JSON.stringify(parts)).digest("hex").slice(0, 16);
  return `${baseDocumentId}:delta:${hash}`;
}

export function appendFallbackTarget(args: {
  config: ResolvedConfig;
  documentId: string;
  fallbackParts: unknown[];
}): { documentId: string; updateMode: "replace" } | undefined {
  if (args.config.retain.appendFallback !== "per-turn-documents") return undefined;
  return {
    documentId: perDeltaDocumentId(args.documentId, args.fallbackParts),
    updateMode: "replace",
  };
}

export function resolveRetainDocumentTarget(args: {
  config: ResolvedConfig;
  capabilities?: HindsightCapabilities;
  documentId: string;
  updateMode: UpdateMode;
  fallbackParts: unknown[];
}): { documentId: string; updateMode: UpdateMode } {
  if (args.updateMode !== "append")
    return { documentId: args.documentId, updateMode: args.updateMode };
  if (!args.capabilities || args.capabilities.appendUpdateMode) {
    return { documentId: args.documentId, updateMode: args.updateMode };
  }
  const fallback = appendFallbackTarget(args);
  if (fallback) return fallback;
  throw new Error(
    "Hindsight append update mode is unsupported. Upgrade Hindsight or set retain.appendFallback to per-turn-documents.",
  );
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
  client: HindsightLikeClient,
  bankId: string,
): Promise<HindsightCapabilities> {
  const checkedAt = new Date().toISOString();
  const documentId = `pi-hindsight-capability:append:${bankId}`;
  try {
    await client.retain(bankId, "Pi Hindsight append capability probe. Safe to ignore.", {
      async: true,
      documentId,
      updateMode: "append",
      context: "Pi Hindsight append capability detection",
      tags: ["source:pi", "test:capability", "feature:append-probe"],
      metadata: {
        source: "pi-hindsight",
        capability: "append-update-mode",
      },
    });
    return { appendUpdateMode: true, checkedAt, probeDocumentId: documentId };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const appendUnsupported = isAppendUnsupportedError(error);
    return {
      appendUpdateMode: !appendUnsupported,
      checkedAt,
      error: appendUnsupported
        ? message
        : `Probe inconclusive; assuming append support: ${message}`,
      probeDocumentId: documentId,
    };
  }
}
