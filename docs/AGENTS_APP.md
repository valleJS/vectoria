---
type: Codemap
description: Path map for apps/client — React shell, PixiJS cartography renderer and camera, zustand store, WebSocket client, parchment-themed shadcn/ui + Tailwind HUD, design tokens and design sheet.
audience: agent
category: codemap
last_verified: 2026-11-04
load-when: Any change under apps/client (rendering, pan/zoom/click input, HUD/UI, client state, client networking).
sources: [apps/client/src/, apps/client/vite.config.ts, apps/client/package.json, apps/client/components.json]
sources_stamp: 5a3856c7a1cb5d9827fdc5840494ee9bc16932c3
---

# Client codemap (`apps/client`)

React 19 + Vite + TypeScript, PixiJS 8 for the map, Tailwind 4 + shadcn/ui (Radix) for the
overlay, zustand for state. Cross-cutting context: [AGENTS_ARCHITECTURE.md](./AGENTS_ARCHITECTURE.md).

## Paths

| Path | Owns |
| ---- | ---- |
| `src/App.tsx` | Routing: `/?design` → design sheet; `/?admin` → admin panel; no token → join; registration → lobby; else game |
| `src/state/store.ts` | zustand store — token, `GameView`, map, selection, toast |
| `src/net/socket.ts` | `GameSocket`: token connect, reconnect w/ backoff, ping/RTT, writes to the store; reloads the page once when the server protocol version differs (after a deploy) |
| `src/net/api.ts` | HTTP client for email auth, lobby, admin |
| `src/net/loginLink.ts` | Reads (and strips) `?email=&code=` from an emailed login link |
| `src/game/GameCanvas.tsx` | React mount point for Pixi |
| `src/game/GameRenderer.ts` | Pixi layers (terrain, marching land routes, castles in the owner's colour + style, outposts as watchtowers / ruins, resource deposits, twinkling chests with troop requirement, attack alerts, selection, walking armies with cargo/chest tags, raid crosses). Armies within `STACK_RADIUS_TILES` fan out side by side (`armyOffsets`, eased in `animate`); an army gathering at a spot is drawn as its claim flag planted at the deposit's right front. Click → nearest pick at the drawn position (fan-out, flag); clicking the same spot again cycles through everything stacked there. Coloured pieces come from the lazy `art.pieces` cache; `onReady` redraws once a new colour is rasterised |
| `src/game/terrain.ts` | Static map: tile fields → flat vector regions in old-map tones (sea, land, forest, rock); the shallow band is a wide stroke along the coastline under the land fill (no polygon holes), soft brown coast line; detail sprites (trees; rocks: crags likelier and bigger towards a rock area's interior, loose boulders along its rim and on nearby meadow; grass), cogs on open sea and small boats on lakes/straits (hash-ranked, spaced, count scales with map area), frame |
| `src/game/fields.ts` | Field maths: blur, value noise, distance transform, marching-squares contours, Chaikin smoothing |
| `src/game/glyphs.ts` | Dashed line/circle helpers (routes, rings) |
| `src/art/svg.ts` | All illustrated art as SVG source, one drawing language (light top-left, ground shadow, `facets` for rocks/chunks): resource icons (log, stone chunk, gold nugget), deposits (woodpile, quarry, gold mine), trees (conifer tiers painted bottom-up), rocks + boulders, grass tuft, cog + boat, castles (3 styles, `CASTLE_STYLE_NAMES`), outpost watchtower + ruin, soldiers, claim flag, front-view chest (`chestParts` shared with the opening overlay) + sparkle, alarm badge, smoke puff + flame, compass |
| `src/art/textures.ts` | Rasterises the SVG art into Pixi textures (`loadMapArt`, `artCanvas`): decoration sepia-toned, pieces with a parchment cut-out edge; coloured pieces (castle per style, outpost, soldiers, flag) through a lazy per-colour cache (`PieceCache`), preloaded for the palette |
| `src/theme/tokens.ts` | Design tokens — the one colour source: ink/parchment ramp, meaning colours, material ramps (masonry, timber, granite, gold), terrain, heraldry; `CSS_TOKENS` lists what `index.css` mirrors |
| `src/game/palette.ts` | The tokens as Pixi numbers, `sepia()` backdrop toning |
| `src/game/Camera.ts` | Pan (drag), zoom (wheel/pinch, cursor-anchored), click vs drag, screen↔world, fit with HUD insets; optional focus (zoom in, centre on a point, clamped to the map edges) used once per map to start on the own castle (`GameRenderer.frame`, `START_ZOOM_IN`) |
| `src/game/format.ts` | Durations, player heraldry (`playerHeraldry`: viewer red, others by join order; castle style by global join order, shifted per palette lap — 36 distinct players), target and outpost labels, own bases (`ownBases`), card colours |
| `src/ui/Hud.tsx` | Game overlay. Wide (≥ 900 px): slim top bar (clock, connection), live ticker top-left, tabbed sidebar (selection, armies, ranking, chronicle) and the player's realm box bottom-right: player-wide part (VP, chests to open, activity, cards) above one section per base ("Basis" with shop, then outposts; folds once there are 2+). Compact (phones, `CompactHud`): top bar with handbook button, full-screen map, bottom tab bar (Ticker, Auswahl, Züge, Rang + Chronik, Reich) opening one panel as a sheet; a map selection opens Auswahl |
| `src/ui/layout.ts` | Compact breakpoint (`COMPACT_BELOW` = 900) and per-layout HUD insets, shared by the HUD and the map fit |
| `src/ui/RuleChanges.tsx` | "Neuerungen": list of game-changing rule changes (`RULE_CHANGES`, newest first) in a small dialog; scroll button beside the handbook (phones: top bar) with a count of unseen entries; opens itself once when unseen ones exist. Seen ids in `localStorage` (`vectoria.ruleChangesSeen`) via the store (`ruleChanges`, `seenRuleChanges`) |
| `src/ui/ChestOpening.tsx` | Chest-opening overlay: wobbling chest, shake, lid pops, card flips in; opens itself when the store sees new chests at home |
| `src/ui/Handbook.tsx` | Compass + book bottom-left (phones: book button in the top bar); open state in the store (`handbook`). `HandbookInvite` opens the same book from the join screen and lobby (local open state; VP target from `LobbyInfo` / view). Two-page handbook (contents left, chapter right, ←/→ keys; phones show one page, contents via "☰ Inhalt") on all mechanics, numbers pulled from `shared/rules.ts`, plus the card catalog |
| `src/ui/CardFace.tsx` | Large trading-card face and the card profile modal (activate / disarm) |
| `src/ui/icons.tsx` | HUD icons: resources from `art/svg.ts`, map art as `<img>` (castle, soldiers, chest, alarm), small glyphs (star, sun, cards), `OnlineDot` (green presence dot in ranking and admin list) |
| `src/ui/SelectionPanel.tsx` | Sidebar content: details + send (base picker, cargo, ETA over land; `FieldRedirect` lists own cargo-free field armies to re-route to this target) / recall / raid (redirect or send, meeting point) for the selected object |
| `src/ui/JoinScreen.tsx`, `AdminPanel.tsx` | Email-code login/registration + lobby, admin panel (incl. login emails) |
| `src/ui/Panel.tsx` | Game vocabulary over shadcn/ui: `Panel` (Card), `SectionLabel`, `Button` (`default`/`primary`/`danger`/`selected`/`ghost`/`outline`/`link`/`plain`), `Tip` (Tooltip) |
| `src/components/ui/` | shadcn/ui components (button incl. `plain` variant for illustrated buttons, card, tabs, dialog incl. `bare` content, badge incl. `plate`, input, label, select, slider, checkbox, collapsible, toggle-group, progress, separator, tooltip), restyled for parchment; `components.json` configures the CLI (`npx shadcn add …`, alias `@/`) |
| `src/lib/utils.ts` | `cn()` class merge |
| `src/ui/DesignSheet.tsx` | `/?design`: every token (with CSS drift check), castle styles × colours, outposts, resources, troops, treasure, smoke, scenery and the UI components |
| `src/index.css` | Tailwind theme tokens (mirror of `theme/tokens.ts`), shadcn semantic variables mapped onto them, serif font, chest animations |
| `vite.config.ts` | Dev proxy `/ws` and `/api` → `localhost:3001`; alias `@/` → `src` |

## Rules

- **React does not render the map.** `GameRenderer` reads the store via `useGameStore.subscribe`
  and draws imperatively; React only mounts it. Keep per-frame work out of React.
- **Overlay input:** the HUD root is `pointer-events-none`; interactive panels opt in with
  `pointer-events-auto` so the canvas keeps receiving pan/zoom/click.
- **Coordinates:** server positions are in tile units; world pixels = tiles × `map.tileSize`.
  `Camera.screenToWorld` converts canvas-local CSS px to world px.
- **WS / API URL:** same-origin by default; override with `VITE_WS_URL` / `VITE_API_URL`.
- **Cartography style:** map and HUD share one palette — `src/theme/tokens.ts`. Pixi reads it via
  `palette.ts`, the art imports it directly, and `index.css` mirrors the UI subset; change the
  token and its CSS twin together (the design sheet flags drift).
- **HUD components:** every control is a shadcn/ui component from `src/components/ui` — no raw
  `<button>`, `<input>`, `<select>` or hand-rolled dialogs, badges or progress bars. Illustrated
  click targets (compass, book, chest, cards) use `Button variant="plain"`, hints use `Tip`
  instead of `title`. New primitives via `npx shadcn add …` in `apps/client`, then restyle to the
  parchment tokens.
- **Design sheet:** new or changed art goes on `/?design` too, so the drawing language stays
  reviewable in one place.
- **One art source:** illustrations live as SVG in `src/art/svg.ts`. The map uses them as
  textures rasterised at 3× (`loadMapArt`, awaited before the renderer starts); the HUD uses the
  same markup as `<img>` data URLs. Map sizes are in glyph units (`u = tileSize / 24`).
- **Old map, coloured pieces:** the backdrop is parchment and brown — terrain fills in
  `terrain.ts` (parchment land, brown sea = `SEA`), decoration art (trees, rocks, grass, ships)
  toned onto the sepia ramp at raster time (`rasterise(…, { sepia: true })`, `palette.ts`
  `sepia()`) and drawn with thin tonal lines. Only pieces players act on (castles, outposts,
  spots, chests, armies, routes, the alarm badge) are in colour, with INK outlines and a parchment
  cut-out edge (`rasterise(…, { outline: true })`). Keep new art on the right side.
- **Pieces stay readable:** zoomed out, sites and armies grow up to `PIECE_MAX_SCALE` so they
  never shrink below their size at `PIECE_ZOOM`. Every site is its own container in `siteLayer`.
- **Map size scales with players:** never a fixed image — tiles are 32 world px and all art is
  sized per tile, so a bigger map is simply more world. `Camera.fit` zooms out to show it all
  (min zoom 0.25); past ~20 players the piece scale cap is reached and sites get small and
  crowded on screen.
- **One label style:** `nameplate()` — italic ink on parchment with ribbon tails in the owner's
  colour (none for neutral info such as outpost stock); proportions follow the font size.
  No coloured ground halos: treasure reads from the art (chest, cargo tag, gold route).
- **Motion means action:** route dashes march toward their target, marching soldiers bob, and
  castles/outposts show alerts (`drawAlerts`): swords badge + pulsing ring while an enemy army is
  outbound to them, rising smoke puffs, tower flames and shock waves for `RECENT_ATTACK_MS` of game
  clock after an assault
  (`attackedAt` from the server). All of it runs in `animate`; nothing redraws via React.
- **Terrain is drawn once per map** (`buildTerrain`): the tile grid is resampled into lightly
  blurred fields whose iso-lines follow tile edges with rounded corners; regions are flat vector
  fills (no gradients or noise). Decoration is hashed from positions, so it is stable across
  redraws and clients. The terrain is rebuilt when castle/spot positions change: castles get
  open ground and spots get land (`Clearing`), so no site stands in water; details overlapping
  castles, spots and chests are hidden (`Terrain.clearAround`, by sprite bounds).
- **UI language is German**; code and comments stay English.
