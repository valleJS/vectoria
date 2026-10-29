# Doc type selector (MOC routing)

## Quick map — four disjoint verbs

| Intent | Start here | Skill |
| ------ | ---------- | ----- |
| **Add** a leaf / ADR / codemap | `agent-doc-layout.md` → `docs/` + hub link | `docs-write` |
| **Check** before commit or merge (incl. layout / SSOT / forbidden paths) | `agent-doc-layout.md`, `docs/_index.md` | `docs-verify` (`--scope=staged\|branch`) |
| **Remove / merge** — consolidate, archive, fix dead paths, drift audit | MOC → archive index | `docs-defrag` |
| **Commit** staged code via the agent (catches doc-to-code drift, proposes the fix first) | staged diff vs. leaf `sources` | `docs-commit` |

`_shared` is an asset folder (scripts + reference), **not** a selectable skill.

Load **one row** per task; avoid reading all skills.
