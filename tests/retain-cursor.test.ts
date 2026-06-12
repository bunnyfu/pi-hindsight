import { describe, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AgentMessage } from "@earendil-works/pi-agent-core";
import {
  advanceRetainCursor,
  filterNewRetainMessages,
  messageFingerprint,
  readSessionRetainState,
  retainCursorPath,
  RETAIN_CURSOR_VERSION,
} from "../extensions/lifecycle/retain-cursor.js";

function msg(
  id: string,
  role: "user" | "assistant",
  content: string,
  timestamp: number,
): AgentMessage {
  return { id, role, content, timestamp } as AgentMessage;
}

function transcript(count: number): AgentMessage[] {
  const messages: AgentMessage[] = [];
  for (let i = 0; i < count; i++) {
    const role = i % 2 === 0 ? "user" : "assistant";
    messages.push(msg(`m${i}`, role, `message-${i}`, i + 1));
  }
  return messages;
}

describe("retain cursor", () => {
  it("never re-retains messages beyond a monotonic index for long sessions", async () => {
    const cwd = mkdtempSync(join(tmpdir(), "pi-hindsight-cursor-"));
    const sessionId = "long-session";
    const messages = transcript(2_500);

    await advanceRetainCursor(cwd, sessionId, messages, messages.length - 1);

    const state = await readSessionRetainState(cwd, sessionId);
    expect(state?.cursor?.index).toBe(2_499);
    expect(filterNewRetainMessages(messages, state)).toEqual([]);
  });

  it("survives process restarts without duplicate retain bursts", async () => {
    const cwd = mkdtempSync(join(tmpdir(), "pi-hindsight-cursor-"));
    const sessionId = "restart-session";
    const firstTurn = transcript(4);
    const secondTurn = transcript(6);

    await advanceRetainCursor(cwd, sessionId, firstTurn, firstTurn.length - 1);

    const reloaded = await readSessionRetainState(cwd, sessionId);
    expect(filterNewRetainMessages(firstTurn, reloaded)).toEqual([]);
    expect(filterNewRetainMessages(secondTurn, reloaded)).toEqual(secondTurn.slice(4));
  });

  it("migrates legacy fingerprint stores without duplicate retain bursts", async () => {
    const cwd = mkdtempSync(join(tmpdir(), "pi-hindsight-cursor-"));
    const sessionId = "legacy-session";
    const messages = transcript(6);
    const legacyFingerprints = messages.slice(0, 4).map(messageFingerprint);

    mkdirSync(join(cwd, ".pi", "hindsight"), { recursive: true });
    writeFileSync(
      retainCursorPath(cwd),
      `${JSON.stringify({ sessions: { [sessionId]: legacyFingerprints } }, null, 2)}\n`,
      "utf8",
    );

    const migrated = await readSessionRetainState(cwd, sessionId);
    expect(filterNewRetainMessages(messages, migrated)).toEqual(messages.slice(4));

    await advanceRetainCursor(cwd, sessionId, messages, messages.length - 1);
    const stored = JSON.parse(readFileSync(retainCursorPath(cwd), "utf8")) as {
      version: number;
      sessions: Record<string, unknown>;
    };
    expect(stored.version).toBe(RETAIN_CURSOR_VERSION);
    expect(stored.sessions[sessionId]).toMatchObject({ index: 5 });
    expect(stored.sessions[sessionId]).not.toHaveProperty("legacyFingerprints");
  });

  it("retains edited messages while keeping earlier dedupe", async () => {
    const cwd = mkdtempSync(join(tmpdir(), "pi-hindsight-cursor-"));
    const sessionId = "edit-session";
    const original = transcript(4);
    const edited = [
      ...original.slice(0, 2),
      msg("m2", "assistant", "message-2-edited", 3),
      ...original.slice(3),
    ];

    await advanceRetainCursor(cwd, sessionId, original, original.length - 1);
    const state = await readSessionRetainState(cwd, sessionId);

    expect(filterNewRetainMessages(edited, state)).toEqual([edited[2]]);
  });

  it("retains branched suffixes without replaying the shared prefix", async () => {
    const cwd = mkdtempSync(join(tmpdir(), "pi-hindsight-cursor-"));
    const sessionId = "branch-session";
    const original = transcript(5);
    const branched = [
      ...original.slice(0, 3),
      msg("m3b", "assistant", "branched-response", 4),
      msg("m4", "user", "message-4", 5),
    ];

    await advanceRetainCursor(cwd, sessionId, original, original.length - 1);
    const state = await readSessionRetainState(cwd, sessionId);

    expect(filterNewRetainMessages(branched, state)).toEqual(branched.slice(3));
  });
});
