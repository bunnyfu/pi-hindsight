import type { AgentEndEvent } from "@mariozechner/pi-coding-agent";
import type { AgentMessage } from "@mariozechner/pi-agent-core";
import { projectMessages } from "./messages.js";
import { enqueueRetainFromAgentEnd } from "./retain.js";
import {
  addRetainFingerprints,
  messageFingerprint,
  readRetainFingerprints,
} from "./retain-cursor.js";
import { stableSessionId } from "./session.js";
import {
  clearNextSessionRetainMode,
  getEffectiveSessionMemoryMode,
  readSessionMemoryMeta,
} from "./session-memory-meta.js";
import { redactError } from "./sanitize.js";
import type { HindsightCapabilities, HindsightLikeClient, ResolvedConfig } from "./types.js";
import type { RuntimeSnapshot } from "./memory-lifecycle-runtime.js";
import type { HindsightActivity } from "./status.js";

export type RetainStatusActivity = Extract<
  HindsightActivity,
  "retaining" | "retained" | "retain-queued" | "retain-failed"
>;

export interface RetainTurnPolicy {
  retain(event: AgentEndEvent, runtime: RuntimeSnapshot): Promise<RetainTurnResult>;
}

export interface RetainTurnResult {
  queued: boolean;
  sent: number;
  remaining: number;
}

export interface RetainTurnPolicyDeps {
  getConfig(): ResolvedConfig;
  getClient(): HindsightLikeClient;
  getProjectBankId(): string;
  getCapabilities(): HindsightCapabilities | undefined;
  setMemoryStatus(
    runtime: RuntimeSnapshot,
    activity: RetainStatusActivity,
    queueRemaining?: number,
  ): void;
  notify(runtime: RuntimeSnapshot, message: string, level: "info" | "warning"): void;
}

export function createRetainTurnPolicy(deps: RetainTurnPolicyDeps): RetainTurnPolicy {
  const retainedBySession = new Map<string, Set<string>>();

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
    projectMessages(messages as AgentMessage[], deps.getConfig()).length;

  return {
    async retain(event: AgentEndEvent, runtime: RuntimeSnapshot): Promise<RetainTurnResult> {
      const config = deps.getConfig();
      if (!config.enabled || !config.retain.enabled || !config.banks.project.enabled)
        return { queued: false, sent: 0, remaining: 0 };

      const sessionMeta = await readSessionMemoryMeta(runtime.cwd, runtime.sessionFile);
      const nextRetainMode = sessionMeta.nextRetainMode;
      const sessionMemory = getEffectiveSessionMemoryMode(sessionMeta);
      if (!sessionMemory.retain || nextRetainMode === "off") {
        try {
          await markRetainedMessages(runtime, event.messages);
        } catch (error) {
          deps.setMemoryStatus(runtime, "retain-failed");
          deps.notify(
            runtime,
            `Hindsight retain cursor update failed: ${(error as Error).message}`,
            "warning",
          );
          return { queued: false, sent: 0, remaining: 0 };
        }
        if (nextRetainMode === "off") {
          await clearNextSessionRetainMode(runtime.cwd, runtime.sessionFile);
          deps.notify(
            runtime,
            "Hindsight skipped retain for this run due to next-opt-out.",
            "info",
          );
        }
        return { queued: false, sent: 0, remaining: 0 };
      }

      const messages = await newRetainMessages(runtime, event.messages);
      const messageCount = retainableMessageCount(messages);
      if (!messageCount) return { queued: false, sent: 0, remaining: 0 };

      try {
        deps.setMemoryStatus(runtime, "retaining");
        const capabilities = deps.getCapabilities();
        const result = await enqueueRetainFromAgentEnd({
          event: { ...event, messages },
          cwd: runtime.cwd,
          ...(runtime.sessionFile ? { sessionFile: runtime.sessionFile } : {}),
          config,
          client: deps.getClient(),
          bankId: deps.getProjectBankId(),
          ...(capabilities ? { capabilities } : {}),
          extraTags: sessionMemory.tags,
        });
        if (result.queued) await markRetainedMessages(runtime, messages);
        deps.setMemoryStatus(
          runtime,
          result.remaining > 0 ? "retain-queued" : "retained",
          result.remaining,
        );
        if (config.notifications.retain) {
          deps.notify(
            runtime,
            `Hindsight retained ${messageCount} new message${messageCount === 1 ? "" : "s"} to ${deps.getProjectBankId()}${result.remaining > 0 ? `; ${result.remaining} queued` : ""}`,
            "info",
          );
        }
        return result;
      } catch (error) {
        deps.setMemoryStatus(runtime, "retain-failed");
        deps.notify(runtime, `Hindsight retain queue failed: ${redactError(error)}`, "warning");
        return { queued: false, sent: 0, remaining: 0 };
      }
    },
  };
}
