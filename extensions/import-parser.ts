interface JsonlEntry {
  type?: string;
  id?: string;
  parentId?: string | null;
  timestamp?: string;
  cwd?: string;
  message?: unknown;
}

export interface ParsedMessage {
  id?: string;
  parentId: string | null;
  timestamp?: string;
  data: Record<string, unknown>;
}

export interface ParsedSession {
  cwd?: string;
  sessionId?: string;
  sessionTimestamp?: string;
  messages: ParsedMessage[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function parseImportSessionJsonl(text: string): ParsedSession {
  const messages: ParsedMessage[] = [];
  let cwd: string | undefined;
  let sessionId: string | undefined;
  let sessionTimestamp: string | undefined;
  for (const line of text.split("\n")) {
    if (!line.trim()) continue;
    const entry = JSON.parse(line) as JsonlEntry;
    if (entry.type === "session") {
      if (typeof entry.cwd === "string") cwd = entry.cwd;
      if (typeof entry.id === "string") sessionId = entry.id;
      if (typeof entry.timestamp === "string") sessionTimestamp = entry.timestamp;
    }
    if (entry.type !== "message" || !isRecord(entry.message)) continue;
    messages.push({
      ...(typeof entry.id === "string" ? { id: entry.id } : {}),
      parentId: entry.parentId ?? null,
      ...(typeof entry.timestamp === "string" ? { timestamp: entry.timestamp } : {}),
      data: {
        ...(typeof entry.id === "string" ? { id: entry.id } : {}),
        parentId: entry.parentId ?? null,
        ...(typeof entry.timestamp === "string" ? { timestamp: entry.timestamp } : {}),
        ...entry.message,
      },
    });
  }
  return {
    ...(cwd ? { cwd } : {}),
    ...(sessionId ? { sessionId } : {}),
    ...(sessionTimestamp ? { sessionTimestamp } : {}),
    messages,
  };
}

export function parsePiSessionJsonl(text: string): {
  cwd?: string;
  messages: Record<string, unknown>[];
} {
  const parsed = parseImportSessionJsonl(text);
  return {
    ...(parsed.cwd ? { cwd: parsed.cwd } : {}),
    messages: parsed.messages.map((message) => message.data),
  };
}
