import type { ResolvedConfig } from "../types.js";
import type { ParsedMessage, ParsedSession } from "./import-parser.js";

export interface ImportBranch {
  leafId: string;
  messages: ParsedMessage[];
}

function fallbackLeafId(messages: ParsedMessage[]): string {
  const last = messages.at(-1);
  if (last?.id) return last.id;
  return "root";
}

export function leafIds(messages: ParsedMessage[]): string[] {
  const ids = new Set(
    messages.map((message) => message.id).filter((id): id is string => typeof id === "string"),
  );
  const parents = new Set(
    messages
      .map((message) => message.parentId)
      .filter((id): id is string => typeof id === "string"),
  );
  const leaves = [...ids].filter((id) => !parents.has(id));
  return leaves.length ? leaves : [fallbackLeafId(messages)];
}

function messagesForLeaf(messages: ParsedMessage[], leafId: string): ParsedMessage[] {
  const byId = new Map(
    messages
      .map((message) => [message.id, message])
      .filter((entry): entry is [string, ParsedMessage] => typeof entry[0] === "string"),
  );
  const path: ParsedMessage[] = [];
  const seen = new Set<string>();
  let current: string | null | undefined = leafId;

  while (current) {
    if (seen.has(current)) break;
    seen.add(current);
    const message = byId.get(current);
    if (!message) break;
    path.push(message);
    current = message.parentId;
  }

  if (!path.length && messages.length === 1) return messages;
  return path.reverse();
}

export function selectImportBranches(
  parsed: ParsedSession,
  includeBranches: ResolvedConfig["import"]["includeBranches"],
): ImportBranch[] {
  const leaves = leafIds(parsed.messages);
  const selectedLeaves =
    includeBranches === "all-leaves" ? leaves : [fallbackLeafId(parsed.messages)];
  return selectedLeaves.map((leafId) => ({
    leafId,
    messages: messagesForLeaf(parsed.messages, leafId),
  }));
}
