#!/usr/bin/env node
import { writeFile } from "node:fs/promises";
import { ConventionalChangelog } from "conventional-changelog";

const chunks = [];
const generator = new ConventionalChangelog(process.cwd())
  .readPackage()
  .loadPreset("conventionalcommits")
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
