import type { MemoryOperations } from "../operations/memory-operation-service.js";

type ToolTextResponse<Details> = {
  content: Array<{ type: "text"; text: string }>;
  details: Details;
};

export type RetainToolResult = Awaited<ReturnType<MemoryOperations["retainExplicit"]>>;

export function retainToolResponse(result: RetainToolResult): ToolTextResponse<RetainToolResult> {
  const deadLetterStatus = result.deadLettered
    ? ` ${result.deadLettered} job${result.deadLettered === 1 ? "" : "s"} moved to dead-letter queue; run /hindsight to inspect.`
    : "";
  const text =
    result.remaining > 0
      ? `Queued for ${result.bankId}; ${result.remaining} job${result.remaining === 1 ? "" : "s"} pending.${deadLetterStatus}`
      : `Retained in ${result.bankId} as ${result.documentId}.${deadLetterStatus}`;
  const operationText = result.operationIds?.length
    ? ` Operation IDs: ${result.operationIds.join(", ")}.`
    : "";
  return { content: [{ type: "text", text: `${text}${operationText}` }], details: result };
}
