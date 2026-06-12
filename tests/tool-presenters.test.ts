import { describe, expect, it } from "vitest";
import {
  bankProfileToolResponse,
  documentToolResponse,
  entityToolResponse,
  graphToolResponse,
  listMemoriesToolResponse,
  listDocumentsToolResponse,
  listEntitiesToolResponse,
  listOperationsToolResponse,
  listTagsToolResponse,
  operationToolResponse,
  updateBankConfigToolResponse,
} from "../extensions/tui/tool-presenters.js";

describe("tool presenters", () => {
  it("presents document/entity/graph/tag/profile inspection compactly", () => {
    const documents = listDocumentsToolResponse({
      bankId: "bank",
      result: {
        items: [
          {
            id: "doc-1",
            tags: ["source:pi"],
            document_metadata: { cwd: "/repo" },
            memory_unit_count: 2,
            created_at: "now",
          },
        ],
      },
    });
    expect(documents.content[0]?.text).toContain("Documents in bank: 1");
    expect(documents.content[0]?.text).toContain("doc-1 · tags=source:pi · metadata=cwd");
    expect(documents.content[0]?.text).toContain("memories=2");

    expect(
      documentToolResponse("Document doc-1.", {
        bankId: "bank",
        documentId: "doc-1",
        result: { id: "doc-1" },
      }).content[0]?.text,
    ).toContain("Document doc-1.");

    expect(
      listEntitiesToolResponse({
        bankId: "bank",
        result: {
          items: [{ id: "entity-1", canonical_name: "Alice", type: "person", mention_count: 3 }],
        },
      }).content[0]?.text,
    ).toContain("entity-1 · Alice · person · count=3");
    expect(
      entityToolResponse("Entity entity-1.", {
        bankId: "bank",
        entityId: "entity-1",
        result: { id: "entity-1" },
      }).content[0]?.text,
    ).toContain("Entity entity-1.");
    expect(
      graphToolResponse("Graph.", {
        bankId: "bank",
        result: { nodes: [{ id: "n1" }], edges: [] },
      }).content[0]?.text,
    ).toContain("nodes=1; edges=0");
    expect(
      listTagsToolResponse({
        bankId: "bank",
        result: { items: [{ tag: "source:pi", count: 4 }] },
      }).content[0]?.text,
    ).toContain("source:pi · count=4");
    expect(
      bankProfileToolResponse("Profile.", { bankId: "bank", result: { id: "bank" } }).content[0]
        ?.text,
    ).toContain("Profile.");
  });

  it("presents operation and memory inspection summaries", () => {
    const operations = listOperationsToolResponse({
      bankId: "bank",
      result: {
        items: [
          {
            id: "op-1",
            status: "failed",
            task_type: "retain",
            document_ids: ["doc-1"],
            items_count: 2,
            error: "boom",
            created_at: "2026-05-07T00:00:00Z",
            updated_at: "2026-05-07T00:01:00Z",
            payload: { document_id: "doc-1", update_mode: "append" },
          },
        ],
      },
    });
    expect(operations.content[0]?.text).toContain("Operations in bank: 1");
    expect(operations.content[0]?.text).toContain(
      "op-1 · failed · retain · docs=doc-1 · items=2 · error=boom",
    );
    expect(operations.content[0]?.text).toContain("document_id, update_mode");

    expect(
      operationToolResponse("Cancelled", {
        bankId: "bank",
        operationId: "op-1",
        result: { id: "op-1", status: "cancelled" },
      }).content[0]?.text,
    ).toContain("Cancelled operation op-1 in bank.");

    const memories = listMemoriesToolResponse({
      bankId: "bank",
      result: { items: [{ id: "mem-1", type: "observation", content: "Exact fact" }] },
    });
    expect(memories.content[0]?.text).toContain("Memories in bank: 1");
    expect(memories.content[0]?.text).toContain("mem-1 · observation · Exact fact");
  });

  it("presents bank config updates", () => {
    const updated = updateBankConfigToolResponse({
      bankId: "bank",
      updates: { recall_budget_function: "fixed" },
      before: { config: {}, overrides: {} },
      result: { ok: true },
      after: {
        config: { recall_budget_function: "fixed" },
        overrides: { recall_budget_function: "fixed" },
      },
    });
    expect(updated.content[0]?.text).toContain("Updated bank config overrides for bank.");
    expect(updated.content[0]?.text).toContain("Updated fields: 1");
    expect(updated.content[0]?.text).toContain("After: Bank overrides: 1");
  });
});
