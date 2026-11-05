---
type: Codemap
description: Game rules of the prototype — phases, gameday clock, economy, bases and outposts, land movement, raids, combat, live ticker, chests and cards — and where each rule lives in code.
audience: agent
category: codemap
last_verified: 2026-11-05
load-when: Changing or explaining any game rule, balance number, card, the gameday clock, or combat.
sources: [packages/shared/src/rules.ts, packages/shared/src/entities.ts, apps/server/src/game/]
sources_stamp: f51dcc05052982a82cf9c6329284e5344aadb45c
---

# Game rules (prototype)

Balance numbers live only in `packages/shared/src/rules.ts`; the server enforces them in
`apps/server/src/game/GameState.ts`. Why these choices: [ADR 0002](./adr/0002-prototype-game-rules.md).

## Phases

`registration` → admin "Anmeldung schließen & starten" → `running` → `ended` (a player reaches
`VICTORY_POINTS_TO_WIN`, or the admin ends it; highest VP wins). Joining is only possible during
registration (closed system). Admin tools while running: kick (armies vanish, outposts turn
to ruins keeping their stock) and `swapCastles` (two home castles trade places, everything else
stays with each player; armies heading for either castle re-route from where they stand). The
map is generated at start, sized by `mapSizeForPlayers` (24–96 tiles square). Admin "reset"
returns to registration, keeping registrations.

## Map scaling

`mapSizeForPlayers` sets the side to `16 + 8·√players` tiles (24–96), so each player gets less
land as the game grows (≈365 tiles each at 2 players, ≈92 at 100). Travel time is relative to the
map width (`travelMs`: crossing = `CROSS_MAP_HOURS`), so neighbours move closer **in time**,
roughly `10 h / √players`. Measured nearest-castle trips over land: 2 players ≈8 h, 9 ≈4 h,
20 ≈2.4 h, 50 ≈1.4 h. Outposts (0.75/player) and spots (up to 1.5/player) scale with players; chests
(3 per gameday), gathering time and costs do not.

## Game clock

- `clock` = accumulated gameday milliseconds. It advances only Mon–Fri 10–18 in
  `GAME_TIMEZONE` (`GAME_HOURS=weekdays`) or always (`always`, dev), times `TIME_SCALE`.
- All durations (travel, gathering, card effects) are in clock ms, so they pause overnight.
- After downtime the server catches the clock up (`calendar.gameTimeBetween`); only one daily
  payout is granted for missed days.
- **Gameday start**: first game-time tick of a calendar day (weekdays) or every 8 clock-hours
  (always). Then: the **night caravan** moves every owned outpost's whole stock into the home
  castle (instant, troop-free, not raidable — the clock is frozen at night), pending activity
  becomes active, every player gets 1 of each resource and 3 of the active one plus
  `OUTPOST_DAILY_INCOME` (1) of each per owned outpost, all straight into the home castle, and `CHESTS_PER_GAMEDAY` (3) chests spawn, up to `maxChestsOnMap` on the map
  (one per player, at least `CHESTS_PER_GAMEDAY`).

## Economy

| Thing | Rule |
| ----- | ---- |
| Resources | wood, stone, gold (`Holz`, `Stein`, `Gold`) |
| Base activity | chosen any time; applies at the next gameday start, else yesterday's is kept |
| Troops | 10 for 1 wood + 1 gold; one generic troop type; bought only into the home castle |
| Victory point | rising: `victoryPointCost(owned)` = base 1 wood + 2 stone + 1 gold, each further VP +1 of one resource in turn (stone, wood, gold); the 10th costs 4 wood + 5 stone + 4 gold, all 10 together 85 resources |
| Spending | only resources stored in the home castle; outpost stock reaches it only with the night caravan (gameday start) |
| Start | 50 troops, 2 of each resource |
| Spot layout | `spots.placeBalancedSpots`: for every castle, real walk to nearest wood + stone + gold sums to about the same (spread ≤ `SPOT_BALANCE_TOLERANCE_HOURS`), one of the three ≥ `SPOT_FAR_HOURS`, no spot within `SPOT_NEAR_HOURS` of any castle (hard rule: candidates pre-filtered on the grid, heavy penalty on real routes, polish never breaks it, a layout keeping it always wins); the count is a cap — each spot costs a little and same-resource spots within `SAME_GAP` are penalised, so only spots that help the balance stay (≥ 1 per resource); annealing on `distanceField`, polish on `findPath` routes. `relayoutSpots` (once per running game): marchers keep start + depart time and re-route to the nearest same-resource spot; gatherers move there with their loading time left. `moveGatherersToNearestSpot` (once, `GATHERER_FIX` 1): gatherers move on to the same-resource spot nearest their home castle over land, loading time kept, and return to the home castle (`baseId` null) |
| Gathering | round trip: march to a spot, load `GATHER_DURATION_MS` (1 h), carry `gatherYield(troops)` (10 per 100 troops) back to the base the army left from, at `LOADED_SPEED` (0.75×) |

