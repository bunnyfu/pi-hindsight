import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG } from "../extensions/config.js";
import { buildConfigEditingFields, type ConfigLayers } from "../extensions/config-editing-model.js";

describe("config editing model", () => {
  function layers(overrides: Partial<ConfigLayers> = {}): ConfigLayers {
    return {
      project: {},
      global: {},
      env: {},
      ...overrides,
    };
  }

  it("marks project-only settings", () => {
    const fields = buildConfigEditingFields(DEFAULT_CONFIG, "bank", layers());

    expect(fields.find((field) => field.id === "projectBankId")?.editableScopes).toEqual([
      "project",
    ]);
    expect(fields.find((field) => field.id === "memoryProfile")?.editableScopes).toEqual([
      "project",
    ]);
    expect(fields.find((field) => field.id === "queuePath")?.editableScopes).toEqual(["project"]);
    expect(fields.find((field) => field.id === "importBranches")?.editableScopes).toEqual([
      "project",
    ]);
    expect(fields.find((field) => field.id === "importManifest")?.editableScopes).toEqual([
      "project",
    ]);
    expect(fields.find((field) => field.id === "importCheckpoint")?.editableScopes).toEqual([
      "project",
    ]);
    expect(fields.find((field) => field.id === "importReplaceExisting")?.editableScopes).toEqual([
      "project",
    ]);
    expect(fields.find((field) => field.id === "importResume")?.editableScopes).toEqual([
      "project",
    ]);
  });

  it("allows shared settings to be edited globally or per project", () => {
    const fields = buildConfigEditingFields(DEFAULT_CONFIG, "bank", layers());

    expect(fields.find((field) => field.id === "baseUrl")?.editableScopes).toEqual([
      "project",
      "global",
    ]);
    expect(fields.find((field) => field.id === "recallBudget")?.editableScopes).toEqual([
      "project",
      "global",
    ]);
    expect(fields.find((field) => field.id === "statusStyle")?.editableScopes).toEqual([
      "project",
      "global",
    ]);
  });

  it("builds patch intent for field edits", () => {
    const fields = buildConfigEditingFields(DEFAULT_CONFIG, "bank", layers());
    const memoryProfile = fields.find((field) => field.id === "memoryProfile");
    const queuePath = fields.find((field) => field.id === "queuePath");

    expect(memoryProfile).toMatchObject({
      kind: "select",
      choices: ["project-only", "project+global", "global-only"],
    });
    expect(queuePath).toMatchObject({ kind: "text" });
  });

  it("reports source precedence and layer values", () => {
    const fields = buildConfigEditingFields(
      { ...DEFAULT_CONFIG, hindsight: { ...DEFAULT_CONFIG.hindsight, baseUrl: "http://env" } },
      "bank",
      layers({
        project: { hindsight: { baseUrl: "http://project" } },
        global: { hindsight: { baseUrl: "http://global" } },
        env: { HINDSIGHT_BASE_URL: "http://env" },
      }),
    );

    const baseUrl = fields.find((field) => field.id === "baseUrl");
    expect(baseUrl).toMatchObject({
      value: "http://env",
      source: "env",
      envValue: "http://env",
      projectValue: "http://project",
      globalValue: "http://global",
    });
  });
});
