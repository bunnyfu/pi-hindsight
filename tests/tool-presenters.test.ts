import { describe, expect, it } from "vitest";
import {
  createDirectiveToolResponse,
  deleteDirectiveToolResponse,
  exportBankTemplateToolResponse,
  getBankTemplateSchemaToolResponse,
  getDirectiveToolResponse,
  listMemoriesToolResponse,
  listDirectivesToolResponse,
  listOperationsToolResponse,
  operationToolResponse,
  updateDirectiveToolResponse,
} from "../extensions/tool-presenters.js";

describe("tool presenters", () => {
  it("presents directive tool results", () => {
    const list = listDirectivesToolResponse({
      bankId: "bank",
      result: {
        items: [
          { id: "directive-1", name: "Rule", content: "Use facts.", is_active: false, priority: 3 },
        ],
      },
    });
    expect(list.content[0]?.text).toContain("Directives in bank: 1");
    expect(list.content[0]?.text).toContain("Rule (directive-1) · inactive · priority 3");

    expect(
      getDirectiveToolResponse({
        bankId: "bank",
        directiveId: "directive-1",
        result: { id: "directive-1" },
      }).content[0]?.text,
    ).toContain("Directive directive-1 in bank.");
    expect(
      createDirectiveToolResponse({ bankId: "bank", result: { id: "directive-2" } }).content[0]
        ?.text,
    ).toContain("Created directive in bank.");
    expect(
      updateDirectiveToolResponse({
        bankId: "bank",
        directiveId: "directive-2",
        result: { id: "directive-2" },
      }).content[0]?.text,
    ).toContain("Updated directive directive-2 in bank.");
    expect(
      deleteDirectiveToolResponse({
        bankId: "bank",
        directiveId: "directive-2",
        result: { deleted: true },
      }).content[0]?.text,
    ).toContain("Deleted directive directive-2 in bank.");
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

  it("presents saved bank template export paths", () => {
    const response = exportBankTemplateToolResponse({
      bankId: "bank",
      outputPath: "/tmp/template.json",
      manifest: { version: "1", bank: { retain_mission: "Remember" } },
    });

    expect(response.content[0]?.text).toContain("Exported bank template from bank.");
    expect(response.content[0]?.text).toContain("Saved manifest: /tmp/template.json");
    expect(response.content[0]?.text).toContain("Bank overrides: 1");
  });

  it("presents bank template schema summary and raw JSON", () => {
    const result = {
      schema: {
        title: "BankTemplateManifest",
        properties: {
          version: { type: "string" },
          bank: { type: "object" },
        },
      },
    };

    const response = getBankTemplateSchemaToolResponse(result);

    expect(response.details).toBe(result);
    expect(response.content[0]?.text).toContain("Fetched Hindsight bank template JSON Schema.");
    expect(response.content[0]?.text).toContain("BankTemplateManifest; top-level fields: 2");
    expect(response.content[0]?.text).toContain('"version"');
  });
});
