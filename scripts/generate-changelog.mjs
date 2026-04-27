#!/usr/bin/env node
import { writeFile } from "node:fs/promises";
import { ConventionalChangelog } from "conventional-changelog";

const types = [
  { type: "feat", section: "Features" },
  { type: "fix", section: "Bug Fixes" },
  { type: "perf", section: "Performance" },
  { type: "refactor", section: "Refactoring" },
  { type: "docs", section: "Documentation" },
  { type: "test", section: "Tests" },
  { type: "build", section: "Build System" },
  { type: "ci", section: "CI" },
  { type: "style", section: "Style" },
  { type: "chore", section: "Chores" },
  { type: "revert", section: "Reverts" },
];

const chunks = [];
const generator = new ConventionalChangelog(process.cwd())
  .readPackage()
  .loadPreset({ name: "conventionalcommits", types })
  .config({
    options: { releaseCount: 0 },
  });

for await (const chunk of generator.write()) {
  chunks.push(Buffer.isBuffer(chunk) ? chunk.toString("utf8") : String(chunk));
}

const body = chunks.join("").trim();
const fallback = "# Changelog\n\nNo Conventional Commits entries yet.\n";
const changelog = body ? `# Changelog\n\n${body}\n` : fallback;
await writeFile("CHANGELOG.md", changelog, "utf8");
