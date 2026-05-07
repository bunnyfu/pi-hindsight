---
title: "Getting started"
---

Pi Hindsight gives Pi durable memory through Hindsight. Start with a setup profile, then inspect the generated config before you rely on it.

## 1. Install

```bash
pi install https://github.com/luxus/pi-hindsight
```

For a local checkout:

```bash
pi install /path/to/pi-hindsight
```

## 2. Choose a Hindsight server

Use one of these paths:

- [Hindsight Cloud signup](https://ui.hindsight.vectorize.io/signup)
- [Self-hosted Hindsight installation](https://hindsight.vectorize.io/developer/installation)

For self-hosted setup, prefer Hindsight's built-in llama.cpp/local-LLM option when you want a private setup without an external LLM API key. The expected self-hosted default URL is:

```text
http://localhost:8888
```

## 3. Run guided setup

In Pi, run:

```text
/hindsight
```

If the repository has no project config yet, `/hindsight` starts guided setup. You can rerun guided setup later from the setup TUI with `g`.

Guided setup asks for a memory profile, bank IDs, optional bank templates, and optional dry-run-first historical import. It writes explicit config so you can inspect what changed.

## 4. Pick a memory profile

Choose the narrowest profile that fits the work.

### Project + User

Best default for personal coding. Project memory stays scoped to this repository. User memory is configured once in global Pi config and can carry stable preferences, coding style, and cross-repo workflows.

Use this when you want Pi to remember both repo facts and durable user habits.

### Project Only

Best for strict isolation. Project recall and automatic retain use the selected project bank. User memory is not enabled for the repository.

Use this for client code, sensitive repos, work projects, or anything that should not share memory across repositories.

### User Only

Best for non-repo assistance. Project memory is disabled. User memory is configured in global Pi config and can be reused across repositories.

Use this when repo-specific memory would be noise but user preferences still matter.

### Recall Only

Best for cautious adoption. Automatic recall stays enabled, automatic retain is disabled, and explicit tools/import remain available.

Use this when you want memory context but do not want the current session written automatically.

## 5. Mental model

Pi Hindsight is the Pi integration. Hindsight is the external memory service.

- **Recall** runs before model requests and injects ephemeral context. Recalled memory is not written back to the transcript by default.
- **Retain** runs after completed agent turns and writes sanitized session deltas through the durable retain queue.
- **Project banks** hold repository-specific memory and are selected per repo.
- **User banks** hold durable cross-repo memory and are configured once in global Pi config when you choose a user-memory profile.
- **Explicit tools** let you inspect, retain, recall, reflect, import, and administer memory intentionally.
- **Import** is deterministic backfill from historical sessions. It is not the same path as live retain.

## 6. First checks

After setup, use `/hindsight` to confirm:

- memory is enabled
- expected profile is active
- expected project bank is selected when project memory is enabled
- expected user bank is selected only when user memory is intended
- Hindsight server is reachable
- retain queue path is visible

Preview imports before writing memory:

```text
/hindsight:import-current --dry-run
/hindsight:import-project-sessions --dry-run
```
