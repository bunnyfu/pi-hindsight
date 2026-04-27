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
  if (args.config.retain.appendFallback === "per-turn-documents") {
    return {
      documentId: perDeltaDocumentId(args.documentId, args.fallbackParts),
      updateMode: "replace",
    };
  }
  throw new Error(
    "Hindsight append update mode is unsupported. Upgrade Hindsight or set retain.appendFallback to per-turn-documents.",
  );
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
    const appendUnsupported =
      /append|update[_ ]?mode/i.test(message) &&
      /unsupported|invalid|unknown|unrecognized|not allowed|not permitted/i.test(message);
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
