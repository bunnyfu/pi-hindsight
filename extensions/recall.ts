import type { AgentMessage } from "@mariozechner/pi-agent-core";
import type {
  HindsightLikeClient,
  RecallBlock,
  RecallResultItem,
  RecallRole,
  ResolvedConfig,
  TagsMatch,
} from "./types.js";
import { projectMessage } from "./messages.js";

export interface RecallScope {
  bankId: string;
  tags?: string[];
  tagsMatch?: TagsMatch;
}

function textFromRecallResponse(response: unknown): RecallResultItem[] {
  const record = response as Record<string, unknown>;
  const raw = Array.isArray(record.results)
    ? record.results
    : Array.isArray(record.memories)
      ? record.memories
      : Array.isArray(response)
        ? response
        : [];
  return raw.map((item) => item as RecallResultItem);
}

function itemText(item: RecallResultItem): string {
  return item.text ?? item.content ?? JSON.stringify(item);
}

export interface RecallQueryPolicy {
  roles: RecallRole[];
  contextTurns: number;
  maxQueryChars: number;
}

function messageContent(message: AgentMessage): string {
  const content = projectMessage(message).content;
  return typeof content === "string" ? content : JSON.stringify(content ?? "");
}

function isInjectedHindsightMemory(message: AgentMessage): boolean {
  return messageContent(message).trim().startsWith("<hindsight-memory>");
}

export function truncateRecallQuery(query: string, maxChars: number): string {
  if (query.length <= maxChars) return query;
  return query.slice(query.length - maxChars).trimStart();
}

export function composeRecallQuery(
  messages: AgentMessage[],
  policyOrRecentTurns: RecallQueryPolicy | number,
): string {
  const policy =
    typeof policyOrRecentTurns === "number"
      ? { roles: ["user"] as RecallRole[], contextTurns: policyOrRecentTurns, maxQueryChars: 800 }
      : policyOrRecentTurns;
  const allowedRoles = new Set<string>(policy.roles);
  const selected = messages
    .filter((message) => allowedRoles.has((message as unknown as { role?: string }).role ?? ""))
    .filter((message) => !isInjectedHindsightMemory(message))
    .slice(-Math.max(1, policy.contextTurns));
  const query = selected
    .map((message) => messageContent(message))
    .join("\n\n")
    .trim();
  return query ? truncateRecallQuery(query, policy.maxQueryChars) : "current Pi coding task";
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timeout: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_resolve, reject) => {
        timeout = setTimeout(
          () => reject(new Error(`hindsight recall timed out after ${timeoutMs}ms`)),
          timeoutMs,
        );
      }),
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

export function renderRecallBlocks(blocks: RecallBlock[], topK = 12): string {
  const nonEmpty = blocks.filter((block) => block.memoryCount > 0);
  if (nonEmpty.length === 0) return "";
  const lines = [
    "<hindsight-memory>",
    "Relevant prior memory. Use as context; do not quote unless useful.",
  ];
  for (const block of nonEmpty) {
    lines.push(`\nBank: ${block.bankId}`);
    block.results.slice(0, topK).forEach((item, index) => {
      const tags = item.tags?.length ? ` [${item.tags.join(", ")}]` : "";
      lines.push(`${index + 1}. ${itemText(item)}${tags}`);
    });
  }
  lines.push("</hindsight-memory>");
  return lines.join("\n");
}

export async function recallForContext(args: {
  client: HindsightLikeClient;
  config: ResolvedConfig;
  scopes: RecallScope[];
  messages: AgentMessage[];
}): Promise<{ rendered: string; blocks: RecallBlock[] }> {
  const query = composeRecallQuery(args.messages, {
    roles: args.config.recall.roles,
    contextTurns: args.config.recall.contextTurns,
    maxQueryChars: args.config.recall.maxQueryChars,
  });
  const blocks: RecallBlock[] = [];
  for (const scope of args.scopes) {
    const response = await withTimeout(
      args.client.recall(scope.bankId, query, {
        budget: args.config.recall.budget,
        maxTokens: args.config.recall.maxTokens,
        types: args.config.recall.types,
        ...(scope.tags ? { tags: scope.tags } : {}),
        ...(scope.tagsMatch ? { tagsMatch: scope.tagsMatch } : {}),
      }),
      args.config.recall.timeoutMs,
    );
    const results = textFromRecallResponse(response);
    blocks.push({
      bankId: scope.bankId,
      query,
      results,
      memoryCount: results.length,
      rendered: "",
    });
  }
  const rendered = renderRecallBlocks(blocks, args.config.recall.topK);
  return { rendered, blocks: blocks.map((block) => ({ ...block, rendered })) };
}
