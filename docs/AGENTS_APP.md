---
type: Codemap
description: Path map for apps/client — React shell, PixiJS renderer and camera, zustand store, WebSocket client, Tailwind HUD.
audience: agent
category: codemap
last_verified: 2026-10-29
load-when: Any change under apps/client (rendering, pan/zoom/click input, HUD/UI, client state, client networking).
sources: [apps/client/src/, apps/client/vite.config.ts, apps/client/package.json]
---

# Client codemap (`apps/client`)

React 19 + Vite + TypeScript, PixiJS 8 for the map, Tailwind 4 for the overlay, zustand for
state. Cross-cutting context: [AGENTS_ARCHITECTURE.md](./AGENTS_ARCHITECTURE.md).

## Paths

| Path | Owns |
| ---- | ---- |
| `src/App.tsx` | Layout: canvas layer + HUD layer; socket connect/disconnect |
| `src/state/store.ts` | zustand store — single source of client state |
| `src/net/socket.ts` | `GameSocket`: reconnect w/ backoff, ping/RTT, writes server messages to the store |
| `src/game/GameCanvas.tsx` | React mount point for Pixi; tile-click → store + `selectTile` |
| `src/game/GameRenderer.ts` | Pixi `Application`, layers (terrain, selection, units), store subscription |
| `src/game/Camera.ts` | Pan (drag), zoom (wheel/pinch, cursor-anchored), click vs drag, screen↔world |
| `src/ui/Hud.tsx` | Tailwind overlay panels |
| `vite.config.ts` | Dev proxy `/ws` → `localhost:3001` |

## Rules

- **React does not render the map.** `GameRenderer` reads the store via `useGameStore.subscribe`
  and draws imperatively; React only mounts it. Keep per-frame work out of React.
- **Overlay input:** the HUD root is `pointer-events-none`; interactive panels opt in with
  `pointer-events-auto` so the canvas keeps receiving pan/zoom/click.
- **Coordinates:** server positions are in tile units; world pixels = tiles × `map.tileSize`.
  `Camera.screenToWorld` converts canvas-local CSS px to world px.
- **WS URL:** same-origin `/ws` by default; override with `VITE_WS_URL`.
