---
type: Codemap
description: Game rules of the prototype — phases, gameday clock, economy, bases and outposts, land movement, raids, combat, live ticker, chests and cards — and where each rule lives in code.
audience: agent
category: codemap
last_verified: 2026-11-10
load-when: Changing or explaining any game rule, balance number, card, the gameday clock, or combat.
sources: [packages/shared/src/rules.ts, packages/shared/src/entities.ts, apps/server/src/game/]
sources_stamp: 8891568e75933b83635ff9c7f04e781c3fce955d
---

# Game rules (prototype)

Balance numbers live only in `packages/shared/src/rules.ts`; the server enforces them in
`apps/server/src/game/GameState.ts`. Why these choices: [ADR 0002](./adr/0002-prototype-game-rules.md).

## Phases

`registration` → admin "Anmeldung schließen & starten" → `running` → `ended` (a player reaches
`VICTORY_POINTS_TO_WIN`, or the admin ends it; highest VP wins). Joining is only possible during
registration (closed system). Admin tools: rename (`rename`, same name rules as registration) and
`setEmail` per player, `grant` / `grantTroops` / `grantTrophies`, break days (`setBreakDay`, see
Game clock), a purely cosmetic castle decoration seen by everyone (`setCastleDecoration`,
`PlayerPublic.castleDecoration`, `'penis'` (over the castle, sways) or `'crown'` (on the middle tower at `CASTLE_CROWNS[style]`, glows at night), one at a time; until the admin removes it); while running also kick (armies vanish, outposts turn
to ruins keeping their stock) and `swapCastles` (two home castles trade places, everything else
stays with each player; armies returning home move along with their castle and keep their arrival time;
armies that set out from either castle keep target and progress (as a share of the way) but
start from its new place; other attackers re-route from where they stand), and the map editor:
`place` / `move` / `remove` chests, empty ruins and resource spots / the trader on free mainland
tiles off the outer ring (owned outposts can only be moved); armies marching to a moved piece
re-route from where they stand, gatherers at a moved spot finish in place; armies heading for a
removed piece turn home on arrival (a removed spot's gatherers come home empty). The
map is generated at start, sized by `mapSizeForPlayers` (24–96 tiles square). Admin "reset"
returns to registration, keeping registrations.

## Map scaling

`mapSizeForPlayers` sets the side to `16 + 8·√players` tiles (24–96), so each player gets less
land as the game grows (≈365 tiles each at 2 players, ≈92 at 100). Travel time is relative to the
map width (`travelMs`: crossing = `CROSS_MAP_HOURS`), so neighbours move closer **in time**,
roughly `10 h / √players`. Measured nearest-castle trips over land: 2 players ≈8 h, 9 ≈4 h,
20 ≈2.4 h, 50 ≈1.4 h. Outposts (0.75/player) scale with players, spots with land area (no land farther than `SPOT_HOLE_HOURS` from a spot, castle or outpost: ≈ 17–38 spots for 2–20 players); chests
(3 per gameday), gathering time and costs do not.

## Game clock

- `clock` = accumulated gameday milliseconds. It advances only Mon–Fri 10–18 in
  `GAME_TIMEZONE` (`GAME_HOURS=weekdays`) or always (`always`, dev), times `TIME_SCALE`.
- **Break days** (`SavedGame.breakDays`, admin `setBreakDay`, YYYY-MM-DD in `GAME_TIMEZONE`):
  `shared/calendar.isGameTime` treats them like a weekend day — no clock, no gameday start; catch-up and
  the caravan's `arrivesAt` skip them too. `ClockState.breakDays` / `breakToday` reach the client.
- All durations (travel, gathering, card effects) are in clock ms, so they pause overnight.
- After downtime the server catches the clock up (`shared/calendar.gameTimeBetween`); only one daily
  payout is granted for missed days.
- **Gameday start**: first game-time tick of a calendar day (weekdays) or every 8 clock-hours
  (always). Then: the night caravan arrives (see below), pending activity
  becomes active, every player gets 1 of each resource and 3 of the active one plus
  `outpostIncome(level)` per owned outpost (see Bases and outposts), all straight into the home castle, then troop upkeep is paid and the troop snapshot taken (see Economy), and `CHESTS_PER_GAMEDAY` (3) chests spawn, up to `maxChestsOnMap` on the map
  (one per player, at least `CHESTS_PER_GAMEDAY`).

- **Night caravan** (`sendCaravans`): once per gameday, on the first tick outside game hours
  (18:00, not while paused), every owned outpost's whole stock moves into `PlayerRecord.caravan`
  (`SelfState.caravan`; troop-free, neither spendable nor raidable/plunderable). `startGameday`
  adds it to the home castle; it also sends a caravan first if none left yet for the ending day
  (`caravanDay`; `always` mode, or the server was down over the night). `PlayerRecord.caravanTrip`
  (`PlayerPublic.caravanTrip`) keeps one wagon per outpost with stock (`from`, `load`) plus real
  `departedAt` / `arrivesAt` (`shared/calendar.nextGameTime`). It is public like outpost stock: every
  player's map shows every caravan rolling home, load included.

## Economy

| Thing | Rule |
| ----- | ---- |
| Resources | wood, stone, gold (`Holz`, `Stein`, `Gold`) |
| Base activity | chosen any time; applies at the next gameday start, else yesterday's is kept |
| Troops | 10 for 1 wood + 1 gold; one generic troop type; bought only into the home castle, ready after `TROOP_PRODUCTION_MS` (1 h game clock): `buy` queues a `TroopOrder` in `PlayerRecord.troopOrders` (a purchase within `TROOP_ORDER_MERGE_MS` (30 s) of the newest order joins it and keeps its ready time), `advance` finishes it in time order with army arrivals (`nextTroopOrder` / `finishTroopOrders`), so troops ready before an assault lands defend. In production they neither defend nor march but count for upkeep and the VP troop factor (`ownedTroops`). Public as `PlayerPublic.troopsInProduction` (null under Nebel like `homeTroops`; nameplate `name · troops (in production)`), own orders with ready times as `SelfState.troopOrders` (castle panel) |
| Upkeep | anti-snowball: at each gameday start, after the income, `payUpkeep` charges `troopUpkeep(owned)` = ⌊`UPKEEP_FACTOR` (1) × (troops / 100)²⌋ `UPKEEP_RESOURCE` (stone) for every troop owned (castle, production, own outposts and all own armies, `ownedTroops`; minus the outposts' relief): 100 → 1, 200 → 4, 300 → 9, 500 → 25. Each missing stone makes `UPKEEP_DESERTERS_PER_UNIT` (10) troops desert from the home castle (a short last batch still settles one stone); what that cannot cover carries over as `PlayerRecord.upkeepDebt` (`SelfState.upkeepDebt`) and is due again, on top, at the next gameday start; `buy` adds the debt to the stone price of any purchase (troops or VP) and clears it, so nothing can be bought while it stands — troops sent away over night do not dodge the upkeep. Grace: a game already running when upkeep came in gets `SavedGame.upkeepFrom` = gameday + 2 on load, so the next gameday start only logs a warning with the amount; new games set it to 0. Preview: `SelfState.upkeepNext` {due, stone, grace} mirrors the next gameday start (outposts a day older, debt, caravan + outpost stock + income; gatherers out not counted), shown in the realm box and the castle shop, plus the debt |
| Victory point | rising: `victoryPointCost(owned)` = the n-th VP costs n of each resource (1/1/1, 2/2/2, …), before the troop factor; every `TROPHY_VP_INTERVAL`-th (4th) VP needs trophies, which are not spent (`victoryPointTrophiesNeeded`: 4th 1, 8th 3, 12th 6, … = 1+…+k); at most `VICTORY_POINTS_PER_GAMEDAY` (3) per gameday, counted in `PlayerRecord.victoryPointsBought` and shown as `SelfState.victoryPointsToday`. **Troop factor** (anti-snowball): the price is `scaledVictoryPointCost` = each resource × `victoryPointTroopFactor` = (Ø troops / `VP_TROOP_REFERENCE` 400) ^ `VP_TROOP_EXPONENT` 0.35, at least `VP_TROOP_FACTOR_MIN` 0.5, rounded, ≥ 1 each (all three stay equal). Ø troops = `averageTroops` of `PlayerRecord.troopSnapshots`: `ownedTroops` recorded at each gameday start after upkeep, last `VP_TROOP_SNAPSHOTS` (3) — so the price is fixed for the day and losing troops right before buying barely helps; no snapshots yet (older saves) → factor 1. Sent as `SelfState.victoryPointFactor` / `troopAverage`. All 12 VP (resources): 50 troops 126, 100 → 144, 200 → 183, 300 → 213, 500 → 252, 800 → 297 (factor 1: 234) |
| Trophies | a public reputation: `PlayerRecord.trophies` (`PlayerPublic.trophies`, shown in the leaderboard), never spent; +1 per win over another player (`awardTrophy`): a raid, an owned outpost taken (not a ruin), a castle stormed; a won duo gives each participant one (not for a ruin). Each outpost pays a player only once (`awardOutpostTrophy`, ids in `PlayerRecord.outpostTrophies`), solo or duo, so an outpost passed back and forth farms nothing. Booked straight into the account, never carried, never lost |
| Spending | only resources stored in the home castle; outpost stock reaches it only with the night caravan (leaves 18:00, arrives at the next gameday start) |
| Start | 50 troops, 2 of each resource |
| Spot layout | `spots.placeBalancedSpots` over the four `SPOT_KINDS`. Hard rules (per castle, nearest spot of each kind, real routes): every spot ≥ `SPOT_NEAR_HOURS` (1 h) from every castle; **exactly one** kind `SPOT_FAR_HOURS`–`SPOT_MAX_HOURS` (2–4 h) away and it is one of `SPOT_FAR_KINDS` (wood/gold), the other three < 2 h; spots ≥ `SPOT_GAP_HOURS` (1 h, straight line) apart, same kind ≥ `SPOT_SAME_GAP_HOURS` (2 h); no inner-land tile farther than `SPOT_HOLE_HOURS` (1.5 h, grid walk) from a spot, castle or outpost. Soft: totals within `SPOT_BALANCE_TOLERANCE_HOURS`, wood/gold far split ~50/50, few spots. Search on the 8-way `distanceField` with margins that carry to real routes (real ≤ grid ≤ real × `GRID_EXCESS`): greedy seed per castle ring (near 1–2 h, far 2–4 h) plus hole fill, then annealing (violation × `HARD` + soft; repair / retype / swap / jitter / jump / add / remove), then a `findPath` polish that never adds violation. `crampedCastles` precheck (no room for 3 spots 1 h apart under 2 h, or no far tile): `createWorld` throws such castle placements away (≤ 20 tries, ≤ 4 full searches); a running game searches anyway (`force`). Annealing runs a fixed step budget (`SEARCH_STEPS` + `SEARCH_STEPS_PER_CASTLE` × castles, ≤ `ATTEMPTS` 4, stops after `VALID_ATTEMPTS` 2 valid ones), not a time box, so a seed gives the same layout on every machine: a re-layout checked offline on a copy of the live save is exactly what the server produces. `evaluate` is the hot loop (flat arrays, no closures). The re-layout runs synchronously at server start before `/healthz` answers, and `deploy.sh` (fixed on the server, not updated by CI) rolls back after ≈ 60 s, so it uses `quick` (first valid attempt): live save, 18 castles ≈ 1.8 s on a dev Mac; the VPS is ≥ 4× slower (a 14 s version timed out there on 2026-11-05). `relayoutSpots` (once per running game, `SPOT_LAYOUT` 6): marchers keep start + depart time and re-route to the nearest same-resource spot; gatherers move there with their loading time left. `moveGatherersToNearestSpot` (once, `GATHERER_FIX` 1): gatherers move on to the same-resource spot nearest their home castle over land, loading time kept, and return to the home castle (`baseId` null) |
| Trader | spot kind `trader` (`ResourceSpot.resource`, name kept for saves): `sendArmy` with `cargo` = stone only and `trade` {gold, wood} summing to it (`checkTrade`); no other cargo is ever allowed. Outbound and home loaded (`LOADED_SPEED`, raidable). On arrival `tradeAt` swaps instantly (no loading) — an army robbed of its stone on the way turns home at once (`raid`; `tradeAt` still handles an empty arrival). Outbound trade armies cannot be redirected (recall only, stone goes back); nothing can be redirected onto a trader |
| Gathering | round trip: march to a spot, load `GATHER_DURATION_MS` (1 h), carry `gatherYield(troops)` (10 per 100 troops) back to the base the army left from, at `LOADED_SPEED` (0.75×) |

## Bases and outposts

- A player's **bases** are the home castle plus owned outposts. Armies leave from a base
  (`sendArmy.from`, null = home) and return to it. When an outpost falls, `recallFromLostOutpost`
  turns the former owner's armies heading there (returners and transfers, cargo kept) home on the
  spot; armies elsewhere that left from it return home later.
- **Outposts** (`OUTPOSTS_PER_PLAYER`, min `MIN_OUTPOSTS`) start as empty, unowned **ruins**,
  placed on contested ground between castles (`world.placeOutposts`). Taking one rebuilds it.
- **Outpost levels** (`Outpost.heldGamedays`, `outpostLevel`): level 1 when taken, +1 per
  `OUTPOST_LEVEL_GAMEDAYS` (2) gameday starts in the same hand, up to `OUTPOST_MAX_LEVEL` (4).
  Each gameday start pays `outpostIncome` = level wood, `OUTPOST_STONE_PER_LEVEL` (2) × level
  stone, level gold into the home castle (level 4: 4/8/4), and each level spares
  `OUTPOST_UPKEEP_RELIEF_PER_LEVEL` (50) troops from the upkeep (`troopUpkeep(troops, spared)`,
  `upkeepRelief`). Every owner change goes through `setOutpostOwner`: conquered from a player →
  level − 1 (`heldGamedaysForLevel`), a ruin taken or an outpost given up (castle fell, kick) →
  level 1. Shown on the nameplate as one `*` per level (`Anna · 40 ***`) and in the outpost panel (income, relief, next level).
  Games running from before levels: the one-off `apps/server/scripts/migrate-outpost-levels.ts`
  replays the ownership in the daily save backups with these rules (dry run unless `--write`).
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
- **Army cap**: at most `MAX_ARMIES` (10) armies per player on the map at once (any status, duo
  groups included; `checkArmyLimit` in `sendArmy`, `duoGroups` and Bestechung). Forced armies
  (fleeing garrisons, a split duo) are not refused.
- **Assault lock**: no troops leave a base while a foreign assault on it arrives within
  `ASSAULT_LOCK_MS` (20 min) or waits at its gates (`shared/entities.ts` `assaultImminent`,
  server `checkAssaultLock` in `sendArmy` and `duoGroups`). Tarnung assaults and duo groups not yet
  united do not count (the server must not reveal what the client cannot see). The send form greys
  out with the same check.
- Recall anytime unless already returning: heads home from the current position.
- Redirect (`redirectArmy`): any army without resource cargo or a chest can get a new target — outbound, gathering or on its way home. A loaded army (cargo or chest) may only switch to another own base (`redirectHome`: new `baseId`, then `startReturn`, so it stays loaded-slow and raidable); stock that reached a base stays there (castle until spent, outpost until the night caravan).
- Arriving at a chest: the first army with at least `troopsNeeded` troops takes it and heads
  straight home (see Cards); too few troops return empty-handed. Sending too few is refused.
- Nebel, Tarnung and Seeweg hold on the way home too (`startReturn` keeps them; recall, rout and
  re-routes after a castle move as well) until the player redirects the army (`redirectArmy` /
  `redirectHome` → `endRouteCards`). Cargo is always visible.
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
and lose their resource cargo (chests kept), those already heading home too (re-timed at normal speed),
and every outpost is given up: it turns back into an unowned ruin, its garrison marching home
empty-handed while the stock stays in the ruin. `PlayerRecord.routed` (public as `PlayerPublic.routed`) then blocks every player
command in `requirePlaying` until the player's last army is gone (`removeArmy` lifts it). Nobody
in the field → no lockout. The client greys out every action (`ui/Routed.tsx` `Locked`, `inert`)
and shows a "Handlungsunfähig" stamp in the top bar. While routed, the castle itself is off limits too: the
winning assault calls `turnBackAssaults` (every other outbound assault on that castle turns home
on the spot), `destination` refuses new attacks or redirects onto it, and one that still arrives
turns back without a fight (`assaultCastle`). With no troops away there is no rout, hence no
protection.

**Duo attacks** (`offerDuo` / `answerDuo` / `withdrawDuo` / `abortDuo`, `PactRecord` in
`data.pacts`, `SelfState.pacts` for the two participants only): against a third player's castle
(not while it is protected after a fall) or owned outpost. The initiator picks own stationed
troops per base and asks the partner for a number (≤ partner's stationed troops); the partner
only accepts (choosing their own bases, sum must match) or declines; unanswered offers lapse when
the following gameday ends. On accept every group marches to one meeting point (`planDuo` in
`shared/duo.ts`: the land tile with the earliest latest arrival, target ignored); outsiders see
no target until then. Groups that arrive wait (`status: 'waiting'`, skipped by `advance`); the
last one unites them (`arriveAtMeet`) into one army (`ownerId` = initiator, `pactId`,
`ArmyView.duoWith`) at the slower pace. No march cards. At the target `duoAssault` fights by the
usual rules; losses, plunder (`splitByShare`) are shared by troops, a castle's chest by lot
weighted by troops, a won outpost goes to the larger share (tie 50:50) with its survivors and
stock share, everyone else marches home separately. Recall/redirect are refused; a pact ends
early only when both call `abortDuo` (or the target is invalid on arrival, or a participant is
kicked) — groups return to their bases, a united army splits by share. A participant's rout
skips pact armies, and `hasArmies` counts them, so they stay routed until those are home.

**Raids**: any marching army carrying resource cargo (`isRaidable` in `shared/entities.ts`: home
from a spot or a win; base-to-base transfers no longer exist) can be ambushed — except while its owner
is routed (all their armies are immune; raids already underway go empty). A robbed army walks
on to its target at normal speed. Raiders are sent from a base or
redirected from the field. `planIntercept` finds the earliest point on the convoy's route the
raider reaches no later than the convoy; if the convoy arrives first, the raid is refused.
The raider arrives exactly at the meeting time; if the convoy is gone by then, it returns empty.
The same load changes hands at most `MAX_CARGO_RAIDS` (2) times: the winning raider's army gets
`ArmyRecord.cargoRaids` = the convoy's + 1 (`ArmyView.cargoRaids`), and `isRaidable` refuses a
convoy at the limit (stolen, stolen back, then safe). The count is cleared when cargo is lost
(robbed, rout) or an empty army is redirected.
A convoy cannot raid in turn: armies with cargo can only be redirected to an own base
(`redirectArmy`), and `sendArmy` takes no cargo at all. VP are never stolen,
and neither are chests: a chest bearer with resource cargo can be raided for the cargo only, and
always keeps at least one troop (`raid`), so the chest always gets home.

## Live ticker

`GameState.addFeed` keeps the last 60 public events (marches, battles, gathering returns, chests,
outposts, gamedays) in `GameView.feed`, written with fog already applied; a stealth march (or
redirect) is not announced at all.

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
  (`ownOutpost` / `player` / `foreignArmy`) need `activateCard.target`; it is checked before the card is spent
  (`GameState.instantCard`).

| Card | Use | Effect |
| ---- | --- | ------ |
| Nebel (`fog`) | on send | others see `?` for the army's troop count and for the base it left from (`PlayerPublic.homeTroops` / `OutpostView.troops` null, `viewFor`), out and home, until redirected |
| Tarnung (`stealth`) | on send | others don't see the target, route or arrival time (`arriveClock` = `departClock`), out and home, until redirected; the march is not in the ticker; a stealthed convoy cannot be raided (`destination` refuses it; the client sees no route) — resources come home safe |
| Eilmarsch (`forcedMarch`) | on send | outbound trip takes half as long |
| Bollwerk (`fortify`) | instant | castle defends ×1.5 for one gameday |
| Seeweg (`sea`) | on send | outbound and home path are the straight line `[from, to]`, over water too (`ArmyView.sea`); a redirect ends it (by land again); refused for raids, and armies on water cannot be intercepted (no land path to the meeting point) |
| Füllhorn (`harvest`) | instant | `harvestDays += HARVEST_GAMEDAYS` (3): each gameday start pays `HARVEST_BONUS` (+1) of every resource extra |
| Schuhe klauen (`stealShoes`) | instant, target player | victim's `barefootUntil` = clock + `BAREFOOT_DURATION_MS` (one gameday); every leg the victim starts meanwhile (send, redirect, return, reroute, raid intercept) runs at `BAREFOOT_SPEED` (0.75, stacks with `LOADED_SPEED`); legs already under way keep their pace. `PlayerPublic.barefoot` |
| Hofumzug (`relocate`) | instant, target own outpost | home castle and that outpost swap positions; troops and stores stay with their base; armies heading for either re-route (`rerouteToMoved`, shared with the admin castle swap) |
| Langfinger (`pickpocket`) | instant, target player | one of the victim's cards, drawn at random, moves to the thief (victim's armed card is disarmed if it was the last copy); refused if the victim has none. While holding it, `SelfState.cardCounts` lists every other player's card count (never which cards) |
| Bestechung (`bribe`) | instant, target foreign army | see below |

**Bestechung** (`GameState.bribe`, `planJoin`, `syncJoiners`): the target must be `isBribable`
(outbound or returning, no resource cargo, no chest, not in a duo, owner not routed) and within
`bribeRangeTiles` (`BRIBE_RANGE_HOURS` 1 h of marching, straight line) of an own army that is not
in a duo or itself joining — the nearest such army becomes the **host**. The bribed army changes
owner (base: home castle; route cards and Eilmarsch end) and gets `ArmyRecord.joins`
(`ArmyView.joining` = host id, `target` = the host, no raid). `planJoin` picks its way: the
earliest point on the host's current leg it can reach in time (`planIntercept`); failing that, if
the leg ends at an own base, the army simply marches to that base (no join); otherwise to the
leg's end — for a castle/outpost assault with `hold`, so the host waits there (`status:
'waiting'`, no `pactId`) instead of attacking until every holding joiner has arrived
(`resumeHost`). A gathering or waiting host is met where it stands. On arrival within
`RAID_REACH_TILES` the troops add to the host; arriving early, the joiner waits. `syncJoiners`
runs before and after every arrival in `advance`: a new host leg (`legKey`) means a new plan, a
host that is gone, changed hands or joined a duo sends the joiner home, and a waiting host nobody
holds for any more moves on. Redirecting or recalling the joiner ends the join. Ticker: the bribe (troop
count `?` under Nebel) and the union; waiting is not announced. Client:
activating opens the aim mode (`store.bribing`, `BribeBanner`), the renderer draws reach discs
around hosts and pulsing rings on bribable armies (`game/bribe.ts`), the army's panel has the
button.

## Rule changes notice

Every change that alters how a running game plays (balance numbers, rules — not UI) gets an entry
at the top of `RULE_CHANGES` in `apps/client/src/ui/RuleChanges.tsx`: a new stable `id`, the go-live
date, a title and a short German text with numbers pulled from `shared/rules.ts`. Players see it
once as a pop-up and later under "Neuerungen".
