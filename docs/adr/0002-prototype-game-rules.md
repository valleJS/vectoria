---
type: ADR
description: Implementation decisions for the first playable prototype — gameday clock, economy numbers, combat resolution, visibility, persistence, auth and admin.
audience: agent
category: adr
last_verified: 2026-10-30
load-when: Questioning why a game rule, the clock model, JSON-file persistence, token auth, or the admin API works the way it does.
---

# ADR 0002 — Prototype game rules and infrastructure

**Status:** Accepted (2026-10-30)

## Context

The design notes fix the frame (2D top-down map, closed system after registration, gamedays
Mon–Fri 10–18, three resources, generic troops, VP win, time-based marches, resource spots,
quantitative combat, chests with cards, full visibility) but leave numbers and mechanics open.
Rules themselves: [AGENTS_GAME.md](../AGENTS_GAME.md).

## Decisions

1. **One game clock in gameday-ms.** Instead of wall-clock timestamps, everything runs on a clock
   that only ticks inside gameday hours. Travel "10 gameday hours" then falls out naturally
   across nights and weekends; `GAME_HOURS=always` + `TIME_SCALE` make it testable.
2. **Payout at gameday start (10:00).** Makes "chosen after 10 → applies tomorrow" equal to
   "pending until the next payout".
3. **Resource roles:** troops cost wood + gold, VP cost mostly stone. Every resource matters and
   the activity choice is a real military-vs-VP trade-off. All numbers are placeholders in
   `rules.ts`.
4. **Combat is a pure quantity comparison**, ties go to the defender, survivors carry plunder home.
   Only home troops defend, so armies in the field make you vulnerable (as specified).
5. **Straight-line movement, no pathfinding;** water is cosmetic. Positions are interpolated from
   depart/arrive clock, so the server stores no per-tick movement.
6. **Spots are shared**, no combat outside castles. Simplest reading of the notes; revisit.
7. **Per-player views.** Cards hide fields per viewer, so the server builds one `state` message
   per client instead of a broadcast snapshot.
8. **Name + random token auth** (`POST /api/join`, token in `localStorage`, `?token=` on the
   socket). Enough for a closed group; no passwords.
9. **Admin via HTTP + bearer `ADMIN_TOKEN`**, UI at `/?admin`. Includes test levers (advance clock,
   force gameday, spawn chest, grant resources).
10. **JSON-file persistence** (`DATA_FILE`, atomic rename every 5 s and on shutdown). The game
    lasts weeks so restarts must not lose state; Postgres stays optional until the model settles.

## Consequences

- Balance changes are one-file edits in `packages/shared/src/rules.ts`.
- Missed payouts during long downtime are not back-filled.
- Full state per client per tick is fine for dozens of players; deltas needed beyond that.
