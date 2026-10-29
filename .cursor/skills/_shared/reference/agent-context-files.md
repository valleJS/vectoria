# Agent context files

## Purpose

Align coding agents on **one** profile, **five** skills, and **one doc tree** under `docs/`.

## Typical paths

| Path | Role |
| ---- | ---- |
| `AGENTS.md` | L1 entry (commands, invariants, doc map) |
| `CLAUDE.md` | `@AGENTS.md` pointer (+ harness section when L1) |
| `docs/_index.md` | L1 hub (links only) |
| `docs/AGENTS_*.md` | L3 leaves (architecture, server, app codemaps) |
| `.cursor/agent-profile.json` | `documentation.*` paths for verify scripts |
| `.cursor/skills/*` | Canonical five skills only |
| `.cursor/rules/*.mdc` | Optional always-apply or glob-scoped rules |

Layout contract: `reference/agent-doc-layout.md`.

## L0 scan

Parent agent resolves repo root, runs `detect-harness.sh`, reads profile if present, then loads harness MOC (L0) or repo MOC (L1) before deep files.

L1 service repos set `harnessPath` in `.cursor/agent-profile.json` pointing at the sibling harness (e.g. `../platform-harness`).
