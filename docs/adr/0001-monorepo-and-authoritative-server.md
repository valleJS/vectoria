---
type: ADR
description: Why vectoria is an npm-workspace monorepo with an authoritative WebSocket server, a source-only shared package, and imperative PixiJS rendering.
audience: agent
category: adr
last_verified: 2026-10-29
load-when: Questioning or changing the repo layout, the client/server authority model, the shared-package build, or the rendering approach.
---

# ADR 0001 — Monorepo, authoritative server, imperative rendering

**Status:** Accepted (2026-10-29)

## Context

A browser strategy game needs one source of truth for game rules, a protocol both sides agree
on at compile time, and a map view that stays smooth at thousands of tiles.

## Decisions

1. **npm workspaces** (`apps/*`, `packages/*`) rather than pnpm — no extra tooling to install;
   revisit if install time or phantom dependencies become a problem.
2. **Authoritative server.** Clients send intents (`selectTile`, …); the server validates them
   and owns all state, broadcasting a `snapshot` each tick from a fixed-rate loop.
3. **Shared package ships TypeScript source.** No build step for `@vectoria/shared`; Vite and
   `tsx` compile it in place, `tsup` bundles it into the server. Protocol changes are type
   errors on both sides immediately.
4. **JSON over a single `ws` socket**, not socket.io — smaller surface, no fallback transports
   needed for modern browsers. Revisit (binary encoding, delta snapshots) when payloads grow.
5. **PixiJS driven imperatively, not via React.** `GameRenderer` subscribes to the zustand store;
   React only mounts it and renders the HTML overlay. Avoids reconciling per-frame scene changes.
6. **Hand-written camera** instead of `pixi-viewport` — ~200 lines, no version coupling to Pixi.
7. **Postgres and Redis optional at boot** so the game runs with zero services in development.
8. **TypeScript pinned to `~6.0`** because `typescript-eslint` supports `<6.1`. Lift when it
   supports 7.

## Consequences

- Any new client message needs a case in `parseClientMessage` (server-side validation).
- Snapshots currently send every entity every tick; this will need interest management or
  deltas before large maps or many players.
