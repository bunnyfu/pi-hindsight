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

- Recent explicit retain receipts are persisted, available through `hindsight_retain_receipts`, and surfaced in `/hindsight` status facts so users can find exact document IDs for deletion.

## Historical import queue seam

- Import delivery now has an import-specific queue seam. Future work: add richer status for queued-but-not-delivered imports so commands can show retry state without treating every queued import as a generic failure.
