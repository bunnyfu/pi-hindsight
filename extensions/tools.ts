import { Type } from "typebox";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import type { MemoryOperationsDeps } from "./memory-operations.js";
import { createMemoryOperations } from "./memory-operations.js";

export function registerTools(pi: ExtensionAPI, deps: MemoryOperationsDeps) {
  const operations = createMemoryOperations(deps);

  function retainToolResponse(result: Awaited<ReturnType<typeof operations.retainExplicit>>) {
    const deadLetterStatus = result.deadLettered
      ? ` ${result.deadLettered} job${result.deadLettered === 1 ? "" : "s"} moved to dead-letter queue; run /hindsight to inspect.`
      : "";
    const status =
      result.remaining > 0
        ? `Queued for ${result.bankId}; ${result.remaining} job${result.remaining === 1 ? "" : "s"} pending.${deadLetterStatus}`
        : `Retained in ${result.bankId} as ${result.documentId}.${deadLetterStatus}`;
    return {
      content: [{ type: "text" as const, text: status }],
      details: result,
    };
  }

  pi.registerTool({
    name: "hindsight_recall",
    label: "Hindsight Recall",
    description: "Recall raw memories from Hindsight for this project.",
    parameters: Type.Object({
      query: Type.String({ description: "Natural language memory query" }),
      bank: Type.Optional(
        Type.String({ description: "Optional bank id. Defaults to project bank." }),
      ),
      queryTimestamp: Type.Optional(
        Type.String({ description: "Optional ISO timestamp for time-scoped recall." }),
      ),
    }),
    async execute(_id, params, _signal, _onUpdate, ctx) {
      const sessionFile = ctx.sessionManager.getSessionFile?.();
      const { bankId, result } = await operations.recall(
        ctx.cwd,
        params.query,
        params.bank,
        sessionFile,
        params.queryTimestamp,
      );
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        details: { bankId },
      };
    },
  });

  pi.registerTool({
    name: "hindsight_retain",
    label: "Hindsight Retain",
    description: "Retain explicit raw content in Hindsight. Use for durable facts or decisions.",
    parameters: Type.Object({
      content: Type.String({
        description: "Raw content to retain, not summary if source content is available.",
      }),
      context: Type.String({ description: "Source context for this memory." }),
      bank: Type.Optional(
        Type.String({ description: "Optional bank id. Defaults to project bank." }),
      ),
      tags: Type.Optional(Type.Array(Type.String())),
      entities: Type.Optional(
        Type.Array(
          Type.Object({
            text: Type.String(),
            type: Type.Optional(Type.String()),
          }),
        ),
      ),
    }),
    async execute(_id, params, _signal, _onUpdate, ctx) {
      const sessionFile = ctx.sessionManager.getSessionFile?.();
      const result = await operations.retainExplicit({
        cwd: ctx.cwd,
        content: params.content,
        context: params.context,
        ...(sessionFile ? { sessionFile } : {}),
        ...(params.bank ? { bank: params.bank } : {}),
        ...(params.tags ? { tags: params.tags } : {}),
        ...(params.entities ? { entities: params.entities } : {}),
      });
      return retainToolResponse(result);
    },
  });

  pi.registerTool({
    name: "hindsight_retain_global",
    label: "Hindsight Retain Global",
    description:
      "Retain explicit durable global memory in the configured global bank. Use for stable user identity, preferences, and cross-project workflows only.",
    parameters: Type.Object({
      content: Type.String({ description: "Raw memory content to retain." }),
      context: Type.String({ description: "Why this memory is durable global user context." }),
      tags: Type.Optional(Type.Array(Type.String())),
      entities: Type.Optional(
        Type.Array(
          Type.Object({
            text: Type.String(),
            type: Type.Optional(Type.String()),
          }),
        ),
      ),
    }),
    async execute(_id, params, _signal, _onUpdate, ctx) {
      const sessionFile = ctx.sessionManager.getSessionFile?.();
      const result = await operations.retainExplicit({
        cwd: ctx.cwd,
        content: params.content,
        context: params.context,
        bank: "global",
        ...(sessionFile ? { sessionFile } : {}),
        ...(params.tags ? { tags: params.tags } : {}),
        ...(params.entities ? { entities: params.entities } : {}),
      });
      return retainToolResponse(result);
    },
  });

  pi.registerTool({
    name: "hindsight_route_memory",
    label: "Hindsight Route Memory",
    description:
      "Dry-run memory routing against current project/global policy. Does not retain anything.",
    parameters: Type.Object({
      content: Type.String({ description: "Candidate memory content to classify." }),
      context: Type.Optional(Type.String({ description: "Optional context for routing." })),
    }),
    async execute(_id, params) {
      const result = operations.routeMemory({
        content: params.content,
        ...(params.context ? { context: params.context } : {}),
      });
      return {
        content: [
          {
            type: "text",
            text: `Route ${result.route} confidence=${result.confidence}; ${result.reason}`,
          },
        ],
        details: result,
      };
    },
  });

  pi.registerTool({
    name: "hindsight_delete_document",
    label: "Hindsight Delete Document",
    description:
      "Delete a specific Hindsight document and all memories extracted from it. Destructive; requires exact bank and document ID.",
    parameters: Type.Object({
      bank: Type.String({ description: "Bank ID containing the document." }),
      documentId: Type.String({ description: "Exact Hindsight document ID to delete." }),
      confirm: Type.Boolean({ description: "Must be true to confirm destructive deletion." }),
    }),
    async execute(_id, params) {
      if (!params.confirm) throw new Error("Set confirm=true to delete this Hindsight document.");
      const result = await operations.deleteDocument({
        bank: params.bank,
        documentId: params.documentId,
      });
      return {
        content: [
          {
            type: "text",
            text: `Deleted document ${result.documentId} from ${result.bankId}.`,
          },
        ],
        details: result,
      };
    },
  });

  pi.registerTool({
    name: "hindsight_configure",
    label: "Hindsight Configure",
    description:
      "Write project Hindsight config (.pi/hindsight.json), including project bank override.",
    parameters: Type.Object({
      projectBankId: Type.Optional(
        Type.String({
          description: "Project bank ID to use. Defaults to currently selected bank.",
        }),
      ),
      baseUrl: Type.Optional(
        Type.String({ description: "Hindsight base URL, e.g. http://localhost:8888" }),
      ),
      globalBankId: Type.Optional(Type.String({ description: "Optional global bank ID." })),
      enableGlobalBank: Type.Optional(
        Type.Boolean({ description: "Enable or disable global bank." }),
      ),
      enabled: Type.Optional(
        Type.Boolean({ description: "Enable or disable Hindsight extension." }),
      ),
      queuePath: Type.Optional(
        Type.String({
          description: "Retain queue path. Defaults to .pi/hindsight/retain-queue.jsonl.",
        }),
      ),
    }),
    async execute(_id, params, _signal, _onUpdate, ctx) {
      const result = await operations.configure(ctx.cwd, params);
      return {
        content: [
          {
            type: "text",
            text: `Wrote ${result.path}\nProject bank: ${result.projectBankId}\nRun /hindsight to verify.`,
          },
        ],
        details: { path: result.path, projectBankId: result.projectBankId },
      };
    },
  });

  pi.registerTool({
    name: "hindsight_import",
    label: "Hindsight Import",
    description:
      "Import a historical Pi session JSONL file into Hindsight with deterministic document ID.",
    parameters: Type.Object({
      sessionFile: Type.Optional(
        Type.String({ description: "Pi session JSONL path. Defaults to current session file." }),
      ),
      bank: Type.Optional(
        Type.String({ description: "Optional bank id. Defaults to project bank." }),
      ),
      dryRun: Type.Optional(Type.Boolean({ description: "Preview import without writing." })),
      allLeaves: Type.Optional(
        Type.Boolean({ description: "Import or preview all branch leaves." }),
      ),
    }),
    async execute(_id, params, _signal, _onUpdate, ctx) {
      const sessionFile = params.sessionFile || ctx.sessionManager.getSessionFile?.();
      if (!sessionFile) throw new Error("No session file available. Pass sessionFile explicitly.");
      const result = await operations.importSession({
        sessionFile,
        cwd: ctx.cwd,
        ...(params.bank ? { bank: params.bank } : {}),
        ...(params.dryRun !== undefined ? { dryRun: params.dryRun } : {}),
        ...(params.allLeaves !== undefined
          ? { includeBranches: params.allLeaves ? "all-leaves" : "current-only" }
          : {}),
      });
      return {
        content: [
          {
            type: "text",
            text: result.dryRun
              ? `Import preview: ${result.messageCount} messages would write ${result.documents.length} document${result.documents.length === 1 ? "" : "s"} to ${result.bankId}. First document: ${result.documentId}. Manifest unchanged: ${result.manifestPath}.`
              : `Imported ${result.messageCount} messages into ${result.bankId} as ${result.documentId}. Manifest: ${result.manifestPath}.`,
          },
        ],
        details: result,
      };
    },
  });

  pi.registerTool({
    name: "hindsight_reflect",
    label: "Hindsight Reflect",
    description:
      "Ask Hindsight to synthesize an answer from memory. Use explicitly, not for default recall.",
    parameters: Type.Object({
      query: Type.String(),
      context: Type.Optional(Type.String()),
      bank: Type.Optional(Type.String()),
      responseSchema: Type.Optional(Type.Record(Type.String(), Type.Unknown())),
    }),
    async execute(_id, params, _signal, _onUpdate, ctx) {
      const { bankId, result } = await operations.reflect(
        ctx.cwd,
        params.query,
        params.context,
        params.bank,
        params.responseSchema,
      );
      return {
        content: [
          {
            type: "text",
            text: typeof result === "string" ? result : JSON.stringify(result, null, 2),
          },
        ],
        details: { bankId },
      };
    },
  });
}
