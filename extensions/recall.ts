import type { AgentMessage } from "@mariozechner/pi-agent-core";
import type {
  HindsightLikeClient,
  RecallBlock,
  RecallResultItem,
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

export function composeRecallQuery(messages: AgentMessage[], recentTurns: number): string {
  const userMessages = messages
    .filter((message) => (message as unknown as { role?: string }).role === "user")
    .slice(-Math.max(1, recentTurns));
  return (
    userMessages
      .map((message) => {
        const content = projectMessage(message).content;
        return typeof content === "string" ? content : JSON.stringify(content ?? "");
      })
      .join("\n\n")
      .trim() || "current Pi coding task"
  );
}

export function renderRecallBlocks(blocks: RecallBlock[]): string {
  const nonEmpty = blocks.filter((block) => block.memoryCount > 0);
  if (nonEmpty.length === 0) return "";
  const lines = [
    "<hindsight-memory>",
    "Relevant prior memory. Use as context; do not quote unless useful.",
  ];
  for (const block of nonEmpty) {
    lines.push(`\nBank: ${block.bankId}`);
    block.results.slice(0, 12).forEach((item, index) => {
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
  const query = composeRecallQuery(args.messages, args.config.recall.recentTurnsForQuery);
  const blocks: RecallBlock[] = [];
  for (const scope of args.scopes) {
    const response = await args.client.recall(scope.bankId, query, {
      budget: args.config.recall.budget,
      maxTokens: args.config.recall.maxTokens,
      types: args.config.recall.types,
      ...(scope.tags ? { tags: scope.tags } : {}),
      ...(scope.tagsMatch ? { tagsMatch: scope.tagsMatch } : {}),
    });
    const results = textFromRecallResponse(response);
    blocks.push({
      bankId: scope.bankId,
      query,
      results,
      memoryCount: results.length,
      rendered: "",
    });
  }
  const rendered = renderRecallBlocks(blocks);
  return { rendered, blocks: blocks.map((block) => ({ ...block, rendered })) };
}
