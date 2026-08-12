import { describe, expect, it, vi } from "vitest";
import {
  KNOWLEDGE_PAGES_UNAVAILABLE,
  seedKnowledgePages,
} from "../extensions/banks/knowledge-page-seed.js";
import { KNOWLEDGE_PAGE_SEEDS } from "../extensions/banks/retain-strategies.js";
import type { HindsightLikeClient } from "../extensions/types.js";

function client(partial: Partial<HindsightLikeClient> = {}): HindsightLikeClient {
  return {
    retain: vi.fn(),
    recall: vi.fn(),
    reflect: vi.fn(),
    ...partial,
  };
}

describe("seedKnowledgePages", () => {
  it("degrades when createKnowledgePage is missing", async () => {
    const result = await seedKnowledgePages({
      client: client(),
      bankId: "bank",
    });
    expect(result.available).toBe(false);
    expect(result.reason).toBe("no_create_method");
    expect(result.created).toEqual([]);
  });

  it("dry-runs the five-page taxonomy without calling create", async () => {
    const createKnowledgePage = vi.fn();
    const getKnowledgeBaseTree = vi.fn(async () => ({ roots: [] }));
    const result = await seedKnowledgePages({
      client: client({ createKnowledgePage, getKnowledgeBaseTree }),
      bankId: "bank",
      dryRun: true,
      baseTags: ["source:pi", "project:demo"],
    });
    expect(result.available).toBe(true);
    expect(result.wouldCreate).toHaveLength(KNOWLEDGE_PAGE_SEEDS.length);
    expect(result.wouldCreate?.[0]?.tags).toEqual(
      expect.arrayContaining(["knowledge:component", "source:pi", "project:demo"]),
    );
    expect(createKnowledgePage).not.toHaveBeenCalled();
  });

  it("skips pages that already exist by name", async () => {
    const createKnowledgePage = vi.fn(async () => ({ page_id: "new" }));
    const getKnowledgeBaseTree = vi.fn(async () => ({
      roots: [
        { kind: "page", name: "Component map", id: "kp1" },
        { kind: "page", name: "Core concepts", id: "kp2" },
      ],
    }));
    const result = await seedKnowledgePages({
      client: client({ createKnowledgePage, getKnowledgeBaseTree }),
      bankId: "bank",
      dryRun: false,
    });
    expect(result.available).toBe(true);
    expect(result.skippedExisting).toEqual(["Component map", "Core concepts"]);
    expect(createKnowledgePage).toHaveBeenCalledTimes(KNOWLEDGE_PAGE_SEEDS.length - 2);
  });

  it("returns knowledge_pages_unavailable when tree probe gets 404", async () => {
    const createKnowledgePage = vi.fn();
    const getKnowledgeBaseTree = vi.fn(async () => {
      throw Object.assign(new Error("not found"), { status: 404 });
    });
    const result = await seedKnowledgePages({
      client: client({ createKnowledgePage, getKnowledgeBaseTree }),
      bankId: "bank",
    });
    expect(result.available).toBe(false);
    expect(result.reason).toBe(KNOWLEDGE_PAGES_UNAVAILABLE);
    expect(createKnowledgePage).not.toHaveBeenCalled();
  });

  it("creates missing pages with knowledge tier tags and page trigger", async () => {
    const createKnowledgePage = vi.fn(async () => ({ page_id: "kp" }));
    const getKnowledgeBaseTree = vi.fn(async () => ({ roots: [] }));
    const result = await seedKnowledgePages({
      client: client({ createKnowledgePage, getKnowledgeBaseTree }),
      bankId: "coding-bank",
      dryRun: false,
      baseTags: ["source:pi", "project:p1"],
    });
    expect(result.available).toBe(true);
    expect(result.created).toHaveLength(KNOWLEDGE_PAGE_SEEDS.length);
    expect(createKnowledgePage).toHaveBeenCalledWith(
      "coding-bank",
      "Component map",
      expect.stringContaining("components"),
      expect.objectContaining({
        tags: expect.arrayContaining(["knowledge:component", "source:pi", "project:p1"]),
        maxTokens: 4096,
        trigger: expect.objectContaining({
          refreshAfterConsolidation: true,
          factTypes: ["world", "experience", "observation"],
        }),
      }),
    );
  });
});
