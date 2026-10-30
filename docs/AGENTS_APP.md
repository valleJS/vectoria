---
type: Codemap
description: Path map for apps/client — React shell, PixiJS renderer and camera, zustand store, WebSocket client, Tailwind HUD.
audience: agent
category: codemap
last_verified: 2026-10-30
load-when: Any change under apps/client (rendering, pan/zoom/click input, HUD/UI, client state, client networking).
sources: [apps/client/src/, apps/client/vite.config.ts, apps/client/package.json]
sources_stamp: a5083e462ac390d3f65dfa7e8e09140f02d11bb8
---

# Client codemap (`apps/client`)

React 19 + Vite + TypeScript, PixiJS 8 for the map, Tailwind 4 for the overlay, zustand for
state. Cross-cutting context: [AGENTS_ARCHITECTURE.md](./AGENTS_ARCHITECTURE.md).

## Paths

| Path | Owns |
| ---- | ---- |
| `src/App.tsx` | Routing: `/?admin` → admin panel; no token → join; registration → lobby; else game |
| `src/state/store.ts` | zustand store — token, `GameView`, map, selection, toast |
| `src/net/socket.ts` | `GameSocket`: token connect, reconnect w/ backoff, ping/RTT, writes to the store |
| `src/net/api.ts` | HTTP client for join, lobby, admin |
| `src/game/GameCanvas.tsx` | React mount point for Pixi |
| `src/game/GameRenderer.ts` | Pixi layers (terrain, routes, sites, selection, armies); click → nearest pick |
| `src/game/Camera.ts` | Pan (drag), zoom (wheel/pinch, cursor-anchored), click vs drag, screen↔world |
| `src/game/format.ts` | Durations, player colours, target labels |
| `src/ui/Hud.tsx` | Game overlay: status, economy/shop, cards, log, leaderboard, own armies |
| `src/ui/SelectionPanel.tsx` | Details + send/recall for the selected castle/spot/chest/army |
| `src/ui/JoinScreen.tsx`, `AdminPanel.tsx`, `Panel.tsx` | Join + lobby, admin panel, shared panel/button |
| `vite.config.ts` | Dev proxy `/ws` and `/api` → `localhost:3001` |

## Rules

- **React does not render the map.** `GameRenderer` reads the store via `useGameStore.subscribe`
  and draws imperatively; React only mounts it. Keep per-frame work out of React.
- **Overlay input:** the HUD root is `pointer-events-none`; interactive panels opt in with
  `pointer-events-auto` so the canvas keeps receiving pan/zoom/click.
- **Coordinates:** server positions are in tile units; world pixels = tiles × `map.tileSize`.
  `Camera.screenToWorld` converts canvas-local CSS px to world px.
- **WS / API URL:** same-origin by default; override with `VITE_WS_URL` / `VITE_API_URL`.
- **UI language is German**; code and comments stay English.
