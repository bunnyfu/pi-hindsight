# Architecture TODOs

These are deferred deepening opportunities identified after the mission/global-memory work.

## Memory routing

- Keep `globalRetain.mode = "explicit-only"` as the default until routing is proven safe.
- Replace or augment the current heuristic router Adapter with a mission-aware LLM Adapter before enabling automatic writes.
- Add evaluation fixtures for project/global/both/skip decisions before any router mode writes memory.

## Config editing

- Deepen the config field registry so a field owns its path, reset key, UI metadata, parse/patch behavior, and source display in one place.
- Reduce the number of modules touched when adding one setting.

## Document deletion UX

- Consider a future receipt/history view so users can find recent `documentId` values without reading logs.

## Historical import queue seam

- Move historical import retain delivery through durable queue semantics or an import-specific queue seam.
- Preserve deterministic import document IDs and visible checkpoint/manifest behavior.
