import { createHash } from "node:crypto";
import type { AgentEndEvent } from "@mariozechner/pi-coding-agent";
import type { AgentMessage } from "@mariozechner/pi-agent-core";
import { resolveConfig } from "./config.js";
import { deriveProjectBankId } from "./banking.js";
import { createHindsightClient, ensureProjectBank } from "./client.js";
import { recallForContext } from "./recall.js";
import { enqueueRetainFromAgentEnd } from "./retain.js";
import { flushRetainQueue, resolveQueuePath } from "./queue.js";
import { getSessionFile, stableSessionId } from "./session.js";
import { bankSelectionMessage } from "./diagnostics.js";
import { formatHindsightStatus, type HindsightActivity } from "./status.js";
import { projectMessages } from "./messages.js";
import { selectMemoryScopes } from "./memory-scope.js";
import type { HindsightLikeClient, ResolvedConfig } from "./types.js";

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

function messageFingerprint(message: AgentMessage): string {
  const m = message as unknown as Record<string, unknown>;
  const stable = {
    id: m.id,
    role: m.role,
    timestamp: m.timestamp,
    content: m.content,
    toolName: m.toolName,
    isError: m.isError,
    model: m.model,
    stopReason: m.stopReason,
  };
  return createHash("sha256").update(JSON.stringify(stable)).digest("hex");
}

export function createMemoryLifecycle(initialCwd: string = process.cwd()): MemoryLifecycle {
  let config: ResolvedConfig = resolveConfig(initialCwd);
  let client: HindsightLikeClient = createHindsightClient(config);
  let projectBankId = deriveProjectBankId(initialCwd, config);
  const retainedBySession = new Map<string, Set<string>>();

  const reloadConfig = (cwd: string) => {
    config = resolveConfig(cwd);
    client = createHindsightClient(config);
    projectBankId = deriveProjectBankId(cwd, config);
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

  const newRetainMessages = (
    runtime: RuntimeSnapshot,
    messages: AgentEndEvent["messages"],
  ): AgentEndEvent["messages"] => {
    const sessionId = stableSessionId(runtime.sessionFile, runtime.cwd);
    const seen = retainedBySession.get(sessionId) ?? new Set<string>();
    return messages.filter(
      (message) => !seen.has(messageFingerprint(message as AgentMessage)),
    ) as AgentEndEvent["messages"];
  };

  const markRetainedMessages = (
    runtime: RuntimeSnapshot,
    messages: AgentEndEvent["messages"],
  ): void => {
    const sessionId = stableSessionId(runtime.sessionFile, runtime.cwd);
    const seen = retainedBySession.get(sessionId) ?? new Set<string>();
    for (const message of messages) seen.add(messageFingerprint(message as AgentMessage));
    retainedBySession.set(sessionId, seen);
  };

  const hasRetainableMessages = (messages: AgentEndEvent["messages"]): boolean =>
    projectMessages(messages as AgentMessage[], config.retain.includeToolResults).length > 0;

  const deps: MemoryLifecycleDeps = {
    getClient: () => client,
    getConfig: () => config,
    getProjectBankId: () => projectBankId,
    reloadConfig,
  };

  return {
    deps,

    async initialize(ctx: RuntimeCtx): Promise<void> {
      const runtime = snapshotRuntime(ctx);
      if (!runtime) return;
      reloadConfig(runtime.cwd);
      if (!config.enabled) return;
      if (config.banks.project.enabled)
        void ensureProjectBank(client, projectBankId).catch((error) => {
          notify(
            runtime,
            `Hindsight bank ensure failed: ${error instanceof Error ? error.message : String(error)}`,
            "warning",
          );
        });
      setMemoryStatus(runtime, "idle");
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
        if (!rendered) return undefined;
        return {
          messages: [
            { role: "user", content: rendered, timestamp: Date.now() } as AgentMessage,
            ...event.messages,
          ],
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
      const messages = newRetainMessages(runtime, event.messages);
      if (!hasRetainableMessages(messages)) return { queued: false, sent: 0, remaining: 0 };
      try {
        setMemoryStatus(runtime, "retaining");
        const result = await enqueueRetainFromAgentEnd({
          event: { ...event, messages },
          cwd: runtime.cwd,
          ...(runtime.sessionFile ? { sessionFile: runtime.sessionFile } : {}),
          config,
          client,
          bankId: projectBankId,
        });
        if (result.queued) markRetainedMessages(runtime, messages);
        setMemoryStatus(
          runtime,
          result.remaining > 0 ? "retain-queued" : "retained",
          undefined,
          result.remaining,
        );
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
          maxJobs: 1,
          stopOnFirstFailure: true,
        });
      } catch {
        // Keep queue on disk for next run.
      }
    },
  };
}
