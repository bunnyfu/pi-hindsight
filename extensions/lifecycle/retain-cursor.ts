import { createHash } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { AgentMessage } from "@earendil-works/pi-agent-core";

export const RETAIN_CURSOR_VERSION = 2 as const;

export interface SessionRetainCursor {
  index: number;
  chainHash: string;
  idChainHash: string;
  messageIds: string[];
  fingerprints: string[];
}

export interface SessionRetainState {
  cursor?: SessionRetainCursor;
  legacyFingerprints?: Set<string>;
}

interface RetainCursorStoreV2 {
  version: typeof RETAIN_CURSOR_VERSION;
  sessions: Record<string, SessionRetainCursor | LegacySessionEntry>;
}

interface LegacySessionEntry {
  legacyFingerprints: string[];
}

type RetainCursorStoreV1 = {
  sessions: Record<string, string[]>;
};

export function retainCursorPath(cwd: string): string {
  return join(cwd, ".pi", "hindsight", "retain-cursors.json");
}

export function messageFingerprint(message: AgentMessage): string {
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

function messageId(message: AgentMessage): string {
  const id = (message as unknown as Record<string, unknown>).id;
  if (typeof id === "string") return id;
  if (typeof id === "number") return String(id);
  return "";
}

export function chainHash(fingerprints: readonly string[], throughIndex: number): string {
  let hash = "";
  for (let i = 0; i <= throughIndex; i++) {
    const fingerprint = fingerprints[i];
    if (fingerprint === undefined) break;
    hash = createHash("sha256")
      .update(hash + fingerprint)
      .digest("hex");
  }
  return hash;
}

export function idChainHash(messages: readonly AgentMessage[], throughIndex: number): string {
  let hash = "";
  for (let i = 0; i <= throughIndex; i++) {
    const message = messages[i];
    if (!message) break;
    hash = createHash("sha256")
      .update(hash + messageId(message))
      .digest("hex");
  }
  return hash;
}

function buildCursor(messages: readonly AgentMessage[], throughIndex: number): SessionRetainCursor {
  const fingerprints = messages.slice(0, throughIndex + 1).map(messageFingerprint);
  return {
    index: throughIndex,
    chainHash: chainHash(fingerprints, throughIndex),
    idChainHash: idChainHash(messages, throughIndex),
    messageIds: messages.slice(0, throughIndex + 1).map(messageId),
    fingerprints,
  };
}

function isLegacySessionEntry(value: unknown): value is LegacySessionEntry {
  return (
    !!value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Array.isArray((value as LegacySessionEntry).legacyFingerprints)
  );
}

function isSessionRetainCursor(value: unknown): value is SessionRetainCursor {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const cursor = value as SessionRetainCursor;
  return (
    typeof cursor.index === "number" &&
    typeof cursor.chainHash === "string" &&
    typeof cursor.idChainHash === "string" &&
    Array.isArray(cursor.messageIds) &&
    Array.isArray(cursor.fingerprints)
  );
}

function normalizeLegacyFingerprints(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string");
}

function readLegacyStore(parsed: RetainCursorStoreV1): Record<string, LegacySessionEntry> {
  const sessions: Record<string, LegacySessionEntry> = {};
  for (const [key, value] of Object.entries(parsed.sessions ?? {})) {
    const fingerprints = normalizeLegacyFingerprints(value);
    if (fingerprints.length > 0) sessions[key] = { legacyFingerprints: fingerprints };
  }
  return sessions;
}

async function readRetainCursorStore(path: string): Promise<RetainCursorStoreV2> {
  try {
    const parsed = JSON.parse(await readFile(path, "utf8")) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return { version: RETAIN_CURSOR_VERSION, sessions: {} };
    }

    const version = (parsed as { version?: unknown }).version;
    const sessions = (parsed as { sessions?: unknown }).sessions;
    if (!sessions || typeof sessions !== "object" || Array.isArray(sessions)) {
      return { version: RETAIN_CURSOR_VERSION, sessions: {} };
    }

    if (version === RETAIN_CURSOR_VERSION) {
      const normalized: RetainCursorStoreV2["sessions"] = {};
      for (const [key, value] of Object.entries(sessions)) {
        if (isSessionRetainCursor(value)) normalized[key] = value;
        else if (isLegacySessionEntry(value)) normalized[key] = value;
      }
      return { version: RETAIN_CURSOR_VERSION, sessions: normalized };
    }

    return {
      version: RETAIN_CURSOR_VERSION,
      sessions: readLegacyStore(parsed as RetainCursorStoreV1),
    };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return { version: RETAIN_CURSOR_VERSION, sessions: {} };
    }
    throw error;
  }
}

