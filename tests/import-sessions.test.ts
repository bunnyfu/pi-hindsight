import { describe, expect, it } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DEFAULT_CONFIG } from "../extensions/config.js";
import {
  importPiSession,
  parseImportSessionJsonl,
  parsePiSessionJsonl,
  selectImportBranches,
} from "../extensions/import-sessions.js";
import { readImportManifest } from "../extensions/import-manifest.js";

describe("Pi session import", () => {
  it("parses message entries from Pi JSONL", () => {
    const parsed = parsePiSessionJsonl(
      [
        JSON.stringify({ type: "session", id: "session-1", cwd: "/repo" }),
        JSON.stringify({
          type: "message",
          id: "1",
          parentId: null,
          timestamp: "t",
          message: { role: "user", content: "hi" },
        }),
        JSON.stringify({ type: "custom", data: {} }),
      ].join("\n"),
    );
    expect(parsed.cwd).toBe("/repo");
    expect(parsed.messages).toHaveLength(1);
    expect(parsed.messages[0]).toMatchObject({ id: "1", role: "user", content: "hi" });
  });

  it("retains current branch import with repo tags, provenance, deterministic branch document id, and replace mode", async () => {
    const dir = mkdtempSync(join(tmpdir(), "pi-hindsight-import-"));
    mkdirSync(join(dir, ".git"));
    const sessionFile = join(dir, "session.jsonl");
    writeFileSync(
      sessionFile,
      [
        JSON.stringify({ type: "session", id: "session-1", cwd: dir, timestamp: "s-t" }),
        JSON.stringify({
          type: "message",
          id: "root",
          parentId: null,
          timestamp: "t1",
          message: { role: "user", content: "hi" },
        }),
        JSON.stringify({
          type: "message",
          id: "old",
          parentId: "root",
          timestamp: "t2",
          message: { role: "assistant", content: "old branch" },
        }),
        JSON.stringify({
          type: "message",
          id: "current",
          parentId: "root",
          timestamp: "t3",
          message: { role: "assistant", content: "TOKEN=secret" },
        }),
      ].join("\n"),
    );
    const calls: unknown[][] = [];
    const result = await importPiSession({
      sessionFile,
      bankId: "bank",
      config: DEFAULT_CONFIG,
      client: {
        retain: async (...args: unknown[]) => {
          calls.push(args);
        },
        recall: async () => [],
        reflect: async () => ({}),
      },
    });
    expect(result.messageCount).toBe(2);
    expect(result.documentId).toBe("pi-import:session-1:leaf:current");
    expect(result.documents).toEqual([
      {
        documentId: "pi-import:session-1:leaf:current",
        leafId: "current",
        messageCount: 2,
        contentHash: expect.any(String),
      },
    ]);
    const manifest = await readImportManifest(result.manifestPath);
    expect(manifest.imports[result.documentId]).toMatchObject({
      documentId: result.documentId,
      bankId: "bank",
      sourceFile: sessionFile,
      messageCount: 2,
      leafId: "current",
      sessionId: "session-1",
      cwd: dir,
      includeBranches: "current-only",
      updateMode: "replace",
      contentHash: result.documents[0]?.contentHash,
    });
    expect(calls).toHaveLength(1);
    expect(calls[0]?.[0]).toBe("bank");
    expect(calls[0]?.[1]).not.toContain("TOKEN=secret");
    expect(calls[0]?.[1]).not.toContain("old branch");
    expect(calls[0]?.[2]).toMatchObject({
      updateMode: "replace",
      documentId: result.documentId,
      async: true,
      tags: expect.arrayContaining([
        "source:pi",
        "import:historical",
        "imported:true",
        "session:session-1",
        "branch:current",
        expect.stringMatching(/^repo:/),
        "forked:true",
      ]),
      metadata: expect.objectContaining({
        pi_session_file: sessionFile,
        cwd: dir,
        session_id: "session-1",
        branch_leaf_id: "current",
        session_timestamp: "s-t",
      }),
    });
  });

  it("imports all leaves only when includeBranches is all-leaves", async () => {
    const dir = mkdtempSync(join(tmpdir(), "pi-hindsight-import-"));
    mkdirSync(join(dir, ".git"));
    const sessionFile = join(dir, "session.jsonl");
    writeFileSync(
      sessionFile,
      [
        JSON.stringify({ type: "session", id: "session-2", cwd: dir }),
        JSON.stringify({
          type: "message",
          id: "root",
          parentId: null,
          message: { role: "user", content: "root" },
        }),
        JSON.stringify({
          type: "message",
          id: "a",
          parentId: "root",
          message: { role: "assistant", content: "a" },
        }),
        JSON.stringify({
          type: "message",
          id: "b",
          parentId: "root",
          message: { role: "assistant", content: "b" },
        }),
      ].join("\n"),
    );
    const calls: unknown[][] = [];
    const result = await importPiSession({
      sessionFile,
      bankId: "bank",
      config: {
        ...DEFAULT_CONFIG,
        import: { ...DEFAULT_CONFIG.import, includeBranches: "all-leaves" },
      },
      client: {
        retain: async (...args: unknown[]) => {
          calls.push(args);
        },
        recall: async () => [],
        reflect: async () => ({}),
      },
    });
    expect(result.documents).toEqual([
      {
        documentId: "pi-import:session-2:leaf:a",
        leafId: "a",
        messageCount: 2,
        contentHash: expect.any(String),
      },
      {
        documentId: "pi-import:session-2:leaf:b",
        leafId: "b",
        messageCount: 2,
        contentHash: expect.any(String),
      },
    ]);
    expect(calls).toHaveLength(2);
    expect(calls.map((call) => (call[2] as { documentId: string }).documentId)).toEqual([
      "pi-import:session-2:leaf:a",
      "pi-import:session-2:leaf:b",
    ]);
  });

  it("selects import branches without retaining or writing manifests", () => {
    const parsed = parseImportSessionJsonl(
      [
        JSON.stringify({ type: "session", id: "session-3", cwd: "/repo" }),
        JSON.stringify({
          type: "message",
          id: "root",
          parentId: null,
          message: { role: "user", content: "root" },
        }),
        JSON.stringify({
          type: "message",
          id: "a",
          parentId: "root",
          message: { role: "assistant", content: "a" },
        }),
        JSON.stringify({
          type: "message",
          id: "b",
          parentId: "root",
          message: { role: "assistant", content: "b" },
        }),
      ].join("\n"),
    );

    expect(
      selectImportBranches(parsed, "current-only").map((branch) => ({
        leafId: branch.leafId,
        messages: branch.messages.map((message) => message.data.content),
      })),
    ).toEqual([{ leafId: "b", messages: ["root", "b"] }]);
    expect(
      selectImportBranches(parsed, "all-leaves").map((branch) => ({
        leafId: branch.leafId,
        messages: branch.messages.map((message) => message.data.content),
      })),
    ).toEqual([
      { leafId: "a", messages: ["root", "a"] },
      { leafId: "b", messages: ["root", "b"] },
    ]);
  });
});
