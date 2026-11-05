import type { Vec2 } from './entities';
import type { MapData } from './map';
import { distanceField, findPath, pathLength } from './pathfinding';
import { travelMs } from './rules';

/** One group of a duo attack: where it sets out and its marching pace (1, or barefoot). */
export interface DuoSource {
  position: Vec2;
  speed: number;
}

export interface DuoPlan {
  /** Meeting point: the land tile all groups reach soonest (the last one to arrive, that is). */
  meet: Vec2;
  /** Route and walking time of each source to the meeting point, in input order. */
  legs: { path: Vec2[]; ms: number }[];
  /** Game ms until the last group arrives: the duo army forms and its target is revealed. */
  meetMs: number;
  attackPath: Vec2[];
  /** Game ms from setting out until the united army reaches the target. */
  totalMs: number;
}

/**
 * Plans a duo attack: every group walks straight to one meeting point — always the tile whose
 * latest arrival is earliest, whatever the target (which may well be a detour) — and the united
 * army marches on from there at the pace of the slowest group. Null if a leg has no land route.
 * Shared so the offer shows the same times the server will use.
 */
export function planDuo(map: MapData, sources: DuoSource[], target: Vec2): DuoPlan | null {
  if (sources.length === 0) return null;
  const fields = new Map<string, Float64Array>();
  const field = (p: Vec2) => {
    const key = `${p.x},${p.y}`;
    let f = fields.get(key);
    if (!f) fields.set(key, (f = distanceField(map, p)));
    return f;
  };
  const costs = sources.map((s) => ({ field: field(s.position), speed: s.speed }));
  let best = -1;
  let bestTime = Infinity;
  for (let i = 0; i < map.tiles.length; i++) {
    let latest = 0;
    for (const c of costs) {
      latest = Math.max(latest, c.field[i]! / c.speed);
      if (latest >= bestTime) break;
    }
    if (latest < bestTime) {
      bestTime = latest;
      best = i;
    }
  }
  if (best < 0) return null;
  const meet = { x: (best % map.width) + 0.5, y: Math.floor(best / map.width) + 0.5 };
  const legs: DuoPlan['legs'] = [];
  for (const s of sources) {
    const path = findPath(map, s.position, meet);
    if (!path) return null;
    legs.push({ path, ms: travelMs(pathLength(path), map.width, false, s.speed) });
  }
  const attackPath = findPath(map, meet, target);
  if (!attackPath) return null;
  const meetMs = Math.max(...legs.map((l) => l.ms));
  const pace = Math.min(...sources.map((s) => s.speed));
  return {
    meet,
    legs,
    meetMs,
    attackPath,
    totalMs: meetMs + travelMs(pathLength(attackPath), map.width, false, pace),
  };
}

/** Splits `total` over `weights` in proportion, whole numbers summing to `total` (largest remainder). */
export function splitByShare(total: number, weights: readonly number[]): number[] {
  const sum = weights.reduce((a, b) => a + b, 0);
  if (sum <= 0) return weights.map((_, i) => (i === 0 ? total : 0));
  const exact = weights.map((w) => (total * w) / sum);
  const out = exact.map(Math.floor);
  let left = total - out.reduce((a, b) => a + b, 0);
  const order = exact
    .map((e, i) => ({ i, rest: e - Math.floor(e) }))
    .sort((a, b) => b.rest - a.rest || a.i - b.i);
  for (const { i } of order) {
    if (left <= 0) break;
    out[i]! += 1;
    left--;
  }
  return out;
}
