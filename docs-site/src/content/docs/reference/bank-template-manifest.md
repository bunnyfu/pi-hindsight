---
title: "Bank template manifest reference"
description: Bank template import/export expectations and safety rules.
---

Bank template manifests describe Hindsight bank setup that can be exported, reviewed, dry-run, and applied through guided setup or internal operation paths.

## Where manifests are used

Pi Hindsight can use manifests through:

- guided setup in `/hindsight`, where pasted manifests are dry-run before confirmation
- the public `hindsight_get_bank_template_schema` and `hindsight_export_bank_template` tools
- internal setup operation paths that call Hindsight bank-template import
- Hindsight control plane workflows or REST endpoints outside Pi Hindsight

## Public surface

Pi Hindsight does not currently expose a public explicit bank-template import tool. The public tool surface exposes schema fetch and export only. Guided setup owns user-facing import today; direct Hindsight control-plane or REST import remains outside Pi Hindsight public tools.

## Rules

- Treat official Hindsight docs and API behavior as source of truth for manifest shape.
- Dry-run manifests before applying them.
- Keep manifests reviewable as JSON.
- Do not treat generated or exported manifests as product-design source of truth.
- Do not paste manifests containing private bank identifiers into public issues without review.

## Typical workflow

1. Export or obtain a manifest.
2. Review bank name, mental models, directives, and metadata.
3. In Pi Hindsight, paste the manifest during guided setup so it can dry-run before confirmation.
4. Apply only after the result matches the intended bank setup.
5. Verify bank status in `/hindsight`.

See [Starter mental model suggestions](../concepts/starter-mental-model-suggestions/) for concept background and [Hindsight API links](./hindsight-api-links/) for official API references.
