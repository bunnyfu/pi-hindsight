import type { AgentEndEvent } from "@mariozechner/pi-coding-agent";
import type { AgentMessage } from "@mariozechner/pi-agent-core";
import { resolveConfig } from "./config.js";
import { deriveProjectBankId } from "./banking.js";
import { createHindsightClient } from "./client.js";
import { ensureGlobalBank, ensureProjectBank } from "./bank-operations.js";
import { recallForContext } from "./recall.js";
import { enqueueRetainFromAgentEnd } from "./retain.js";
import { detectAppendCapability } from "./capabilities.js";
import { flushRetainQueue, resolveQueuePath } from "./queue.js";
import { getSessionFile, stableSessionId } from "./session.js";
import { bankSelectionMessage } from "./diagnostics.js";
import { formatHindsightStatus, type HindsightActivity } from "./status.js";
import { projectMessages } from "./messages.js";
import { selectMemoryScopes } from "./memory-scope.js";
import {
  addRetainFingerprints,
  messageFingerprint,
  readRetainFingerprints,
} from "./retain-cursor.js";
import type { HindsightCapabilities, HindsightLikeClient, ResolvedConfig } from "./types.js";

export type RuntimeCtx = {
  cwd: string;
  ui: {
    setStatus(key: string, text: string | undefined): void;
    notify(message: string, level?: string): void;
  };
  sessionManager?: { getSessionFile?: () => string | undefined };
};

type RuntimeSnapshot = {
  cwd: string;
  ui: RuntimeCtx["ui"];
  sessionFile?: string;
};

type ContextEvent = { messages: AgentMessage[] };
type ContextPatch = { messages: AgentMessage[] };

export interface MemoryLifecycleDeps {
  getClient(): HindsightLikeClient;
  getConfig(): ResolvedConfig;
  getProjectBankId(): string;
  getCapabilities(): HindsightCapabilities | undefined;
  reloadConfig(cwd: string): void;
}

export interface MemoryLifecycle {
  deps: MemoryLifecycleDeps;
  initialize(ctx: RuntimeCtx): Promise<void>;
  recall(event: ContextEvent, ctx: RuntimeCtx): Promise<ContextPatch | undefined>;
  retain(
    event: AgentEndEvent,
    ctx: RuntimeCtx,
  ): Promise<{ queued: boolean; sent: number; remaining: number }>;
  shutdown(ctx: RuntimeCtx): Promise<void>;
}

function snapshotRuntime(ctx: RuntimeCtx): RuntimeSnapshot | undefined {
  try {
    const cwd = ctx.cwd;
    const ui = ctx.ui;
    const sessionFile = getSessionFile(ctx);
    return { cwd, ui, ...(sessionFile ? { sessionFile } : {}) };
  } catch {
    return undefined;
  }
}

