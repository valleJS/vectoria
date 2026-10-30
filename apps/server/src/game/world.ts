import {
  mapSizeForPlayers,
  RESOURCES,
  TileType,
  type MapData,
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

export interface World {
  map: MapData;
  castles: Vec2[];
  spots: ResourceSpot[];
}

const centre = (x: number, y: number): Vec2 => ({ x: x + 0.5, y: y + 0.5 });
const distance = (a: Vec2, b: Vec2) => Math.hypot(a.x - b.x, a.y - b.y);

/** Generates the map sized for `players` and places one castle per player plus resource spots. */
export function createWorld(players: number, seed: number): World {
  const size = mapSizeForPlayers(players);
  const map = generateMap(size, size, seed);
  const random = createRandom(seed ^ 0x51ed27);

  const tilesOf = (type: TileType | null): Vec2[] => {
    const out: Vec2[] = [];
    for (let y = 1; y < size - 1; y++) {
      for (let x = 1; x < size - 1; x++) {
        const tile = map.tiles[y * size + x]!;
        if (type === null ? tile !== TileType.Water : tile === type) out.push(centre(x, y));
      }
    }
    return out;
  };
  const land = tilesOf(null);
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

  const spots: ResourceSpot[] = [];
  const spotCount = Math.max(RESOURCES.length, Math.round(players * SPOTS_PER_PLAYER));
  for (let i = 0; i < spotCount; i++) {
    const resource = RESOURCES[i % RESOURCES.length]!;
    const preferred = tilesOf(SPOT_TERRAIN[resource]);
    const pool = preferred.length >= 4 ? preferred : land;
    const position = farthestFrom(pool, taken, random);
    taken.push(position);
    spots.push({ id: `spot-${i}`, resource, position });
  }

  return { map, castles, spots };
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

export function landTiles(map: MapData): Vec2[] {
  const out: Vec2[] = [];
  for (let y = 0; y < map.height; y++) {
    for (let x = 0; x < map.width; x++) {
      if (map.tiles[y * map.width + x] !== TileType.Water) out.push(centre(x, y));
    }
  }
  return out;
}
