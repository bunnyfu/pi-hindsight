# Architecture TODOs

These are deferred deepening opportunities identified after the mission/global-memory work.

## Memory routing

- Make the dry-run memory router mission-aware instead of relying only on heuristics.
- Keep `globalRetain.mode = "explicit-only"` as the default until routing is proven safe.
- Add a router Adapter seam before enabling automatic writes so a future LLM classifier can replace the heuristic implementation.

## Config editing

- Deepen the config field registry so a field owns its path, reset key, UI metadata, parse/patch behavior, and source display in one place.
- Reduce the number of modules touched when adding one setting.

## Tool and command presentation

- Extract shared presentation helpers for receipts, imports, routing decisions, and destructive actions.
- Keep operations returning raw results; keep Pi registration as the Adapter.

## Memory operations

- Split `createMemoryOperations` internals into intent modules while preserving the composed interface for commands and tools.
- Candidate intent modules: recall/reflect, retain/flush, document deletion, routing, config/setup, import, diagnostics, session memory.

## Document deletion UX

- Document retain receipts and exact document deletion in the README.
- Consider a future receipt/history view so users can find recent `documentId` values without reading logs.

## Historical import queue seam

- Move historical import retain delivery through durable queue semantics or an import-specific queue seam.
- Preserve deterministic import document IDs and visible checkpoint/manifest behavior.
