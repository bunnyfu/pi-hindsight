import type { AgentMessage } from "@mariozechner/pi-agent-core";

function stringValue(value: unknown, fallback = ""): string {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean" || typeof value === "bigint") {
    return String(value);
  }
  return fallback;
}

function textFromContent(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return JSON.stringify(content ?? "");
  return content
    .map((part) => {
      if (part && typeof part === "object" && "type" in part) {
        const p = part as Record<string, unknown>;
        if (p.type === "text") return stringValue(p.text);
        if (p.type === "thinking") return "[thinking omitted]";
        if (p.type === "toolCall")
          return `[toolCall ${stringValue(p.name, "unknown")}] ${JSON.stringify(p.arguments ?? {})}`;
        if (p.type === "image") return "[image omitted]";
      }
      return JSON.stringify(part);
    })
    .filter(Boolean)
    .join("\n");
}

export function projectMessage(message: AgentMessage): Record<string, unknown> {
  const m = message as unknown as Record<string, unknown>;
  const role = stringValue(m.role, "unknown");
  const base: Record<string, unknown> = {
    role,
    timestamp: new Date(typeof m.timestamp === "number" ? m.timestamp : Date.now()).toISOString(),
    content: textFromContent(m.content),
  };
  if (role === "toolResult") {
    base.toolName = m.toolName;
    base.isError = m.isError;
  }
  if (role === "assistant") {
    base.model = m.model;
    base.stopReason = m.stopReason;
  }
  return base;
}

function isInjectedHindsightMemory(message: AgentMessage): boolean {
  return textFromContent((message as unknown as { content?: unknown }).content)
    .trim()
    .startsWith("<hindsight-memory>");
}

export function projectMessages(
  messages: AgentMessage[],
  includeToolResults: "meaningful-only" | "all" | "none",
): Record<string, unknown>[] {
  return messages
    .filter((message) => {
      if (isInjectedHindsightMemory(message)) return false;
      const role = (message as unknown as { role?: string }).role;
      if (role !== "toolResult") return true;
      if (includeToolResults === "none") return false;
      if (includeToolResults === "all") return true;
      return Boolean((message as unknown as { isError?: boolean }).isError);
    })
    .map(projectMessage);
}
