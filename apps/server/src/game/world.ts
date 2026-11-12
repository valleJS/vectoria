import {
  CHEST_BASE_GAP_HOURS,
  CHEST_REPEAT_PENALTY,
  CHEST_REPEAT_RADIUS_HOURS,
  CROSS_MAP_HOURS,
  distanceField,
  emptyResources,
  mapSizeForPlayers,
  MIN_OUTPOSTS,
  OUTPOSTS_PER_PLAYER,
  TileType,
  type MapData,
  type Outpost,
  type ResourceSpot,
  type Vec2,
} from '@vectoria/shared';
import { generateMap } from './mapgen';
import { placeBalancedSpots, type SpotLayout } from './spots';
import { createRandom } from './random';

/**
 * Castle placements tried: ones that leave a castle no room for its spots are thrown away at once
 * (cheap); at most `FULL_SEARCHES` get the full spot search, the best layout is kept.
 */
const PLACEMENT_TRIES = 20;
const FULL_SEARCHES = 4;

export interface World {
  map: MapData;
  castles: Vec2[];
  outposts: Outpost[];
  spots: ResourceSpot[];
}

const centre = (x: number, y: number): Vec2 => ({ x: x + 0.5, y: y + 0.5 });
const distance = (a: Vec2, b: Vec2) => Math.hypot(a.x - b.x, a.y - b.y);

export function outpostCount(players: number): number {
  return Math.max(MIN_OUTPOSTS, Math.round(players * OUTPOSTS_PER_PLAYER));
}

/**
 * Generates the map sized for `players` and places castles, outposts and resource spots. All of
 * them sit on the largest connected landmass, so every site can be reached over land.
 */
export function createWorld(players: number, seed: number): World {
  const size = mapSizeForPlayers(players);
  const map = generateMap(size, size, seed);
  const random = createRandom(seed ^ 0x51ed27);

  const land = innerLand(map);
  if (land.length < players * 4) throw new Error('Generated map has too little land');

  let best: { castles: Vec2[]; outposts: Outpost[]; layout: SpotLayout } | null = null;
  let searches = 0;
  for (let attempt = 0; attempt < PLACEMENT_TRIES && searches < FULL_SEARCHES; attempt++) {
    // Farthest-point sampling spreads castles evenly across the land.
    const taken: Vec2[] = [];
    const castles: Vec2[] = [];
    for (let i = 0; i < players; i++) {
      const next =
        castles.length === 0
          ? land[Math.floor(random() * land.length)]!
          : farthestFrom(land, castles, random);
      castles.push(next);
      taken.push(next);
    }
    const outposts = placeOutposts(land, castles, taken, outpostCount(players), random);
    const anchors = [...castles, ...outposts.map((o) => o.position)];
    // The last try searches even a cramped placement, so a world always comes out.
    const force = attempt === PLACEMENT_TRIES - 1 && !best;
    const layout = placeBalancedSpots(map, castles, land, taken, anchors, random, { force });
    if (layout.spots.length === 0) continue;
    searches++;
    const improves =
      !best ||
      (layout.valid && !best.layout.valid) ||
      (layout.valid === best.layout.valid && layout.spreadHours < best.layout.spreadHours);
    if (improves) best = { castles, outposts, layout };
    if (layout.valid) break;
  }
  const { castles, outposts, layout } = best!;
  const spots = layout.spots.map((s, i): ResourceSpot => ({ id: `spot-${i}`, ...s }));
  return { map, castles, outposts, spots };
}

/** Mainland tiles off the map's outer ring: where castles, outposts and spots may stand. */
export function innerLand(map: MapData): Vec2[] {
  const { width, height } = map;
  return mainlandTiles(map).filter(
    (p) => p.x > 1 && p.y > 1 && p.x < width - 1 && p.y < height - 1,
  );
}

/**
 * Neutral, empty outposts (ruins) on contested ground: roughly as far from the nearest castle as from
 * the second nearest, and away from other `taken` sites (which this extends).
 */
