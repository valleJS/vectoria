import type { Vec2 } from './entities';
import { TileType, type MapData } from './map';
import { travelMs } from './rules';

// Movement over land. Armies walk tile to tile (8 directions, no corner cutting past water);
// the tile path is then straightened wherever a direct line stays on land. Shared so the
// client can preview routes, travel times and raids exactly as the server computes them.

/** How far (tiles) a straightened segment must stay from water on either side. */
const CLEARANCE = 0.25;
/** Sampling step (tiles) for line-of-sight checks and interception search. */
const STEP = 0.2;

const NEIGHBOURS: readonly [number, number, number][] = [
  [1, 0, 1],
  [-1, 0, 1],
  [0, 1, 1],
  [0, -1, 1],
  [1, 1, Math.SQRT2],
  [1, -1, Math.SQRT2],
  [-1, 1, Math.SQRT2],
  [-1, -1, Math.SQRT2],
];

const distance = (a: Vec2, b: Vec2) => Math.hypot(a.x - b.x, a.y - b.y);

function tileOf(map: MapData, p: Vec2): number {
  const x = Math.min(map.width - 1, Math.max(0, Math.floor(p.x)));
  const y = Math.min(map.height - 1, Math.max(0, Math.floor(p.y)));
  return y * map.width + x;
}

function centreOf(map: MapData, index: number): Vec2 {
  return { x: (index % map.width) + 0.5, y: Math.floor(index / map.width) + 0.5 };
}

export function isLandAt(map: MapData, p: Vec2): boolean {
  if (p.x < 0 || p.y < 0 || p.x >= map.width || p.y >= map.height) return false;
  return map.tiles[tileOf(map, p)] !== TileType.Water;
}

/** Binary min-heap of tile indices; priorities are stored with the entries (lazy updates). */
class Heap {
  private readonly items: number[] = [];
  private readonly keys: number[] = [];

  get size(): number {
    return this.items.length;
  }

  push(item: number, key: number): void {
    const { items, keys } = this;
    let i = items.length;
    items.push(item);
    keys.push(key);
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (keys[parent]! <= key) break;
      items[i] = items[parent]!;
      keys[i] = keys[parent]!;
      i = parent;
    }
    items[i] = item;
    keys[i] = key;
  }

  pop(): number {
    const { items, keys } = this;
    const top = items[0]!;
    const lastItem = items.pop()!;
    const lastKey = keys.pop()!;
    if (items.length > 0) {
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        if (l >= items.length) break;
        const r = l + 1;
        const child = r < items.length && keys[r]! < keys[l]! ? r : l;
        if (keys[child]! >= lastKey) break;
        items[i] = items[child]!;
        keys[i] = keys[child]!;
        i = child;
      }
      items[i] = lastItem;
      keys[i] = lastKey;
    }
    return top;
  }
}

/**
 * Visits the walkable neighbours of tile `index`. The start and goal tiles are walkable even if
 * they are water, so armies standing on an odd tile are never stuck.
 */
function forEachNeighbour(
  map: MapData,
  index: number,
  walkable: (i: number) => boolean,
  visit: (next: number, cost: number) => void,
): void {
  const x = index % map.width;
  const y = Math.floor(index / map.width);
  for (const [dx, dy, cost] of NEIGHBOURS) {
    const nx = x + dx;
    const ny = y + dy;
    if (nx < 0 || ny < 0 || nx >= map.width || ny >= map.height) continue;
    const next = ny * map.width + nx;
    if (!walkable(next)) continue;
    if (dx !== 0 && dy !== 0 && !(walkable(y * map.width + nx) && walkable(ny * map.width + x))) {
      continue;
    }
    visit(next, cost);
  }
}

const landTest =
  (map: MapData, ...extra: number[]) =>
  (i: number) =>
    map.tiles[i] !== TileType.Water || extra.includes(i);

/** True if the straight segment a→b stays on land with some clearance. */
function lineOnLand(map: MapData, a: Vec2, b: Vec2, allowed: number[]): boolean {
  const length = distance(a, b);
  const steps = Math.max(1, Math.ceil(length / STEP));
  const nx = length > 0 ? -(b.y - a.y) / length : 0;
  const ny = length > 0 ? (b.x - a.x) / length : 0;
  const ok = (p: Vec2) => isLandAt(map, p) || allowed.includes(tileOf(map, p));
  for (let i = 1; i < steps; i++) {
    const t = i / steps;
    const p = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
    if (!ok(p)) return false;
    for (const side of [-CLEARANCE, CLEARANCE]) {
      if (!ok({ x: p.x + nx * side, y: p.y + ny * side })) return false;
    }
  }
  return true;
}

/**
 * Shortest land route from `from` to `to` as waypoints (first = `from`, last = `to`), or null if
 * no land connection exists.
 */
