# _shared — documentation asset folder (NOT a selectable skill)

This folder holds the shared `scripts/` and `reference/` consumed by the four canonical doc
skills. It has **no `SKILL.md`** on purpose: it is a library, not a task. Agents never "choose"
`_shared`; the four skills below reference its assets.

## Canonical skills (four)

| Skill | Verb | Use when |
|-------|------|----------|
| `docs-write` | **adds** | new leaf, ADR, runbook → create + MOC-link |
| `docs-verify` | **checks** | structural + principle gates (`--scope=staged\|branch`) |
| `docs-defrag` | **removes/merges** | consolidate, archive, fix dead paths, drift audit |
| `docs-commit` | **commits** | commit staged code via the agent; catch doc-to-code drift, propose the fix |

## Shared scripts (single source — no per-skill duplicates)

```bash
scripts/verify-docs.sh             # structural gate (profile, L1/L3, skills, forbidden paths, symlinks)
scripts/verify-docs-principles.sh  # MOC link gate
scripts/check-dead-paths.sh        # dead relative links under docs/**
scripts/check-auto-sections.sh     # auto-section markers from profile
```

## Shared reference

`reference/agent-doc-layout.md` (layout + SSOT rules), `reference/agent-context-files.md`,
`reference/architecture-md.md`, `reference/doc-type-selector.md` (4-row routing),
`reference/precommit-integration.md`.

## Agent doc layout (summary)

- **Entry:** `AGENTS.md`, `CLAUDE.md` · **Hub:** `docs/_index.md` · **Leaves:** `docs/**/*.md` (one SSOT per topic)
- **Forbidden at repo root:** `ARCHITECTURE.md`, `DEPLOYMENT.md` → use `docs/AGENTS_ARCHITECTURE.md`, `docs/DEPLOYMENT.md`

See `reference/agent-doc-layout.md`.