## Bases and outposts

- A player's **bases** are the home castle plus owned outposts. Armies leave from a base
  (`sendArmy.from`, null = home) and return to it. When an outpost falls, `recallFromLostOutpost`
  turns the former owner's armies heading there (returners and transfers, cargo kept) home on the
  spot; armies elsewhere that left from it return home later.
- **Outposts** (`OUTPOSTS_PER_PLAYER`, min `MIN_OUTPOSTS`) start as empty, unowned **ruins**,
  placed on contested ground between castles (`world.placeOutposts`). Taking one rebuilds it.
  They have no names of their own: `outpostName` shows "Ruine" or "Stützpunkt <owner>". Arriving
  at an own outpost deposits troops and cargo; at a foreign one (or a ruin) it is an assault.
- Moving troops between own bases never carries `cargo`: `sendArmy` refuses any cargo, so stock
  is not moved between bases by day (troops withdrawn from an outpost leave it behind). Gatherers
  still deposit their yield at the base they left from.

## Armies

- Movement follows land: A* over the tile grid (8 directions, no corner cutting past water),
  then straightened where a direct line keeps clearance from water (`shared/pathfinding.ts`).
  Travel time is path length; crossing the map width takes `CROSS_MAP_HOURS` (10) gameday hours.
  Map generation leaves exactly one 4-connected landmass (`mapgen.joinLand`: islands under
  12 tiles sink, larger ones get a 2-tile land bridge), so every site is reachable on foot.
- Recall anytime unless already returning: heads home from the current position.
- Redirect (`redirectArmy`): any army without resource cargo or a chest can get a new target — outbound, gathering or on its way home.
- Arriving at a chest: the first army with at least `troopsNeeded` troops takes it and heads
  straight home (see Cards); too few troops return empty-handed. Sending too few is refused.
- The way home is never hidden (stealth is dropped on return); cargo is always visible.
- Heading home with resource cargo is slower: `startReturn` passes `LOADED_SPEED` (0.75)
  to `travelMs`. Chest bearers and empty armies march at normal speed; a convoy robbed of all
  cargo is re-timed from where it stands and walks on at normal speed.
- Everything is visible to everyone. Fog/stealth null out fields in `GameState.armyView`.

## Combat

One rule for castles, outposts and raids (`battleLosses` in `rules.ts`). The attacker wins only
with strictly more strength (home castles: defenders × 1.5 while fortified). Nobody loses more
troops than the other side brought (stops 1-troop harassment).

| Outcome | Attacker loses | Defender loses | Spoils |
| ------- | -------------- | -------------- | ------ |
| Attacker wins | 25 % | 50 % | castle: 50 % of home resources + a chest (conjured, not taken from the defender); outpost: ownership + all stock (defending survivors flee home); convoy: all cargo |
| Defender wins | 100 % | 25 % | — |

