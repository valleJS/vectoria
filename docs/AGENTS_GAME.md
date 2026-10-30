---
type: Codemap
description: Game rules of the prototype — phases, gameday clock, economy, armies, combat, chests and cards — and where each rule lives in code.
audience: agent
category: codemap
last_verified: 2026-10-30
load-when: Changing or explaining any game rule, balance number, card, the gameday clock, or combat.
sources: [packages/shared/src/rules.ts, packages/shared/src/entities.ts, apps/server/src/game/]
sources_stamp: 3a3f37f
---

# Game rules (prototype)

Balance numbers live only in `packages/shared/src/rules.ts`; the server enforces them in
`apps/server/src/game/GameState.ts`. Why these choices: [ADR 0002](./adr/0002-prototype-game-rules.md).

## Phases

`registration` → admin "Anmeldung schließen & starten" → `running` → `ended` (a player reaches
`VICTORY_POINTS_TO_WIN`, or the admin ends it; highest VP wins). Joining is only possible during
registration (closed system). The map is generated at start, sized by `mapSizeForPlayers`
(24–96 tiles square). Admin "reset" returns to registration, keeping registrations.

## Game clock

- `clock` = accumulated gameday milliseconds. It advances only Mon–Fri 10–18 in
  `GAME_TIMEZONE` (`GAME_HOURS=weekdays`) or always (`always`, dev), times `TIME_SCALE`.
- All durations (travel, gathering, card effects) are in clock ms, so they pause overnight.
- After downtime the server catches the clock up (`calendar.gameTimeBetween`); only one daily
  payout is granted for missed days.
- **Gameday start**: first game-time tick of a calendar day (weekdays) or every 8 clock-hours
  (always). Then: pending activity becomes active, every player gets 1 of each resource and 3 of
  the active one, and `ceil(players/3)` chests spawn (cap = player count).

## Economy

| Thing | Rule |
| ----- | ---- |
| Resources | wood, stone, gold (`Holz`, `Stein`, `Gold`) |
| Base activity | chosen any time; applies at the next gameday start, else yesterday's is kept |
| Troops | 10 for 1 wood + 1 gold; one generic troop type |
| Victory point | 1 wood + 2 stone + 1 gold |
| Start | 50 troops, 2 of each resource |
| Gathering | troops stationed at a spot yield 10 per 100 troops per gameday, credited continuously |

## Armies

- Sent from the castle to a castle (attack), resource spot (gather) or chest. Straight line,
  terrain ignored. Crossing the map width takes `CROSS_MAP_HOURS` (10) gameday hours.
- Recall anytime: returns from the current interpolated position, duration by distance.
- Arriving at a chest: first army gets a random card, then auto-returns.
- Everything is visible to everyone, including home troops. Card effects null out fields in the
  per-player view (`GameState.armyView`).

## Combat

On arrival at an enemy castle: attacker troops vs. defender's **home** troops × 1.5 if fortified.
Attacker wins only if strictly greater: defenders all die, attacker loses the defence value and
returns with 50 % of each defender resource. Otherwise the attacker army dies and the defender
loses `ceil(attackers / multiplier)` troops. VP are never stolen.

## Cards

| Card | Use | Effect |
| ---- | --- | ------ |
| Nebel (`fog`) | on send | others see `?` for troop count |
| Tarnung (`stealth`) | on send | others don't see the target |
| Eilmarsch (`forcedMarch`) | on send | outbound trip takes half as long |
| Bollwerk (`fortify`) | instant | castle defends ×1.5 for one gameday |
