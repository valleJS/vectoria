---
name: docs-commit
description: Commit staged code through the agent while catching doc-to-code drift. Use whenever the user asks you to commit (e.g. "commit das", "commit this"): it checks the staged change against doc-leaf `sources`, and when code a leaf documents changed it proposes a `docs-write` update BEFORE the commit. The "commit" verb — distinct from docs-write (adds), docs-verify (checks), docs-defrag (removes/merges).
---

# docs-commit

The **commit** skill: it is the agent's entry point for `git commit`. It does not author docs
(`docs-write`), is not the structural gate (`docs-verify`), and does not consolidate (`docs-defrag`).
Its one job: commit the staged code and, in the same step, catch documentation that the staged code
just made stale — proposing the fix for human approval, never writing it silently.

> This is the agent-driven counterpart to the pre-commit staleness hook. The hook (running on a plain
> `git commit`) can only WARN and drop a marker — it cannot call an LLM. This skill runs when the
> human asks the agent to commit, so it can actually read the diff and draft the doc update.

## When to use

The moment the user asks you to commit (any phrasing: "commit das", "commit this", "mach den commit").
Prefer this over a bare `git commit` so doc drift is caught at commit time, not later at `docs-defrag`.

## Workflow

1. **Confirm the staged set.** `git diff --cached --name-only`. If nothing is staged, ask what to
   stage (or stage per the user's instruction) — do not commit an empty set.
2. **Drift check (staged scope).** Run the shared staleness check against the staged paths:
   ```
   .cursor/skills/_shared/scripts/check-doc-staleness.sh --staged
   ```
   It is read-only, exits 0, and prints `STALE <leaf>` blocks for every doc leaf whose `sources:`
   a staged path touches (leaves without `sources` are skipped — no false alarm). Last line is
   `stale=<n>`.
3. **No drift (`stale=0`) → commit straight away.** Write a clear message and `git commit`. Done.
4. **Drift (`stale>0`) → propose, then let the user decide.** For each stale leaf:
   - Gather the code diff of its `sources` for the staged change (`git diff --cached -- <sources>`).
   - Invoke the **`docs-write` update mode** with that diff as context to draft the leaf update.
   - Show the proposed doc patch as a **preview diff** (never write it silently).
   Then ask the user which path they want:
   | Choice | Action |
   |--------|--------|
   | **Docs with the code** | apply the accepted doc patch, `git add` the leaf, set its `sources_stamp` to the new commit, then `git commit` code + docs together |
   | **Code only now** | `git commit` the staged code as-is; record the stale leaves in `.cursor/skills/.staleness-pending` so the next `docs-defrag` picks them up |
5. **Never block.** If the user wants to commit regardless, commit. This skill proposes; it does not gate
   (that is `docs-verify`). A drift finding is advisory.

## Relationship to the other skills

- Reuses `_shared/scripts/check-doc-staleness.sh --staged` (same check the pre-commit hook runs).
- Delegates the actual doc edit to `docs-write` update mode — it does not re-implement authoring.
- The "code only" path writes the same `.staleness-pending` marker the hook uses, so `docs-defrag`
  closes the loop later either way.

## Canonical set

One of **four** canonical skills (`docs-write`, `docs-verify`, `docs-defrag`, `docs-commit`) plus the
`_shared` asset folder.
