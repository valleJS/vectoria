---
name: docs-defrag
description: Consolidate, archive, merge, and prune documentation; remove orphaned paths while preserving MOC coherence. The "removes/merges" skill. Use docs-write to add, docs-verify to check.
---

# docs-defrag

The **removes/merges** skill: subtractive and structural cleanup. It does not author new leaves
(that is `docs-write`) and is not the pre-commit/merge gate (that is `docs-verify`).

## Step 0 — Tooling self-update (run FIRST, before any doc work)

The tooling lives in a central SSOT repo; this satellite vendored a copy. Before defragging docs,
check whether the SSOT advanced and, if so, pull the update into THIS repo only (pull model, never
pushed). All steps below are read-only until the explicit merge in 0d.

**0a. Locate the SSOT and compare HEADs.**
- Resolve the SSOT repo: `realpath ~/.claude/skills/docs-init` → its git toplevel.
- If a remote exists: `git -C <ssot> fetch --quiet` then read `git -C <ssot> rev-parse origin/HEAD`.
  No remote (origin = `(local-only)` in `.tooling-version`): fall back to local `HEAD`.
- Read `ssot_commit` from `<repo>/.cursor/skills/.tooling-version`. **Capture this OLD commit now** —
  0e re-stamps the file, so step 0f needs the pre-update value passed as `BASE_COMMIT`.
- **Equal → no update.** Skip to the doc workflow (step 1). Report "tooling up to date".

**0b. Survey the delta (read-only).** Run the diff helper; it classifies every vendored file:
```
SSOT_ROOT=<ssot> REPO_ROOT=<repo> .cursor/skills/_shared/scripts/diff-tooling.sh
```
Each line is `<relpath>\t<class>\t<status>`. Class comes from the SSOT `manifest.json`
(`managed` = take upstream hard; `local-overridable` = preserve local edits + merge upstream).
Status is `same | upstream-changed | local-changed | both-changed | new-upstream | removed-upstream`.

**0c. Decide per file (context-sensitive, do NOT blindly copy):**
| class | status | action |
|-------|--------|--------|
| any | `same` / `local-changed` (no upstream change) | leave the local file untouched |
| `managed` | `upstream-changed` / `new-upstream` | take the SSOT version hard (`git -C <ssot> show HEAD:<src>`) |
| `local-overridable` | `upstream-changed` | take upstream (no local edit to preserve) |
| `local-overridable` | `both-changed` | **merge semantically**: keep the local adaptation, fold in the upstream improvement. Read both versions, reconcile by intent. A genuine conflict you cannot reconcile is **reported to the human, not overwritten**. |
| `managed` | `local-changed` | local fork of a contract file → report it, then overwrite with upstream (managed wins) |
| any | `removed-upstream` | report; remove only after confirming it is not locally relied on |

**0d. Apply** the decided changes to the satellite's `.cursor/skills/` (the only write in step 0).
The SSOT-path for a vendored file: `_shared/*` ← `docs-init/templates/_shared/*`;
`<skill>/SKILL.md` ← `docs-init/templates/<skill>/skill.template.md`.

**0e. Re-stamp + verify.** Rewrite `.cursor/skills/.tooling-version` `ssot_commit` to the new HEAD
(keep the file's format), then run `_shared/scripts/verify-docs.sh` so the update did not break the
structural gate. Report what was taken-hard, merged, and any conflicts left for the human.

**0f. Migrate `docs/` to the new spec (PROPOSAL, never auto-commit).** The merge above updated the
*tooling*; now bring the *existing leaves* into line with the new spec — this is schema/structure
drift, the counterpart to the code-drift loop (steps 6-8). Run before step 5 so the pattern audit
then passes instead of failing.
```
SSOT_ROOT=<ssot> BASE_COMMIT=<OLD commit from 0a> .cursor/skills/_shared/scripts/diff-spec.sh
```
It prints the spec delta (changed `patterns.yaml` rules, new reserved files, layout changes) with
coarse `TAG` hints. Empty delta → skip. Otherwise derive what each change demands of the leaves
(added required field → backfill it with a value proposed from `description`/`category`, flagged
`review needed`; new reserved file like `docs/_router.md` → seed from template if absent; removed/
renamed rule → adjust, never delete a relied-on leaf without confirming). Preserve local edits; report
genuine conflicts. Full method + the change→action table: `_shared/reference/spec-migration.md`.
Surface as preview/branch/PR; after accept, re-run `verify-patterns.sh` + `verify-docs.sh`. Idempotent.

> Only this satellite is updated; other repos stay put until their own defrag runs.

## Workflow

1. Inventory leaves via MOC; mark candidates for merge/archive (see
   `_shared/reference/agent-doc-layout.md`).
2. Run `_shared/scripts/check-dead-paths.sh` after moves; fix broken relative links.
3. Re-run `_shared/scripts/verify-docs-principles.sh` to ensure hubs still resolve.
4. Flag root `ARCHITECTURE.md` / `DEPLOYMENT.md` or duplicated codemap prose as SSOT violations.
   (Detection is owned by `docs-verify`/`verify-docs.sh`; defrag acts on the findings.)

## Pattern audit

5. Run `_shared/scripts/verify-patterns.sh` (hard machine checks: line-count, frontmatter,
   heading-depth). For the soft `one-concept` rule, judge each leaf yourself: a leaf covering several
   independent topics is a split candidate — propose splitting it via `docs-write`.

## Self-healing loop (doc-to-code drift)

> Two distinct loops: **step 0f** = spec/schema drift (docs vs. tooling spec); **steps 6-8** below =
> code drift (docs vs. the code they document). Both are proposal-based, never auto-commit.

6. First read `.cursor/skills/.staleness-pending` if it exists: the pre-commit hook records leaves
   there when a commit touched their `sources`. Treat those as stale up front, then also run
   `_shared/scripts/check-doc-staleness.sh` (read-only) — it flags every leaf whose `sources:` have
   commits newer than its `sources_stamp` (leaves without `sources` are skipped — no false alarm).
   After proposing patches (step 7), clear the marker.
7. For each **stale** leaf, produce an **auto-patch PROPOSAL, never an auto-commit**:
   - Gather the code diff of the leaf's `sources` over `sources_stamp..HEAD`.
   - Invoke the `docs-write` **update mode** with that diff as context to draft the doc update.
   - Surface it as a preview / branch / PR comment for a human to review. Do not write to the leaf
     silently.
8. **After a human accepts** a patch: run `docs-verify`, then set the leaf's `sources_stamp` to the
   current code commit (`git rev-parse HEAD`). That closes the loop — the leaf is verified-against-code
   again and will not re-flag until the sources move on.

> Not available in non-git repos (e.g. `platform-harness`): staleness needs `git log` over `sources`.
> There, only the structural + pattern checks run.

## Scripts

- `_shared/scripts/diff-tooling.sh` (step 0, read-only 3-way classify vs. SSOT)
- `_shared/scripts/diff-spec.sh` (step 0f, read-only spec delta for doc migration)
- `_shared/scripts/check-dead-paths.sh`
- `_shared/scripts/verify-docs-principles.sh`
- `_shared/scripts/verify-patterns.sh` (step 5 pattern audit)
- `_shared/scripts/check-doc-staleness.sh` (step 6 drift detection)
- `_shared/scripts/verify-docs.sh` (step 0e / step 8 re-verify)

## Canonical set

One of **four** canonical skills (`docs-write`, `docs-verify`, `docs-defrag`, `docs-commit`) plus the
`_shared` asset folder.