async function writeRetainCursorStore(path: string, store: RetainCursorStoreV2): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const tmp = `${path}.tmp`;
  await writeFile(tmp, `${JSON.stringify(store, null, 2)}\n`, "utf8");
  await rename(tmp, path);
}

export async function readSessionRetainState(
  cwd: string,
  sessionId: string,
): Promise<SessionRetainState | undefined> {
  const store = await readRetainCursorStore(retainCursorPath(cwd));
  const entry = store.sessions[sessionId];
  if (!entry) return undefined;
  if (isLegacySessionEntry(entry)) {
    return { legacyFingerprints: new Set(entry.legacyFingerprints) };
  }
  return { cursor: entry };
}

function legacyRetainStart(messages: readonly AgentMessage[], legacy: ReadonlySet<string>): number {
  for (let i = 0; i < messages.length; i++) {
    const message = messages[i];
    if (!message || !legacy.has(messageFingerprint(message))) return i;
  }
  return messages.length;
}

function filterWithCursor(
  messages: readonly AgentMessage[],
  cursor: SessionRetainCursor,
): AgentMessage[] {
  const fingerprints = messages.map(messageFingerprint);
  if (messages.length === 0) return [];

  if (
    cursor.index < fingerprints.length &&
    chainHash(fingerprints, cursor.index) === cursor.chainHash
  ) {
    return messages.slice(cursor.index + 1);
  }

  const retained: AgentMessage[] = [];
  let branched = false;

  for (let i = 0; i < messages.length; i++) {
    const message = messages[i];
    if (!message) continue;

    if (i > cursor.index) {
      retained.push(message);
      continue;
    }

    const idMatches = messageId(message) === cursor.messageIds[i];
    const fingerprintMatches = fingerprints[i] === cursor.fingerprints[i];

    if (!idMatches) {
      branched = true;
      retained.push(message);
      continue;
    }

    if (branched) {
      retained.push(message);
      continue;
    }

    if (!fingerprintMatches) {
      retained.push(message);
    }
  }

  return retained;
}

export function filterNewRetainMessages(
  messages: readonly AgentMessage[],
  state: SessionRetainState | undefined,
): AgentMessage[] {
  if (!state) return [...messages];
  if (state.cursor) return filterWithCursor(messages, state.cursor);
  if (state.legacyFingerprints?.size) {
    return messages.slice(legacyRetainStart(messages, state.legacyFingerprints));
  }
  return [...messages];
}

export async function advanceRetainCursor(
  cwd: string,
  sessionId: string,
  allMessages: readonly AgentMessage[],
  retainedThroughIndex: number,
): Promise<void> {
  if (retainedThroughIndex < 0 || retainedThroughIndex >= allMessages.length) return;

  const path = retainCursorPath(cwd);
  const store = await readRetainCursorStore(path);
  store.sessions[sessionId] = buildCursor(allMessages, retainedThroughIndex);
  await writeRetainCursorStore(path, store);
}

export function retainedThroughIndex(
  allMessages: readonly AgentMessage[],
  retainedMessages: readonly AgentMessage[],
): number {
  if (retainedMessages.length === 0) return -1;
  const lastRetained = retainedMessages[retainedMessages.length - 1];
  if (!lastRetained) return -1;
  const lastFingerprint = messageFingerprint(lastRetained);
  for (let i = allMessages.length - 1; i >= 0; i--) {
    const message = allMessages[i];
    if (message && messageFingerprint(message) === lastFingerprint) return i;
  }
  return allMessages.length - 1;
}
