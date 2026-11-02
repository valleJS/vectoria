---
type: ADR
description: Second rules iteration — land pathfinding, round-trip gathering, outposts as bases, convoy raids, percentage combat, live ticker and passwordless email login.
audience: agent
category: adr
last_verified: 2026-11-01
load-when: Questioning why armies path over land, why gathering is a round trip, how outposts or raids work, why combat losses are percentages, or why login is by emailed code.
---

# ADR 0003 — Land routes, outposts, raids, email login

**Status:** Accepted (2026-11-01). Supersedes ADR 0002 decisions 5, 6 and 8.

## Context

Playtest feedback: marches crossed water; gathering ("x per gameday") felt passive; there was no
reason to fight outside castles; personal info was scattered; no shared view of what happens;
name-only sessions could not log in on a second device. Rules: [AGENTS_GAME.md](../AGENTS_GAME.md).

## Decisions

1. **A* over land in `packages/shared`**, straightened by line-of-sight with clearance. Shared so
   client previews match the server. Sites are placed on the largest landmass, so every target is
   reachable. Positions are still interpolated (now along the stored path), no per-tick movement.
2. **Gathering is a round trip** with a fixed load per troop and a short loading stop. Distance
   becomes the cost, and loaded convoys on the way home are the thing worth fighting over.
3. **Raids are planned, not simulated.** `planIntercept` (one Dijkstra field + sampling the
   convoy's route) fixes a meeting point and time at send time; the raid resolves there if the
   convoy is still within reach. No continuous pursuit or collision detection.
4. **Outposts are bases**: armies leave from and return to them, cargo is stored there, but only
   home resources are spendable. Moving stock home exposes it to raids — a deliberate trade-off.
5. **Combat losses are shares** (25/50 on attacker win, 100/25 on defender win), capped at the
   opponent's troop count so tiny armies cannot bleed large garrisons. Same rule everywhere.
6. **Feed is public text written at event time**, with card effects applied, so no per-viewer
   filtering is needed.
7. **Email + 6-digit code (and link) instead of passwords.** Codes in memory (restart = request
   again); the token stays one per player. SMTP via nodemailer; without `SMTP_HOST` codes go to the
   log in dev, production refuses to start. Admin can attach emails to legacy players.

## Consequences

- Save format v2; v1 saves are migrated on load (outposts placed, stationed armies start loading).
- Protocol version 3 (`sendArmy.from/cargo`, `redirectArmy`, `ArmyView.route/cargo`, `feed`,
  `outposts`).
- Per-command pathfinding is cheap on ≤ 96×96 maps; revisit with bigger maps.