**Castle fall** (`GameState.rout`): the defender's armies all turn for the home castle on the spot
(cargo kept), and every outpost is given up: it turns back into an unowned ruin, its garrison
marching home with the whole stock (no garrison → the stock stays in the ruin). `PlayerRecord.routed` (public as `PlayerPublic.routed`) then blocks every player
command in `requirePlaying` until the player's last army is gone (`removeArmy` lifts it). Nobody
in the field → no lockout. The client greys out every action (`ui/Routed.tsx` `Locked`, `inert`)
and shows a "Handlungsunfähig" stamp in the top bar.

**Raids**: any marching army carrying resource cargo (`isRaidable` in `shared/entities.ts`: home
from a spot or a win; base-to-base transfers no longer exist) can be ambushed — except while its owner
is routed (all their armies are immune; raids already underway go empty). A robbed army walks
on to its target at normal speed. Raiders are sent from a base or
redirected from the field. `planIntercept` finds the earliest point on the convoy's route the
raider reaches no later than the convoy; if the convoy arrives first, the raid is refused.
The raider arrives exactly at the meeting time; if the convoy is gone by then, it returns empty.
A convoy cannot raid in turn: returning armies and armies with cargo cannot be redirected
(`redirectArmy`), and `sendArmy` takes no cargo at all. VP are never stolen,
and neither are chests: a chest bearer with resource cargo can be raided for the cargo only, and
always keeps at least one troop (`raid`), so the chest always gets home.

## Live ticker

`GameState.addFeed` keeps the last 60 public events (marches, battles, gathering returns, chests,
outposts, gamedays) in `GameView.feed`, written with fog/stealth already applied.

## Chests and cards

- A chest needs `rollChestTroops()` troops to open (`CHEST_TROOPS_MIN`–`MAX`, step 10), shown on
  the map. The army carries it home (`ArmyView.chest`); on arrival `self.chests` counts up.
  Storming a home castle also puts a chest on the winning army.
- The card is rolled only when the player opens the chest (`openChest` → `chestOpened`), so the
  reveal happens when they are online. `drawCard` weighs by `CardInfo.weight` (Hofumzug 0.4,
  all others 1; `cardChance` for the handbook).
- Cards belong to the player, not to a base. One card can be active (`self.activeCard`): an
  instant card takes effect on activation; a march card is armed and goes with the next army
  sent (`sendArmy.useActiveCard`), then is used up. Instant cards with a `CardInfo.target`
  (`ownOutpost` / `player`) need `activateCard.target`; it is checked before the card is spent
  (`GameState.instantCard`).

| Card | Use | Effect |
| ---- | --- | ------ |
| Nebel (`fog`) | on send | others see `?` for troop count |
| Tarnung (`stealth`) | on send | others don't see the target |
| Eilmarsch (`forcedMarch`) | on send | outbound trip takes half as long |
| Bollwerk (`fortify`) | instant | castle defends ×1.5 for one gameday |
| Seeweg (`sea`) | on send | outbound path is the straight line `[from, to]`, over water too (`ArmyView.sea`); home, redirects and reroutes go by land again; refused for raids, and armies on water cannot be intercepted (no land path to the meeting point) |
| Füllhorn (`harvest`) | instant | `harvestDays += HARVEST_GAMEDAYS` (3): each gameday start pays `HARVEST_BONUS` (+1) of every resource extra |
| Schuhe klauen (`stealShoes`) | instant, target player | victim's `barefootUntil` = clock + `BAREFOOT_DURATION_MS` (one gameday); every leg the victim starts meanwhile (send, redirect, return, reroute, raid intercept) runs at `BAREFOOT_SPEED` (0.75, stacks with `LOADED_SPEED`); legs already under way keep their pace. `PlayerPublic.barefoot` |
| Hofumzug (`relocate`) | instant, target own outpost | home castle and that outpost swap positions; troops and stores stay with their base; armies heading for either re-route (`rerouteToMoved`, shared with the admin castle swap) |

## Rule changes notice

Every change that alters how a running game plays (balance numbers, rules — not UI) gets an entry
at the top of `RULE_CHANGES` in `apps/client/src/ui/RuleChanges.tsx`: a new stable `id`, the go-live
date, a title and a short German text with numbers pulled from `shared/rules.ts`. Players see it
once as a pop-up and later under "Neuerungen".