export function placeOutposts(
  land: Vec2[],
  castles: Vec2[],
  taken: Vec2[],
  count: number,
  random: () => number,
): Outpost[] {
  const outposts: Outpost[] = [];
  for (let i = 0; i < count; i++) {
    let position = land[0]!;
    let bestScore = -Infinity;
    for (let k = 0; k < 300; k++) {
      const candidate = land[Math.floor(random() * land.length)]!;
      const [d1 = 0, d2 = d1] = castles.map((c) => distance(c, candidate)).sort((a, b) => a - b);
      const spread = Math.min(...taken.map((t) => distance(t, candidate)), Infinity);
      const score = Math.min(spread, d1) - Math.abs(d2 - d1);
      if (score > bestScore) {
        position = candidate;
        bestScore = score;
      }
    }
    taken.push(position);
    outposts.push({
      id: `outpost-${i}`,
      position,
      ownerId: null,
      troops: 0,
      resources: emptyResources(),
    });
  }
  return outposts;
}

/** The best of 200 random candidates by distance to the nearest `taken` point. */
export function farthestFrom(candidates: Vec2[], taken: Vec2[], random: () => number): Vec2 {
  // Sample instead of scanning everything; plenty for maps under 100×100.
  let best = candidates[0]!;
  let bestScore = -1;
  for (let i = 0; i < 200; i++) {
    const candidate = candidates[Math.floor(random() * candidates.length)]!;
    const score = Math.min(...taken.map((t) => distance(t, candidate)), Infinity);
    if (score > bestScore) {
      best = candidate;
      bestScore = score;
    }
  }
  return best;
}

/**
 * A random spot for a new chest: a free mainland tile (`taken` holds every occupied point) at least
 * `CHEST_BASE_GAP_HOURS` of marching from every base, weighted away from `earlier` spawns (every one of this game). When no
 * tile is that far from the bases, any free one will do.
 */
export function chestTile(
  map: MapData,
  bases: Vec2[],
  taken: Vec2[],
  earlier: Vec2[],
  random: () => number,
): Vec2 {
  const tilesPerHour = map.width / CROSS_MAP_HOURS;
  const gap = CHEST_BASE_GAP_HOURS * tilesPerHour;
  const fields = bases.map((b) => distanceField(map, b, gap));
  const index = (p: Vec2) => Math.floor(p.y) * map.width + Math.floor(p.x);
  const occupied = new Set(taken.map(index));
  const free = mainlandTiles(map).filter((t) => !occupied.has(index(t)));
  const far = free.filter((t) => fields.every((f) => !(f[index(t)]! < gap)));
  const pool = far.length > 0 ? far : free;
  const radius = CHEST_REPEAT_RADIUS_HOURS * tilesPerHour;
  const weights = pool.map((t) => {
    const closeness = earlier.reduce(
      (sum, e) => sum + Math.exp(-((distance(e, t) / radius) ** 2)),
      0,
    );
    return 1 / (1 + CHEST_REPEAT_PENALTY * closeness);
  });
  let roll = random() * weights.reduce((sum, w) => sum + w, 0);
  for (let i = 0; i < pool.length; i++) {
    roll -= weights[i]!;
    if (roll < 0) return pool[i]!;
  }
  return pool[pool.length - 1]!;
}

/** Centres of the tiles of the largest 4-connected land area. */
export function mainlandTiles(map: MapData): Vec2[] {
  const { width, height, tiles } = map;
  const component = new Int32Array(tiles.length).fill(-1);
  let best: number[] = [];
  for (let startIndex = 0; startIndex < tiles.length; startIndex++) {
    if (tiles[startIndex] === TileType.Water || component[startIndex] !== -1) continue;
    const members: number[] = [];
    const stack = [startIndex];
    component[startIndex] = startIndex;
    while (stack.length > 0) {
      const i = stack.pop()!;
      members.push(i);
      const x = i % width;
      const y = Math.floor(i / width);
      for (const [dx, dy] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ] as const) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
        const n = ny * width + nx;
        if (tiles[n] === TileType.Water || component[n] !== -1) continue;
        component[n] = startIndex;
        stack.push(n);
      }
    }
    if (members.length > best.length) best = members;
  }
  return best.map((i) => centre(i % width, Math.floor(i / width)));
}
