import { Type } from "typebox";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import type { HindsightLikeClient, ResolvedConfig } from "./types.js";
import { redactSecrets } from "./sanitize.js";
import { recallScopeTags } from "./banking.js";
import { stableSessionId } from "./session.js";
import { explicitRetainTags } from "./memory-identity.js";
import { buildProjectConfigPatch, writeProjectConfig } from "./config-writer.js";
import { importPiSession } from "./import-sessions.js";

export function registerTools(
  pi: ExtensionAPI,
  deps: {
    getClient(): HindsightLikeClient;
    getConfig(): ResolvedConfig;
    getProjectBankId(): string;
    reloadConfig?(cwd: string): void;
  },
) {
  pi.registerTool({
    name: "hindsight_recall",
    label: "Hindsight Recall",
    description: "Recall raw memories from Hindsight for this project.",
    parameters: Type.Object({
      query: Type.String({ description: "Natural language memory query" }),
      bank: Type.Optional(
        Type.String({ description: "Optional bank id. Defaults to project bank." }),
      ),
    }),
    async execute(_id, params, _signal, _onUpdate, ctx) {
      const config = deps.getConfig();
      const bankId = params.bank || deps.getProjectBankId();
      const tags =
        config.banks.global.enabled && bankId === config.banks.global.bankId
          ? ["source:pi"]
          : recallScopeTags(ctx.cwd);
      const result = await deps.getClient().recall(bankId, params.query, {
        budget: config.recall.budget,
        maxTokens: config.recall.maxTokens,
        tags,
        tagsMatch: "any_strict",
      });
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
    }),
    async execute(_id, params, _signal, _onUpdate, ctx) {
      const config = deps.getConfig();
      const bankId = params.bank || deps.getProjectBankId();
      const sessionFile = ctx.sessionManager.getSessionFile?.();
      const tags = explicitRetainTags(ctx.cwd, sessionFile, params.tags);
      await deps
        .getClient()
        .retain(
          bankId,
          config.retain.redactSecrets ? redactSecrets(params.content) : params.content,
          {
            context: params.context,
            async: config.retain.async,
            tags,
            updateMode: "append",
            documentId: `pi-explicit:${stableSessionId(ctx.sessionManager.getSessionFile?.(), ctx.cwd)}`,
          },
        );
      return {
        content: [{ type: "text", text: `Retained in ${bankId}.` }],
        details: { bankId, tags },
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
      const projectBankId = params.projectBankId || deps.getProjectBankId();
      const patch = buildProjectConfigPatch({
        projectBankId,
        ...(params.baseUrl ? { baseUrl: params.baseUrl } : {}),
        ...(params.globalBankId ? { globalBankId: params.globalBankId } : {}),
        ...(params.enableGlobalBank !== undefined
          ? { enableGlobalBank: params.enableGlobalBank }
          : {}),
        ...(params.enabled !== undefined ? { enabled: params.enabled } : {}),
        ...(params.queuePath ? { queuePath: params.queuePath } : {}),
      });
      const result = await writeProjectConfig(ctx.cwd, patch);
      deps.reloadConfig?.(ctx.cwd);
      return {
        content: [
          {
            type: "text",
            text: `Wrote ${result.path}\nProject bank: ${projectBankId}\nRun /hindsight:debug to verify.`,
          },
        ],
        details: { path: result.path, projectBankId, config: result.config },
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
    }),
    async execute(_id, params, _signal, _onUpdate, ctx) {
      const sessionFile = params.sessionFile || ctx.sessionManager.getSessionFile?.();
      if (!sessionFile) throw new Error("No session file available. Pass sessionFile explicitly.");
      const bankId = params.bank || deps.getProjectBankId();
      const result = await importPiSession({
        sessionFile,
        bankId,
        client: deps.getClient(),
        config: deps.getConfig(),
      });
      return {
        content: [
          {
            type: "text",
            text: `Imported ${result.messageCount} messages into ${bankId} as ${result.documentId}. Manifest: ${result.manifestPath}.`,
          },
        ],
        details: { bankId, ...result },
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
    }),
    async execute(_id, params, _signal, _onUpdate, ctx) {
      const config = deps.getConfig();
      const bankId = params.bank || deps.getProjectBankId();
      const tags =
        config.banks.global.enabled && bankId === config.banks.global.bankId
          ? ["source:pi"]
          : recallScopeTags(ctx.cwd);
      const result = await deps.getClient().reflect(bankId, params.query, {
        ...(params.context ? { context: params.context } : {}),
        budget: config.recall.budget,
        tags,
        tagsMatch: "any_strict",
      });
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
