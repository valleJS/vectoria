# vectoria

Agent entry point (L1). Commands, stack, invariants, and the doc map. **Summarize and link** —
detail lives in one leaf per topic under `docs/`.

## Commands

| Task | Command |
| ---- | ------- |
| *(install / dev / test / lint — add once the stack exists)* | |

## Stack

*(Not chosen yet — record languages, frameworks, and runtime here; structure goes in
[`docs/AGENTS_ARCHITECTURE.md`](docs/AGENTS_ARCHITECTURE.md).)*

## Invariants

- Agent docs live under `docs/`; never create root `ARCHITECTURE.md` or `DEPLOYMENT.md`.
- One SSOT per topic: hubs (`AGENTS.md`, `docs/_index.md`) link, leaves own the detail.
- Every `docs/**` leaf carries frontmatter: `audience`, `category`, `last_verified`, `load-when`.

## Doc map

| Need | Go to |
| ---- | ----- |
| What to load for a task | [`docs/_router.md`](docs/_router.md) |
| What docs exist | [`docs/_index.md`](docs/_index.md) |
| Layout contract | `.cursor/skills/_shared/reference/agent-doc-layout.md` |

## Doc skills

| Skill | Verb | Use when |
| ----- | ---- | -------- |
| `docs-write` | adds | new leaf, ADR, runbook |
| `docs-verify` | checks | before commit / merge (`--scope=staged\|branch`) |
| `docs-defrag` | removes/merges | consolidate, archive, dead paths, drift audit |
| `docs-commit` | commits | commit staged code; catch doc-to-code drift first |