export function findPath(map: MapData, from: Vec2, to: Vec2): Vec2[] | null {
  const start = tileOf(map, from);
  const goal = tileOf(map, to);
  if (start === goal) return [from, to];
  const walkable = landTest(map, start, goal);
  const cost = new Float64Array(map.tiles.length).fill(Infinity);
  const came = new Int32Array(map.tiles.length).fill(-1);
  const closed = new Uint8Array(map.tiles.length);
  const gx = goal % map.width;
  const gy = Math.floor(goal / map.width);
  const heuristic = (i: number) => {
    const dx = Math.abs((i % map.width) - gx);
    const dy = Math.abs(Math.floor(i / map.width) - gy);
    return Math.max(dx, dy) + (Math.SQRT2 - 1) * Math.min(dx, dy);
  };
  const open = new Heap();
  cost[start] = 0;
  open.push(start, heuristic(start));
  while (open.size > 0) {
    const current = open.pop();
    if (current === goal) break;
    if (closed[current]) continue;
    closed[current] = 1;
    forEachNeighbour(map, current, walkable, (next, step) => {
      const g = cost[current]! + step;
      if (g >= cost[next]!) return;
      cost[next] = g;
      came[next] = current;
      open.push(next, g + heuristic(next));
    });
  }
  if (came[goal] === -1) return null;

  const tiles: number[] = [];
  for (let i = goal; i !== -1; i = came[i]!) tiles.push(i);
  tiles.reverse();
  const raw = tiles.map((i) => centreOf(map, i));
  raw[0] = from;
  raw[raw.length - 1] = to;
  return straighten(map, raw, [start, goal]);
}

/** Greedy string pulling: skip waypoints while the direct line stays on land. */
function straighten(map: MapData, points: Vec2[], allowed: number[]): Vec2[] {
  const out = [points[0]!];
  let anchor = 0;
  while (anchor < points.length - 1) {
    let next = anchor + 1;
    for (let j = points.length - 1; j > anchor + 1; j--) {
      if (lineOnLand(map, points[anchor]!, points[j]!, allowed)) {
        next = j;
        break;
      }
    }
    out.push(points[next]!);
    anchor = next;
  }
  return out;
}

export function pathLength(path: readonly Vec2[]): number {
  let length = 0;
  for (let i = 1; i < path.length; i++) length += distance(path[i - 1]!, path[i]!);
  return length;
}

/** The point `fraction` (0–1) of the way along `path`, and the index of the segment it is on. */
function locate(path: readonly Vec2[], fraction: number): { point: Vec2; segment: number } {
  const total = pathLength(path);
  let remaining = Math.min(1, Math.max(0, fraction)) * total;
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1]!;
    const b = path[i]!;
    const length = distance(a, b);
    if (remaining <= length || i === path.length - 1) {
      const t = length > 0 ? Math.min(1, remaining / length) : 1;
      return { point: { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }, segment: i };
    }
    remaining -= length;
  }
  return { point: path[path.length - 1] ?? { x: 0, y: 0 }, segment: path.length - 1 };
}

export function pointAlong(path: readonly Vec2[], fraction: number): Vec2 {
  return locate(path, fraction).point;
}

/** The part of `path` still ahead at `fraction`, starting at that point. */
export function remainingPath(path: readonly Vec2[], fraction: number): Vec2[] {
  const { point, segment } = locate(path, fraction);
  return [point, ...path.slice(segment)];
}

/**
 * Path distance (tiles) from `from` to the centre of every tile; Infinity where unreachable.
 * One Dijkstra pass, so many destinations can be checked at once.
 */
export function distanceField(map: MapData, from: Vec2): Float64Array {
  const start = tileOf(map, from);
  const walkable = landTest(map, start);
  const cost = new Float64Array(map.tiles.length).fill(Infinity);
  const closed = new Uint8Array(map.tiles.length);
  const open = new Heap();
  cost[start] = distance(from, centreOf(map, start));
  open.push(start, cost[start]);
  while (open.size > 0) {
    const current = open.pop();
    if (closed[current]) continue;
    closed[current] = 1;
    forEachNeighbour(map, current, walkable, (next, step) => {
      const g = cost[current]! + step;
      if (g < cost[next]!) {
        cost[next] = g;
        open.push(next, g);
      }
    });
  }
  return cost;
}

/** A moving army as needed to predict where it will be. */
export interface Track {
  path: readonly Vec2[];
  departClock: number;
  arriveClock: number;
}

/**
 * Earliest point on `track` that troops starting at `from` at clock `now` can reach no later
 * than the tracked army, before it arrives. Null if it gets home first or no land route exists.
 */
export function planIntercept(
  map: MapData,
  from: Vec2,
  track: Track,
  now: number,
  forcedMarch = false,
): { position: Vec2; clock: number } | null {
  const span = track.arriveClock - track.departClock;
  const total = pathLength(track.path);
  if (span <= 0 || total <= 0 || now >= track.arriveClock) return null;
  const field = distanceField(map, from);
  const startFraction = Math.max(0, (now - track.departClock) / span);
  for (let d = startFraction * total; d < total; d += STEP) {
    const fraction = d / total;
    const clock = track.departClock + fraction * span;
    // Meeting at the very gate counts as home.
    if (track.arriveClock - clock < span * 0.02) break;
    const position = pointAlong(track.path, fraction);
    const tile = tileOf(map, position);
    const reach = field[tile]! + distance(position, centreOf(map, tile));
    if (!Number.isFinite(reach)) continue;
    if (now + travelMs(reach, map.width, forcedMarch) <= clock) return { position, clock };
  }
  return null;
}
