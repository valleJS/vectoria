---
type: Codemap
description: Game rules of the prototype — phases, gameday clock, economy, bases and outposts, land movement, raids, combat, live ticker, chests and cards — and where each rule lives in code.
audience: agent
category: codemap
last_verified: 2026-11-02
load-when: Changing or explaining any game rule, balance number, card, the gameday clock, or combat.
sources: [packages/shared/src/rules.ts, packages/shared/src/entities.ts, apps/server/src/game/]
sources_stamp: fd9732a7f89f9a8ac4d828e11431f2cfb133914f
---

# Game rules (prototype)

Balance numbers live only in `packages/shared/src/rules.ts`; the server enforces them in
`apps/server/src/game/GameState.ts`. Why these choices: [ADR 0002](./adr/0002-prototype-game-rules.md).

## Phases

`registration` → admin "Anmeldung schließen & starten" → `running` → `ended` (a player reaches
`VICTORY_POINTS_TO_WIN`, or the admin ends it; highest VP wins). Joining is only possible during
registration (closed system). The map is generated at start, sized by `mapSizeForPlayers`
(24–96 tiles square). Admin "reset" returns to registration, keeping registrations.

## Map scaling

`mapSizeForPlayers` sets the side to `16 + 8·√players` tiles (24–96), so each player gets less
land as the game grows (≈365 tiles each at 2 players, ≈92 at 100). Travel time is relative to the
map width (`travelMs`: crossing = `CROSS_MAP_HOURS`), so neighbours move closer **in time**,
roughly `10 h / √players`. Measured nearest-castle trips over land: 2 players ≈8 h, 9 ≈4 h,
20 ≈2.4 h, 50 ≈1.4 h. Outposts (0.75/player) and spots (1.5/player) scale with players; chests
(1 per gameday), gathering time and costs do not.

## Game clock

- `clock` = accumulated gameday milliseconds. It advances only Mon–Fri 10–18 in
  `GAME_TIMEZONE` (`GAME_HOURS=weekdays`) or always (`always`, dev), times `TIME_SCALE`.
- All durations (travel, gathering, card effects) are in clock ms, so they pause overnight.
- After downtime the server catches the clock up (`calendar.gameTimeBetween`); only one daily
  payout is granted for missed days.
- **Gameday start**: first game-time tick of a calendar day (weekdays) or every 8 clock-hours
  (always). Then: pending activity becomes active, every player gets 1 of each resource and 3 of
  the active one, and `CHESTS_PER_GAMEDAY` (1) chest spawns (cap = player count).

## Economy

| Thing | Rule |
| ----- | ---- |
| Resources | wood, stone, gold (`Holz`, `Stein`, `Gold`) |
| Base activity | chosen any time; applies at the next gameday start, else yesterday's is kept |
| Troops | 10 for 1 wood + 1 gold; one generic troop type; bought only into the home castle |
| Victory point | 1 wood + 2 stone + 1 gold |
| Spending | only resources stored in the home castle; outpost stock must be carried home first |
| Start | 50 troops, 2 of each resource |
| Gathering | round trip: march to a spot, load `GATHER_DURATION_MS` (1 h), carry `gatherYield(troops)` (10 per 100 troops) back to the base the army left from |

## Bases and outposts

- A player's **bases** are the home castle plus owned outposts. Armies leave from a base
  (`sendArmy.from`, null = home) and return to it; if that outpost was lost meanwhile, they go home.
- **Outposts** (`OUTPOSTS_PER_PLAYER`, min `MIN_OUTPOSTS`) start as empty, unowned **ruins**,
  placed on contested ground between castles (`world.placeOutposts`). Taking one rebuilds it.
  They have no names of their own: `outpostName` shows "Ruine" or "Stützpunkt <owner>". Arriving
  at an own outpost deposits troops and cargo; at a foreign one (or a ruin) it is an assault.
- Moving troops between own bases may carry `cargo` (no capacity limit). Cargo is only allowed
  when the target is an own base.

## Armies

- Movement follows land: A* over the tile grid (8 directions, no corner cutting past water),
  then straightened where a direct line keeps clearance from water (`shared/pathfinding.ts`).
  Travel time is path length; crossing the map width takes `CROSS_MAP_HOURS` (10) gameday hours.
  All sites sit on the largest connected landmass (`world.mainlandTiles`).
- Recall anytime unless already returning: heads home from the current position.
- Redirect (`redirectArmy`): an outbound or gathering army without cargo can get a new target.
- Arriving at a chest: the first army with at least `troopsNeeded` troops takes it and heads
  straight home (see Cards); too few troops return empty-handed. Sending too few is refused.
- The way home is never hidden (stealth is dropped on return); cargo is always visible.
- Everything is visible to everyone. Fog/stealth null out fields in `GameState.armyView`.

## Combat

One rule for castles, outposts and raids (`battleLosses` in `rules.ts`). The attacker wins only
with strictly more strength (home castles: defenders × 1.5 while fortified). Nobody loses more
troops than the other side brought (stops 1-troop harassment).

| Outcome | Attacker loses | Defender loses | Spoils |
| ------- | -------------- | -------------- | ------ |
| Attacker wins | 25 % | 50 % | castle: 50 % of home resources; outpost: ownership + all stock (defending survivors flee home); convoy: all cargo |
| Defender wins | 100 % | 25 % | — |

**Raids**: a returning army carrying resource cargo can be ambushed (chest bearers cannot) by an army sent from a base or
redirected from the field. `planIntercept` finds the earliest point on the convoy's route the
raider reaches no later than the convoy; if the convoy gets home first, the raid is refused.
The raider arrives exactly at the meeting time; if the convoy is gone by then, it returns empty.
VP are never stolen.

## Live ticker

`GameState.addFeed` keeps the last 60 public events (marches, battles, gathering returns, chests,
outposts, gamedays) in `GameView.feed`, written with fog/stealth already applied.

## Chests and cards

- A chest needs `rollChestTroops()` troops to open (`CHEST_TROOPS_MIN`–`MAX`, step 10), shown on
  the map. The army carries it home (`ArmyView.chest`); on arrival `self.chests` counts up.
- The card is rolled only when the player opens the chest (`openChest` → `chestOpened`), so the
  reveal happens when they are online.
- Cards belong to the player, not to a base. One card can be active (`self.activeCard`): an
  instant card takes effect on activation; a march card is armed and goes with the next army
  sent (`sendArmy.useActiveCard`), then is used up.

| Card | Use | Effect |
| ---- | --- | ------ |
| Nebel (`fog`) | on send | others see `?` for troop count |
| Tarnung (`stealth`) | on send | others don't see the target |
| Eilmarsch (`forcedMarch`) | on send | outbound trip takes half as long |
| Bollwerk (`fortify`) | instant | castle defends ×1.5 for one gameday |
