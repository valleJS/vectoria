# Architecture & codemap conventions

Agent docs only. **Single file:** `docs/AGENTS_ARCHITECTURE.md` (diagram + tree + module/directory map). Do **not** add root `ARCHITECTURE.md`. The task→file *load* logic lives in `docs/_router.md`, not here.

## `docs/AGENTS_ARCHITECTURE.md`

- Title + 1–2 sentences (system shape).
- Mermaid or link to diagram source (do not duplicate diagram prose elsewhere).
- Directory tree (SSOT for layout).
- “Where should I change X?” table → links to layer codemaps (`AGENTS_SERVER.md`, `AGENTS_APP.md`).
- Link constraints to `AGENTS.md` § Invariants (do not repeat invariant lists).
- Link ops to `docs/DEPLOYMENT.md` when applicable.

## Layer codemaps

- `docs/AGENTS_SERVER.md` — server path SSOT (API, middleware, DB, import backend).
- `docs/AGENTS_APP.md` — app path SSOT (pages, components, composables).

## ADRs

- `docs/adr/NNNN-title.md` — decisions only; link from hub, not duplicated in architecture file.

See `agent-doc-layout.md` for full layout.
