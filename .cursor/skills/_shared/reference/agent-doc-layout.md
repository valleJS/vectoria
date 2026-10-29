# Agent doc layout (L1 service repos)

**Audience:** coding agents only. Human onboarding may use root `README.md`; that file is **not** part of the agent doc graph.

## Principles

1. **Leaves live under `docs/`** — architecture, codemaps, runbooks, ADRs, test plans.
2. **Hubs summarize and link** — no duplicated prose from leaves (see `token-efficiency.md`).
3. **One SSOT per topic** — path lists and runbook steps appear in exactly one leaf.

## Standard paths

| Path | Role |
| ---- | ---- |
| `AGENTS.md` | L1 entry: commands, stack, invariants, doc map |
| `CLAUDE.md` | Pointer to `AGENTS.md` (+ harness workspace section when L1) |
| `docs/_index.md` | L1 hub: navigation, links only (what *exists*) |
| `docs/_router.md` | L1 router: task→file load logic (what to load *for a task*) — RKF §5 |
| `docs/AGENTS_ARCHITECTURE.md` | System diagram + directory tree + module/directory map |
| `docs/AGENTS_SERVER.md` | Server/API/middleware/import path SSOT |
| `docs/AGENTS_APP.md` | UI/composable path SSOT |
| `docs/DEPLOYMENT.md` | Deploy/rollback/ops runbook (when applicable) |
| `docs/adr/*.md` | Durable decisions |
| `web/**/README.md` | One-liner per folder; link up to `docs/AGENTS_*` |

## Do not create

| Path | Why |
| ---- | --- |
| Root `ARCHITECTURE.md` | Use `docs/AGENTS_ARCHITECTURE.md` instead |
| Root `DEPLOYMENT.md` | Use `docs/DEPLOYMENT.md` instead |
| Duplicate codemaps | Extend the existing `docs/AGENTS_*` leaf |

Profile `documentation.forbiddenGlobs` should include `ARCHITECTURE.md` and `DEPLOYMENT.md` (repo root) to catch regressions.

## Layering (load order)

1. `AGENTS.md` / `CLAUDE.md`
2. `docs/_router.md` — match the task to a row (fast path); falls back to frontmatter triage
3. `docs/_index.md` — navigation, when the router has no row
4. One branch: `docs/AGENTS_ARCHITECTURE.md` → `AGENTS_SERVER` / `AGENTS_APP` as needed
5. `web/**/README.md` only when working inside that folder

## Leaf frontmatter

Every leaf carries YAML frontmatter so an agent can triage it (load-decide) from the header alone,
without reading the body. Required and optional fields:

| Field | Requirement | Purpose |
| ----- | ----------- | ------- |
| `audience` | required | who the leaf is for (usually `agent`) |
| `category` | required | the kind of leaf (codemap, runbook, adr, …) |
| `last_verified` | required | freshness signal (`YYYY-MM-DD`) |
| `load-when` | required | plain-language load condition — the second triage field (RKF). e.g. *"Any server/API change."* |
| `type` | optional | OKF/RKF self-describing kind. Small vocabulary: `Codemap`, `Runbook`, `ADR`, `Index`, `Router`. Makes the bundle a valid OKF/RKF bundle. |
| `sources`, `sources_stamp` | optional | self-healing drift loop (code-adjacent leaves) — see top of `patterns.yaml` |

`description` + `load-when` are the **triage contract**: an agent reads them and decides relevance
without opening the body. This is the core token-economy mechanism.

## Router (`docs/_router.md`)

The router is the one piece of the doc graph that is **logic, not metadata**: it maps a *task* to the
*exact files* to load, deterministically (RKF §5). It is the **fast path** — match a row, load those
files. No row matches → fall back to frontmatter triage (`description` + `load-when`). Frontmatter is
the source of truth; the router is a curated shortcut over it. Keep it short (≤ 80 lines, H2 max);
it routes, it doesn't explain. The module/directory map lives in `AGENTS_ARCHITECTURE.md`, not here.
