# Architecture TODOs

These are deferred deepening opportunities identified after the mission/global-memory work.

## Memory routing

- Keep `globalRetain.mode = "explicit-only"` as the default until routing is proven safe.
- Replace or augment the current heuristic router Adapter with a mission-aware LLM Adapter before enabling automatic writes.
- Evaluation fixtures now cover project/global/both/skip dry-run decisions. Expand these fixtures and add a mission-aware LLM Adapter before any router mode writes memory automatically.

## Config editing

- Config editing registry now owns field metadata plus layer/source display composition. Future work: move parse/patch behavior from config editing actions into the same registry so adding one setting usually touches one Module.

## Document deletion UX

- Recent explicit retain receipts are persisted, available through `hindsight_retain_receipts`, and surfaced in `/hindsight` status facts so users can find exact document IDs for deletion.

## Historical import queue seam

- Import delivery now has an import-specific queue seam and records queued-but-not-delivered imports as `queued` in checkpoints/results.
