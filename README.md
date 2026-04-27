# Pi Hindsight Extension

Persistent memory for Pi, backed by Hindsight.

This package adds a Pi extension that can recall relevant project memory before model calls, retain structured session deltas after completed agent runs, and expose explicit tools for direct memory operations.

## Current status

This is an early MVP scaffold. It includes:

- Pi package metadata in `package.json`
- extension entrypoint at `extensions/index.ts`
- config resolution from defaults, global config, project config, and environment
- deterministic project bank derivation
- stable live-session document IDs
- Hindsight client adapter using `@vectorize-io/hindsight-client`
- automatic recall through Pi's `context` hook
- automatic retain queueing through Pi's `agent_end` hook
- best-effort queue flushing on `session_shutdown`
- import manifest tracking for historical session imports
- explicit tools:
  - `hindsight_recall`
  - `hindsight_retain`
  - `hindsight_configure`
  - `hindsight_import`
  - `hindsight_reflect`
- commands:
  - `/hindsight:status`
  - `/hindsight:doctor`
  - `/hindsight:config`
  - `/hindsight:debug`
  - `/hindsight:setup`
  - `/hindsight:init`
  - `/hindsight:import`
  - `/hindsight:flush`
- tests for config, bank derivation, stable document IDs, sanitization, recall formatting, retain payloads, diagnostics, client request shapes, extension hook placement, historical import, import manifests, and queue replay

Historical import MVP supports importing the current Pi session or an explicit JSONL path via tool. Imports write deterministic document IDs and update an import manifest so `/hindsight:debug` can show imported document count and latest import provenance.

## Install for local development

```bash
npm install
npm run typecheck
npm test
```

Run Pi with the local package or extension:

```bash
pi -e ./extensions/index.ts
```

Or install the package path:

```bash
pi install /Users/luxus/projects/pi-hindsight
```

## Configuration

Defaults can be overridden by:

1. `~/.pi/agent/hindsight.json`
2. `.pi/hindsight.json` in the current repo
3. environment variables

Config is normalized after merging. Unknown fields are ignored, invalid enum values fall back to defaults, and removed/reserved MVP fields do not affect behavior.

Inside Pi, open the interactive configuration TUI:

```text
/hindsight:setup
```

The setup TUI lets you edit the project bank ID, Hindsight base URL, timeout, global bank, recall budget, token budget, retain settings, queue path, import branch mode, and statusline display. It writes `.pi/hindsight.json` and reloads the extension config after each change. Active MVP import config is limited to branch mode, replace-vs-append behavior, and manifest path.

For a quick default config, run:

```text
/hindsight:init
```

That writes `.pi/hindsight.json` with the currently selected project bank ID and current Hindsight base URL. Agents can also call the `hindsight_configure` tool to write a specific project bank override.

Supported environment overrides:

```bash
export HINDSIGHT_BASE_URL=http://localhost:8888
export HINDSIGHT_API_KEY=...
export PI_HINDSIGHT_ENABLED=true
export PI_HINDSIGHT_PROJECT_BANK_ID=pi-project-my-repo
export PI_HINDSIGHT_GLOBAL_BANK_ID=pi-global
```

Example project config:

```json
{
  "banks": {
    "project": { "bankId": "pi-project-my-repo", "derive": "manual" },
    "global": { "enabled": false }
  },
  "recall": {
    "budget": "low",
    "maxTokens": 800
  },
  "retain": {
    "queuePath": ".pi/hindsight/retain-queue.jsonl",
    "updateMode": "append"
  },
  "import": {
    "manifestPath": ".pi/hindsight/import-manifest.json"
  },
  "status": {
    "style": "text",
    "detail": "project",
    "maxLength": 24,
    "showActivity": true
  }
}
```

## Memory behavior

Automatic recall runs in the `context` hook and injects an ephemeral `<hindsight-memory>` message into the provider context. Project bank recall is scoped by the current repo tag. If a global bank is enabled, global recall uses an explicit non-repo `source:pi` scope so cross-project memories can be found without requiring the current repo tag. The injected memory block is not written to the Pi transcript by this extension.

Automatic retain runs in the `agent_end` hook. It stores a structured JSON projection of new messages, not a summary. Live sessions use stable `documentId` values and `updateMode: "append"`. A persisted retain cursor under `.pi/hindsight/retain-cursors.json` prevents duplicate appends when Pi provides overlapping transcripts, including after extension restart. Explicit retain tool tags are merged with the base `source:pi`, repo, and session tags so manually retained memories remain visible to default project recall.

Retain jobs are written to a JSONL queue before sending. If Hindsight is down, jobs remain on disk for later flushing. Queue operations use an in-process mutex plus a lock directory next to the queue file so multiple Pi processes do not rewrite the active queue concurrently. Jobs that exceed the retry limit are moved to a sibling dead-letter file (`<queue>.dead.jsonl`) instead of retrying forever.

At session start, the extension shows the selected bank ID. If no bank ID is configured, it reports the automatically derived bank ID and how to override it.

The footer status is configurable with two independent knobs:

- `status.style`: `off`, `text`, `emoji`, or `nerdfont`
- `status.detail`: `minimal`, `project`, `activity`, or `verbose`

`status.maxLength` caps displayed text, and `status.showActivity` controls whether recall/retain activity replaces the idle text.

## Debug and smoke tests

Use the debug command inside Pi to inspect what the extension believes:

```text
/hindsight:debug
```

The report includes the project bank ID, whether it was configured or derived, current tags, queue path, queue length, import manifest summary, Hindsight reachability, and redacted effective config.

Run the local smoke test against a real Hindsight server:

```bash
export HINDSIGHT_BASE_URL=http://localhost:8888
# export HINDSIGHT_API_KEY=... # if needed
npm run smoke:hindsight
```

The smoke test creates a temporary bank, retains a unique marker with `updateMode: "append"`, recalls it, and runs `reflect`. It uses the configured Hindsight server; it does not start a server. For release verification, run:

```bash
npm run check:release
```

GitHub Actions runs normal checks on PRs/pushes. The live Hindsight smoke job is manual (`workflow_dispatch`) and requires repository secrets:

- `HINDSIGHT_BASE_URL` — base URL of the Hindsight server, for example `https://h1.example.com`
- `HINDSIGHT_API_KEY` — optional, only if the server requires an API key

Optional repository variables:

- `HINDSIGHT_SMOKE_ATTEMPTS` — recall retry attempts, default `20`
- `PI_HINDSIGHT_SMOKE_BANK_ID` — fixed smoke bank ID; omit to use a timestamped bank

## Safety notes

The extension redacts common API keys, bearer tokens, GitHub tokens, password-style environment assignments, and credentials embedded in URLs before automatic retain.

Do not enable debug logging of raw retained payloads unless you have reviewed the data.

## Development checks

Run the full precommit check suite:

```bash
npm run check
```

That runs formatting (`oxfmt`), linting (`oxlint` with type-aware checks), `tsgo` typechecking, and the Vitest suite. `npm install` installs the repo hook path. `.githooks/pre-commit` runs `npm run precommit` before commits, and `.githooks/commit-msg` enforces Conventional Commits 1.0.0 commit messages.

`CHANGELOG.md` is generated from Conventional Commits:

```bash
npm run changelog
```

The `version` script also regenerates and stages `CHANGELOG.md` during `npm version`.

Useful targeted checks:

```bash
npm run format
npm run lint
npm run typecheck
npm run typecheck:tsc
npm test
```
