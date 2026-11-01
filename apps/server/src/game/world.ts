import {
  emptyResources,
  mapSizeForPlayers,
  MIN_OUTPOSTS,
  OUTPOSTS_PER_PLAYER,
  RESOURCES,
  TileType,
  type MapData,
  type Outpost,
  type ResourceSpot,
  type ResourceType,
  type Vec2,
} from '@vectoria/shared';
import { generateMap } from './mapgen';
import { createRandom } from './random';

/** Preferred terrain for each resource spot; falls back to any land tile. */
const SPOT_TERRAIN: Record<ResourceType, TileType> = {
  wood: TileType.Forest,
  stone: TileType.Mountain,
  gold: TileType.Mountain,
};
const SPOTS_PER_PLAYER = 1.5;
const OUTPOST_NAMES = [
  'Falkenstein',
  'Rabenfels',
  'Eichwacht',
  'Steinhag',
  'Adlerhorst',
  'Nebelturm',
  'Grauwall',
  'Birkenfeste',
  'Dornburg',
  'Hohenwart',
  'Silbertann',
  'Wolkenstein',
  'Kranichwacht',
  'Eisenfels',
  'Moosburg',
  'Lindenhag',
];

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

  const mainland = mainlandTiles(map);
  const inner = (p: Vec2) => p.x > 1 && p.y > 1 && p.x < size - 1 && p.y < size - 1;
  const land = mainland.filter(inner);
  if (land.length < players * 4) throw new Error('Generated map has too little land');

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

  const spots: ResourceSpot[] = [];
  const spotCount = Math.max(RESOURCES.length, Math.round(players * SPOTS_PER_PLAYER));
  for (let i = 0; i < spotCount; i++) {
    const resource = RESOURCES[i % RESOURCES.length]!;
    const preferred = land.filter(
      (p) => map.tiles[Math.floor(p.y) * size + Math.floor(p.x)] === SPOT_TERRAIN[resource],
    );
    const pool = preferred.length >= 4 ? preferred : land;
    const position = farthestFrom(pool, taken, random);
    taken.push(position);
    spots.push({ id: `spot-${i}`, resource, position });
  }

  return { map, castles, outposts, spots };
}

/**
 * Neutral, empty outposts on contested ground: roughly as far from the nearest castle as from
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
      name: OUTPOST_NAMES[i % OUTPOST_NAMES.length]! + (i >= OUTPOST_NAMES.length ? ' II' : ''),
      position,
      ownerId: null,
      troops: 0,
      resources: emptyResources(),
    });
  }
  return outposts;
}

/** A random tile among the best few candidates by distance to the nearest `taken` point. */
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
