---
name: docs-verify
description: Verify documentation against structural and MOC principles. Use before committing or merging doc changes. Runs the shared gates with a staged or branch scope.
---

# docs-verify

The **check** skill: verifies docs, never writes them. Use `docs-write` to add leaves and
`docs-defrag` to consolidate/remove.

## Scope

| Mode | Looks at | Use when |
|------|----------|----------|
| `--scope=staged` (default) | staged paths of the pending commit | pre-commit hygiene, changelog/`change_notes` discipline |
| `--scope=branch` | every file the branch touched vs. base | pre-merge / PR gate |

The tool is identical in both modes; only the file set differs.

## Workflow

1. Determine the file set from `--scope` (staged paths, or branch diff vs. base).
2. Load L1 MOC; ensure MOC entries point at new/changed leaves.
3. Run the shared gates from the asset folder:
   - `_shared/scripts/verify-docs-principles.sh` — MOC link gate
   - `_shared/scripts/check-dead-paths.sh` — dead relative links in `docs/**`
   - `_shared/scripts/verify-docs.sh` — full structural gate (profile, L1/L3, skills, forbidden
     paths incl. root `ARCHITECTURE.md`/`DEPLOYMENT.md`, Claude symlinks). Owns the `forbiddenGlobs`
     check — `docs-defrag` flags but does not re-implement it.
4. On `--scope=branch`: update indices only when new leaves were added.
5. Report `[ERROR]` lines with path; non-zero exit fails the gate.

## Canonical set

One of **four** canonical skills (`docs-write`, `docs-verify`, `docs-defrag`, `docs-commit`) plus the
`_shared` asset folder. Do not add `hybrid` / `docs-update` / `docs-concepts`.
