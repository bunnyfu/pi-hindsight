# Architecture TODOs

These are deferred deepening opportunities identified after the mission/global-memory work.

## Memory routing

- Keep `globalRetain.mode = "explicit-only"` as the default.
- Router mode is explicit opt-in and now routes automatic retain through a mission-aware Adapter before enqueueing project/global/both/skip writes.
- Evaluation fixtures cover project/global/both/skip decisions. Future work: expand fixtures and add an LLM-backed Adapter behind the same Interface if heuristic quality is not enough.

## Config editing

- Config editing registry now owns field metadata plus layer/source display composition. Future work: move parse/patch behavior from config editing actions into the same registry so adding one setting usually touches one Module.

## Document deletion UX

- Recent explicit retain receipts are persisted, available through `hindsight_retain_receipts`, and surfaced in `/hindsight` status facts so users can find exact document IDs for deletion.

## Historical import queue seam

- Import delivery now has an import-specific queue seam and records queued-but-not-delivered imports as `queued` in checkpoints/results.
