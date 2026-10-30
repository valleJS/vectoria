---
type: Router
description: Task-to-file routing for agents. Maps a task to the exact docs to load (RKF §5).
---

# docs/ — Router

**Fast path** for loading docs. Match your task to a row, load *only* those files. No match → fall back
to frontmatter triage: scan a leaf's `description` + `load-when` and load what fits. Frontmatter is the
source of truth; this router is a curated shortcut over it (RKF §5.2).

Layout: `.cursor/skills/_shared/reference/agent-doc-layout.md`. Navigation (what *exists*) lives in
[`_index.md`](./_index.md); this file is the *logic* (what to load *for a task*).

## Always load

| Scope | Load |
| ----- | ---- |
| Any task | [`AGENTS.md`](../AGENTS.md) → [`_index.md`](./_index.md) |

## Routing

| Task | Load |
| ---- | ---- |
| Understand the system / where does X live | [AGENTS_ARCHITECTURE.md](./AGENTS_ARCHITECTURE.md) |
| Change network protocol / shared types | [AGENTS_ARCHITECTURE.md](./AGENTS_ARCHITECTURE.md) (+ SERVER and APP) |
| Change server / game loop / WebSocket / DB / Redis | [AGENTS_SERVER.md](./AGENTS_SERVER.md) (+ ARCHITECTURE if cross-cutting) |
| Change rendering / camera / HUD / client state | [AGENTS_APP.md](./AGENTS_APP.md) |
| Change game rules / balance / cards / clock | [AGENTS_GAME.md](./AGENTS_GAME.md) (+ SERVER) |
| Understand a past decision | the relevant `adr/*.md` |

## Overrides

An explicit user request to load a specific file always wins over this table. When in doubt, load less
and let frontmatter triage pull the rest.
