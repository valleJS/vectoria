---
type: Codemap
description: Path map for apps/server — config, game loop and state, gameday calendar, persistence, WebSocket + HTTP API, Postgres/Redis wiring.
audience: agent
category: codemap
last_verified: 2026-10-30
load-when: Any change under apps/server (game simulation, tick loop, WebSocket handling, database, Redis, env config).
sources: [apps/server/src/, apps/server/package.json, apps/server/drizzle.config.ts, apps/server/tsup.config.ts]
sources_stamp: 63d84a40a61e6dab14eafa95a6291e77a2b054e5
---

# Server codemap (`apps/server`)

Node 22+, ESM, TypeScript. Dev runs `tsx watch`; production builds a single bundle with `tsup`
→ `dist/index.js`. Cross-cutting context: [AGENTS_ARCHITECTURE.md](./AGENTS_ARCHITECTURE.md).

## Paths

| Path | Owns |
| ---- | ---- |
| `src/index.ts` | Startup order, load save, loop → broadcast wiring, graceful shutdown (saves) |
| `src/config.ts` | Env parsing + defaults (loads `.env` via `process.loadEnvFile`) |
| `src/services.ts` | Optional Postgres + Redis connect/close |
| `src/game/GameState.ts` | Authoritative game: phases, commands, clock advance, arrivals, combat, views |
| `src/game/calendar.ts` | Mon–Fri 10–18 schedule in a time zone; downtime catch-up |
| `src/game/world.ts` | Map sizing + castle/spot/chest placement |
| `src/game/persistence.ts` | JSON save file (`DATA_FILE`), atomic writes every 5 s |
| `src/game/GameLoop.ts` | Fixed-rate, drift-correcting tick scheduler |
| `src/game/mapgen.ts`, `random.ts` | Seeded terrain generation |
| `src/net/GameServer.ts` | `ws` on `/ws`: token auth, message dispatch, rate limit, heartbeat, per-player `state` |
| `src/net/http.ts` | `/healthz`, `/api/join`, `/api/lobby`, `/api/admin/*` |
| `src/db/schema.ts`, `client.ts` | Drizzle schema + `pg` pool |
| `drizzle/` | Generated migrations (`npm run db:generate`) |

## Tick flow

`GameLoop` fires every `1000 / TICK_RATE` ms → `GameState.update(dt)` (advance the gameday clock
if inside game hours, resolve arrivals in clock order, start a new gameday on rollover) →
`GameServer.broadcastState` (one filtered view per client). Commands mutate state only through
`GameState` methods, which throw `RuleError` for disallowed moves (sent back as `rejected`).

## Config (`.env`, see `.env.example`)

| Var | Default | Notes |
| --- | ------- | ----- |
| `PORT` / `HOST` | `3001` / `0.0.0.0` | |
| `TICK_RATE` | `5` | ticks per second |
| `MAP_SEED` | random | map size comes from player count |
| `ADMIN_TOKEN` | `admin` (dev) | **required in production** |
| `GAME_HOURS` / `GAME_TIMEZONE` | `weekdays` / `Europe/Berlin` | `always` for dev |
| `TIME_SCALE` | `1` | clock multiplier for testing |
| `VICTORY_POINTS_TO_WIN` | `25` | |
| `DATA_FILE` | `data/game.json` | relative to the server cwd; gitignored |
| `ALLOWED_ORIGINS` | empty = any | comma list; **set in production** |
| `DATABASE_URL` / `REDIS_URL` | unset = disabled | if set, connection failure is fatal |
