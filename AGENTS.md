# vectoria

Agent entry point (L1). Commands, stack, invariants, and the doc map. **Summarize and link** —
detail lives in one leaf per topic under `docs/`.

## Commands

Run from the repo root (npm workspaces; Node ≥ 22.12).

| Task | Command |
| ---- | ------- |
| Install | `npm install` |
| Dev (server :3001 + client :5173) | `npm run dev` |
| Pre-commit gate (format, lint, types) | `npm run check` |
| Build / run production server | `npm run build` / `npm start` |
| Postgres + Redis (Docker) | `npm run services:up` |
| DB migrations | `npm run db:generate` / `npm run db:migrate` |
| Add a dependency | `npm i <pkg> -w @vectoria/<client\|server\|shared>` |

## Stack

npm-workspace monorepo: `apps/client` (React 19, Vite, PixiJS 8, Tailwind 4, zustand),
`apps/server` (Node, `ws`, Drizzle + `pg`, `ioredis`), `packages/shared` (protocol + game types).
TypeScript 6 (pinned `~6.0` until `typescript-eslint` supports 7), ESLint flat config, Prettier.
Shape and protocol: [`docs/AGENTS_ARCHITECTURE.md`](docs/AGENTS_ARCHITECTURE.md).

## Invariants

- The server is authoritative: clients send intents, the server validates and owns all game state.
- Network message and game-entity types live only in `packages/shared`; never redeclare them in an app.
- Agent docs live under `docs/`; never create root `ARCHITECTURE.md` or `DEPLOYMENT.md`.
- One SSOT per topic: hubs (`AGENTS.md`, `docs/_index.md`) link, leaves own the detail.
- Every `docs/**` leaf carries frontmatter: `audience`, `category`, `last_verified`, `load-when`.

## Doc map

| Need | Go to |
| ---- | ----- |
| What to load for a task | [`docs/_router.md`](docs/_router.md) |
| What docs exist | [`docs/_index.md`](docs/_index.md) |
| Layout contract | `.cursor/skills/_shared/reference/agent-doc-layout.md` |

## Doc skills

| Skill | Verb | Use when |
| ----- | ---- | -------- |
| `docs-write` | adds | new leaf, ADR, runbook |
| `docs-verify` | checks | before commit / merge (`--scope=staged\|branch`) |
| `docs-defrag` | removes/merges | consolidate, archive, dead paths, drift audit |
| `docs-commit` | commits | commit staged code; catch doc-to-code drift first |
