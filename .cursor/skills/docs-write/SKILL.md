---
name: docs-write
description: Author NEW documentation — leaves, ADRs, runbooks — using MOC-first structure. The "adds" skill. Use docs-defrag to consolidate or remove, docs-verify to check.
---

# docs-write

The **adds** skill: creates new documentation. It does not consolidate or delete (that is
`docs-defrag`) and does not gate changes (that is `docs-verify`).

## Workflow

1. Read `_shared/reference/agent-doc-layout.md` — leaves under `docs/`, hubs link only.
2. Pick doc type via `_shared/reference/doc-type-selector.md`.
3. Create a leaf under `docs/`; add one line + link to `docs/_index.md` (or layer codemap).
   Set the required leaf frontmatter `audience`, `category`, `last_verified`, and **`load-when`** (a
   plain-language load condition — the triage field an agent reads to decide relevance, e.g. *"Any
   server/API change."*); `type` is optional (OKF/RKF vocabulary). See `agent-doc-layout.md`.
   For **code-adjacent leaves** (architecture, codemaps, runbooks tied to specific files) you MUST set
   `sources: [<repo-relative paths>]` and `sources_stamp: <current commit>` (`git rev-parse HEAD`) so
   the self-healing drift check (`docs-defrag` step 6) can track them. Purely conceptual leaves may
   omit both.
   If the new leaf serves a recurring task, add a `| Task | Load |` row to `docs/_router.md` so the
   load decision stays deterministic.
4. Follow the patterns in `_shared/reference/patterns.yaml` (line-count, frontmatter, heading depth),
   then run `_shared/scripts/verify-patterns.sh` and `_shared/scripts/verify-docs.sh`
   (+ `check-auto-sections.sh` if the profile defines `autoSections`).

## Update mode (driven by docs-defrag)

When `docs-defrag` finds a stale leaf, it invokes docs-write in **update mode** with the code diff of
the leaf's `sources` over `sources_stamp..HEAD` as context. Produce a patch *proposal* (preview /
branch / PR comment) — **never an auto-commit**. After a human accepts it, re-run `docs-verify` and set
`sources_stamp` to the current commit, closing the loop.

## Canonical set

One of **four** canonical skills (`docs-write`, `docs-verify`, `docs-defrag`, `docs-commit`) plus the
`_shared` asset folder.