export function createMemoryLifecycle(initialCwd: string = process.cwd()): MemoryLifecycle {
  let config: ResolvedConfig = resolveConfig(initialCwd);
  let client: HindsightLikeClient = createHindsightClient(config);
  let projectBankId = deriveProjectBankId(initialCwd, config);
  let capabilities: HindsightCapabilities | undefined;
  const retainedBySession = new Map<string, Set<string>>();

  const reloadConfig = (cwd: string) => {
    config = resolveConfig(cwd);
    client = createHindsightClient(config);
    projectBankId = deriveProjectBankId(cwd, config);
    capabilities = undefined;
  };

  const setMemoryStatus = (
    ctx: RuntimeSnapshot,
    activity: HindsightActivity,
    memoryCount?: number,
    queueRemaining?: number,
  ) => {
    try {
      ctx.ui.setStatus(
        "hindsight",
        formatHindsightStatus(config, {
          projectBankId,
          cwd: ctx.cwd,
          activity,
          ...(memoryCount !== undefined ? { memoryCount } : {}),
          ...(queueRemaining !== undefined ? { queueRemaining } : {}),
        }),
      );
    } catch {
      // Session ctx can go stale during replacement/reload; status is best effort.
    }
  };

  const notify = (ctx: RuntimeSnapshot, message: string, level: string) => {
    try {
      ctx.ui.notify(message, level);
    } catch {
      // Session ctx can go stale during replacement/reload; notifications are best effort.
    }
  };

  const newRetainMessages = async (
    runtime: RuntimeSnapshot,
    messages: AgentEndEvent["messages"],
  ): Promise<AgentEndEvent["messages"]> => {
    const sessionId = stableSessionId(runtime.sessionFile, runtime.cwd);
    const seen =
      retainedBySession.get(sessionId) ?? (await readRetainFingerprints(runtime.cwd, sessionId));
    retainedBySession.set(sessionId, seen);
    return messages.filter(
      (message) => !seen.has(messageFingerprint(message as AgentMessage)),
    ) as AgentEndEvent["messages"];
  };

  const markRetainedMessages = async (
    runtime: RuntimeSnapshot,
    messages: AgentEndEvent["messages"],
  ): Promise<void> => {
    const sessionId = stableSessionId(runtime.sessionFile, runtime.cwd);
    const seen = retainedBySession.get(sessionId) ?? new Set<string>();
    const fingerprints = messages.map((message) => messageFingerprint(message as AgentMessage));
    for (const fingerprint of fingerprints) seen.add(fingerprint);
    retainedBySession.set(sessionId, seen);
    await addRetainFingerprints(runtime.cwd, sessionId, fingerprints);
  };

  const retainableMessageCount = (messages: AgentEndEvent["messages"]): number =>
    projectMessages(messages as AgentMessage[], config.retain.includeToolResults).length;

  const deps: MemoryLifecycleDeps = {
    getClient: () => client,
    getConfig: () => config,
    getProjectBankId: () => projectBankId,
    getCapabilities: () => capabilities,
    reloadConfig,
  };

  return {
    deps,

    async initialize(ctx: RuntimeCtx): Promise<void> {
      const runtime = snapshotRuntime(ctx);
      if (!runtime) return;
      reloadConfig(runtime.cwd);
      if (!config.enabled) return;
      if (config.banks.project.enabled) {
        try {
          await ensureProjectBank(client, projectBankId, config.banks.project);
          if (config.banks.global.enabled && config.banks.global.bankId)
            await ensureGlobalBank(client, config.banks.global.bankId, config.banks.global);
          if (config.retain.enabled)
            capabilities = await detectAppendCapability(client, projectBankId);
        } catch (error) {
          setMemoryStatus(runtime, "recall-failed");
          notify(
            runtime,
            `Hindsight bank ensure/capability check failed: ${error instanceof Error ? error.message : String(error)}`,
            "warning",
          );
        }
      }
      setMemoryStatus(runtime, "idle");
      if (config.notifications.startup)
        notify(runtime, bankSelectionMessage(projectBankId, config), "info");
    },

    async recall(event: ContextEvent, ctx: RuntimeCtx): Promise<ContextPatch | undefined> {
      if (!config.enabled || !config.recall.enabled) return undefined;
      const runtime = snapshotRuntime(ctx);
      if (!runtime) return undefined;
      const scopes = selectMemoryScopes(runtime.cwd, config);
      if (scopes.length === 0) return undefined;
      try {
        setMemoryStatus(runtime, "recalling");
        const { rendered, blocks } = await recallForContext({
          client,
          config,
          scopes,
          messages: event.messages,
        });
        const memoryCount = blocks.reduce((count, block) => count + block.memoryCount, 0);
        setMemoryStatus(runtime, memoryCount > 0 ? "recalled" : "recall-empty", memoryCount);
        if (config.notifications.recall) {
          notify(
            runtime,
            memoryCount > 0
              ? `Hindsight recalled ${memoryCount} memory item${memoryCount === 1 ? "" : "s"} from ${blocks.map((block) => block.bankId).join(", ")}`
              : "Hindsight recalled no matching memory",
            "info",
          );
        }
        if (!rendered) return undefined;
        const recallMessage = {
          role: config.recall.injectionPosition === "append" ? "system" : "user",
          content: rendered,
          timestamp: Date.now(),
        } as AgentMessage;
        return {
          messages:
            config.recall.injectionPosition === "append"
              ? [...event.messages, recallMessage]
              : [recallMessage, ...event.messages],
        };
      } catch {
        setMemoryStatus(runtime, "recall-failed");
        return undefined;
      }
    },

    async retain(
      event: AgentEndEvent,
      ctx: RuntimeCtx,
    ): Promise<{ queued: boolean; sent: number; remaining: number }> {
      if (!config.enabled || !config.retain.enabled)
        return { queued: false, sent: 0, remaining: 0 };
      const runtime = snapshotRuntime(ctx);
      if (!runtime) return { queued: false, sent: 0, remaining: 0 };
      const messages = await newRetainMessages(runtime, event.messages);
      const messageCount = retainableMessageCount(messages);
      if (!messageCount) return { queued: false, sent: 0, remaining: 0 };
      try {
        setMemoryStatus(runtime, "retaining");
        const result = await enqueueRetainFromAgentEnd({
          event: { ...event, messages },
          cwd: runtime.cwd,
          ...(runtime.sessionFile ? { sessionFile: runtime.sessionFile } : {}),
          config,
          client,
          bankId: projectBankId,
          ...(capabilities ? { capabilities } : {}),
        });
        if (result.queued) await markRetainedMessages(runtime, messages);
        setMemoryStatus(
          runtime,
          result.remaining > 0 ? "retain-queued" : "retained",
          undefined,
          result.remaining,
        );
        if (config.notifications.retain) {
          notify(
            runtime,
            `Hindsight retained ${messageCount} new message${messageCount === 1 ? "" : "s"} to ${projectBankId}${result.remaining > 0 ? `; ${result.remaining} queued` : ""}`,
            "info",
          );
        }
        return result;
      } catch (error) {
        setMemoryStatus(runtime, "retain-failed");
        notify(
          runtime,
          `Hindsight retain queue failed: ${error instanceof Error ? error.message : String(error)}`,
          "warning",
        );
        return { queued: false, sent: 0, remaining: 0 };
      }
    },

    async shutdown(ctx: RuntimeCtx): Promise<void> {
      if (!config.enabled || !config.retain.enabled) return;
      const runtime = snapshotRuntime(ctx);
      if (!runtime) return;
      try {
        await flushRetainQueue(resolveQueuePath(runtime.cwd, config.retain.queuePath), client, {
          maxJobs: config.retain.shutdownFlushMaxJobs,
          maxElapsedMs: config.retain.shutdownFlushTimeoutMs,
          stopOnFirstFailure: true,
        });
      } catch {
        // Keep queue on disk for next run.
      }
    },
  };
}
