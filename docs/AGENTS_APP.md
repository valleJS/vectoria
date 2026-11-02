---
type: Codemap
description: Path map for apps/client — React shell, PixiJS cartography renderer and camera, zustand store, WebSocket client, parchment-themed Tailwind HUD.
audience: agent
category: codemap
last_verified: 2026-11-01
load-when: Any change under apps/client (rendering, pan/zoom/click input, HUD/UI, client state, client networking).
sources: [apps/client/src/, apps/client/vite.config.ts, apps/client/package.json]
sources_stamp: fd9732a7f89f9a8ac4d828e11431f2cfb133914f
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
| `src/net/api.ts` | HTTP client for email auth, lobby, admin |
| `src/net/loginLink.ts` | Reads (and strips) `?email=&code=` from an emailed login link |
| `src/game/GameCanvas.tsx` | React mount point for Pixi |
| `src/game/GameRenderer.ts` | Pixi layers (terrain, marching land routes, castles/outposts/spots/twinkling chests, attack alerts, selection, walking armies with cargo markers, raid crosses); click → nearest pick |
| `src/game/terrain.ts` | Static map: tile fields → flat vector regions in old-map tones (sea, shallows, land, forest, rock), inked coast, detail sprites, frame |
| `src/game/fields.ts` | Field maths: blur, value noise, distance transform, marching-squares contours, Chaikin smoothing |
| `src/game/glyphs.ts` | Vector fallbacks (army banner, castle) for colours without art; dashed line/circle helpers |
| `src/art/svg.ts` | All illustrated art as SVG source: resources, spot medallions, trees, mountains, castles, soldiers (armies), chest + sparkle, alarm badge, ship, compass |
| `src/art/textures.ts` | Rasterises the SVG art once into Pixi textures (`loadMapArt`): decoration sepia-toned, pieces with a parchment cut-out edge |
| `src/game/palette.ts` | Pixi colours (ink, parchment, seal, sea, resources), heraldic player palette, `sepia()` backdrop toning |
| `src/game/Camera.ts` | Pan (drag), zoom (wheel/pinch, cursor-anchored), click vs drag, screen↔world, fit with HUD insets |
| `src/game/format.ts` | Durations, player colours (viewer red, others by join order), target labels |
| `src/ui/Hud.tsx` | Game overlay: slim top bar (clock, connection), live ticker top-left, tabbed sidebar (selection, armies, ranking, chronicle) and the player's realm box (resources, troops, VP, outposts, activity, shop, cards, logout) bottom-right |
| `src/ui/icons.tsx` | HUD icons: resources from `art/svg.ts`, map art as `<img>` (castle, soldiers, chest, alarm), small glyphs (star, sun, cards) |
| `src/ui/SelectionPanel.tsx` | Sidebar content: details + send (base picker, cargo, ETA over land) / recall / raid (redirect or send, meeting point) for the selected object |
| `src/ui/JoinScreen.tsx`, `AdminPanel.tsx`, `Panel.tsx` | Email-code login/registration + lobby, admin panel (incl. login emails), shared parchment panel/button |
| `src/index.css` | Tailwind theme tokens (`parchment`, `ink`, `seal`, `sea`, …) and serif font |
| `vite.config.ts` | Dev proxy `/ws` and `/api` → `localhost:3001` |

## Rules

- **React does not render the map.** `GameRenderer` reads the store via `useGameStore.subscribe`
  and draws imperatively; React only mounts it. Keep per-frame work out of React.
- **Overlay input:** the HUD root is `pointer-events-none`; interactive panels opt in with
  `pointer-events-auto` so the canvas keeps receiving pan/zoom/click.
- **Coordinates:** server positions are in tile units; world pixels = tiles × `map.tileSize`.
  `Camera.screenToWorld` converts canvas-local CSS px to world px.
- **WS / API URL:** same-origin by default; override with `VITE_WS_URL` / `VITE_API_URL`.
- **Cartography style:** map and HUD share one palette — `src/game/palette.ts` for Pixi, the
  `@theme` tokens in `src/index.css` for Tailwind. Change both together.
- **One art source:** illustrations live as SVG in `src/art/svg.ts`. The map uses them as
  textures rasterised at 3× (`loadMapArt`, awaited before the renderer starts); the HUD uses the
  same markup as `<img>` data URLs. Map sizes are in glyph units (`u = tileSize / 24`).
- **Old map, coloured pieces:** the backdrop is parchment and brown — terrain fills in
  `terrain.ts` (parchment land, brown sea = `SEA`), decoration art (trees, peaks, flowers, ships)
  toned onto the sepia ramp at raster time (`rasterise(…, { sepia: true })`, `palette.ts`
  `sepia()`) and drawn with thin tonal lines. Only pieces players act on (castles, outposts,
  spots, chests, armies, routes, the alarm badge) are in colour, with INK outlines and a parchment
  cut-out edge (`rasterise(…, { outline: true })`). Keep new art on the right side.
- **Pieces stay readable:** zoomed out, sites and armies grow up to `PIECE_MAX_SCALE` so they
  never shrink below their size at `PIECE_ZOOM`. Every site is its own container in `siteLayer`.
- **One label style:** `nameplate()` — italic ink on parchment with ribbon tails in the owner's
  colour (none for neutral info such as outpost stock); proportions follow the font size.
  Gold ground halos mean treasure: chests and convoys carrying resources.
- **Motion means action:** route dashes march toward their target, marching soldiers bob, and
  castles/outposts show alerts (`drawAlerts`): swords badge + pulsing ring while an enemy army is
  outbound to them, smoke + shock waves for `RECENT_ATTACK_MS` of game clock after an assault
  (`attackedAt` from the server). All of it runs in `animate`; nothing redraws via React.
- **Terrain is drawn once per map** (`buildTerrain`): the tile grid is resampled into lightly
  blurred fields whose iso-lines follow tile edges with rounded corners; regions are flat vector
  fills (no gradients or noise). Decoration is hashed from positions, so it is stable across
  redraws and clients. The terrain is rebuilt when castle/spot positions change: castles get
  open ground and spots get land (`Clearing`), so no site stands in water; details overlapping
  castles, spots and chests are hidden (`Terrain.clearAround`, by sprite bounds).
- **UI language is German**; code and comments stay English.
