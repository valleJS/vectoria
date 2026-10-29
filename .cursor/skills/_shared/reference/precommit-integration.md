# Pre-commit integration

## Recommended hooks

All shared scripts live once under `.cursor/skills/_shared/scripts/` (no per-skill duplicates):

- `_shared/scripts/verify-docs.sh` — structural gate
- `_shared/scripts/verify-docs-principles.sh` — MOC/link principles
- `_shared/scripts/check-dead-paths.sh` — relative link scan in `docs/**`

## Example (local)

```yaml
repos:
  - repo: local
    hooks:
      - id: verify-docs
        name: verify-docs
        entry: bash .cursor/skills/_shared/scripts/verify-docs.sh
        language: system
        pass_filenames: false
```

The `docs-verify` skill wraps these gates with `--scope=staged|branch`; the hook above runs the
structural gate directly.

## Staleness hook (auto-installed)

`scaffold-repo-skills.sh` installs a doc-to-code drift **warning** into the repo's native
`.git/hooks/pre-commit`. On commit it runs `check-doc-staleness.sh --staged`: if a staged change
touches a `sources:` path of a doc leaf, it WARNS and records the stale leaves in
`.cursor/skills/.staleness-pending`. It **never blocks** the commit. The next `docs-defrag` run reads
that marker and proposes a `docs-write` update — the doc patch is never written by the hook itself.

The install is marker-bounded and idempotent, so it coexists with an existing hook:

```bash
# >>> polaris-docs staleness (managed) >>>
"$(git rev-parse --show-toplevel)/.cursor/skills/_shared/scripts/hooks/pre-commit-staleness" || true
# <<< polaris-docs staleness <<<
```

**If you use `core.hooksPath`** (husky, lefthook, a custom hooks dir), git ignores the native
`.git/hooks/pre-commit`, so the auto-installed block may not run. Scaffold prints a notice in that
case — add the line above to your active pre-commit hook to keep the warning.
