---
type: Codemap
description: Path map for apps/server — config, game loop and state, WebSocket server, Postgres/Redis wiring.
audience: agent
category: codemap
last_verified: 2026-10-29
load-when: Any change under apps/server (game simulation, tick loop, WebSocket handling, database, Redis, env config).
sources: [apps/server/src/, apps/server/package.json, apps/server/drizzle.config.ts, apps/server/tsup.config.ts]
sources_stamp: a5083e462ac390d3f65dfa7e8e09140f02d11bb8
---

# Server codemap (`apps/server`)

Node 22+, ESM, TypeScript. Dev runs `tsx watch`; production builds a single bundle with `tsup`
→ `dist/index.js`. Cross-cutting context: [AGENTS_ARCHITECTURE.md](./AGENTS_ARCHITECTURE.md).

## Paths

| Path | Owns |
| ---- | ---- |
| `src/index.ts` | Startup order, HTTP server (`GET /healthz`), loop → broadcast wiring, graceful shutdown |
| `src/config.ts` | Env parsing + defaults (loads `.env` via `process.loadEnvFile`) |
| `src/services.ts` | Optional Postgres + Redis connect/close |
| `src/game/GameState.ts` | Authoritative in-memory world: map, players, units, `update(dt)` |
| `src/game/GameLoop.ts` | Fixed-rate, drift-correcting tick scheduler |
| `src/game/mapgen.ts`, `random.ts` | Seeded map generation |
| `src/net/GameServer.ts` | `ws` server on `/ws`: welcome, message dispatch, rate limit, heartbeat, broadcast |
| `src/db/schema.ts`, `client.ts` | Drizzle schema + `pg` pool |
| `drizzle/` | Generated migrations (`npm run db:generate`) |

## Tick flow

`GameLoop` fires every `1000 / TICK_RATE` ms → `GameState.update(dt)` → `GameServer.broadcast`
of a `snapshot`. Client commands mutate state only through validated `GameState` methods, never
directly from the socket handler.

## Config (`.env`, see `.env.example`)

| Var | Default | Notes |
| --- | ------- | ----- |
| `PORT` / `HOST` | `3001` / `0.0.0.0` | |
| `TICK_RATE` | `10` | ticks per second |
| `MAP_WIDTH` / `MAP_HEIGHT` / `MAP_SEED` | `64` / `64` / random | |
| `ALLOWED_ORIGINS` | empty = any | comma list; **set in production** |
| `DATABASE_URL` / `REDIS_URL` | unset = disabled | if set, connection failure is fatal |
