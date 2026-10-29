# Spec migration (docs-defrag step 0f)

How to bring a satellite's `docs/` into line with a NEWER tooling spec, after `docs-defrag` step 0
has merged the tooling. This is **schema/structure drift** — distinct from the code drift loop
(step 6-8, which tracks `sources`/`sources_stamp`). Both produce **proposals, never auto-commits**.

## Input: the spec delta

`diff-spec.sh` (read-only) prints, for each changed spec file, coarse `TAG` hints plus the raw
`git diff BASE..HEAD`. The tags are hints; **you interpret the diff**, you do not act on tags blindly.

> **BASE must be the OLD commit.** Step 0e re-stamps `.tooling-version` to the new HEAD, so by step 0f
> the stamp is already current. docs-defrag captures the old `ssot_commit` at the START of step 0 and
> passes it as `BASE_COMMIT=<old>` to `diff-spec.sh`. Without it the delta is empty.

The spec files: `_shared/reference/patterns.yaml` (machine rules), the `docs/*.template.md` (reserved
files), and `agent-doc-layout.md` (prose spec for leaf frontmatter + layout).

## From spec change to doc change

Read each delta and derive what it demands of the existing `docs/` leaves. Common shapes:

| Spec change (TAG) | What it means for `docs/` | Action |
|-------------------|---------------------------|--------|
| `FIELDS-NOW` gains a field (e.g. `load-when`) | every leaf must now carry it | find leaves missing it; add the field |
| `FIELDS-WAS` loses a field | the field is no longer required | leave existing values; optional cleanup |
| `RULE-ADDED <id>` (e.g. line/heading cap) | new constraint on leaves | find violating leaves; propose a fix (split, trim) |
| `RULE-REMOVED <id>` | constraint dropped | nothing forced; only act if a doc existed *only* to satisfy it |
| `RESERVED-FILE-NEW <path>` | a new reserved file (e.g. `docs/_router.md`) | if absent in the satellite, **seed it from the template** |
| renamed reserved file / template | structure changed | rename the satellite file; fix inbound links |

### Deriving a value for an added required field

For a new required field with no source of truth (e.g. `load-when`), derive a **proposed** value from
the leaf's existing `description` + `category`/`type` (e.g. a server codemap → `load-when: "Any
server/API change."`). This is a heuristic — mark it `review needed` in the proposal; the human
confirms or rewrites it. Never invent a value silently.

## Preserve local edits

A satellite may have locally tuned its leaves. Apply **only** the change the spec delta demands; keep
everything else. A genuine conflict (the spec wants X, the local leaf deliberately does Y) is
**reported to the human, not overwritten** — same rule as the tooling merge (step 0c).

## Safety on removal / rename

Never delete or rename a leaf on a removed/renamed rule without confirming it is not locally relied on
(inbound links, references). Mirror step 0c's `removed-upstream` rule: report first, remove only after
confirmation.

## Output: the proposal

Group the proposal so the human can scan it: **added fields** (per leaf, with the derived value and a
`review needed` flag), **seeded files** (new reserved files), **renames/removals** (each with its
inbound-link impact). Surface as preview / branch / PR diff. After the human accepts: run
`verify-patterns.sh` + `verify-docs.sh`; both must pass. The migration is idempotent — a second run
finds an empty delta and does nothing.

## Non-git satellites

`diff-spec.sh` needs the SSOT's git (always present). The leaf edits in the satellite are plain file
writes, so migration works even where the satellite itself is not a git repo (e.g. `platform-harness`).
