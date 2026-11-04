import {
  CROSS_MAP_HOURS,
  distanceField,
  findPath,
  pathLength,
  RESOURCES,
  SPOT_BALANCE_TOLERANCE_HOURS,
  SPOT_FAR_HOURS,
  TileType,
  type MapData,
  type ResourceType,
  type Vec2,
} from '@vectoria/shared';

/** Preferred terrain for each resource spot; any land tile works, at a small cost. */
const SPOT_TERRAIN: Record<ResourceType, TileType> = {
  wood: TileType.Forest,
  stone: TileType.Mountain,
  gold: TileType.Mountain,
};
/** Spots keep this far (tiles) from castles, outposts, chests and each other. */
const MIN_GAP = 2;
/** Search budget per layout attempt, and attempts before the best one is taken. */
const SEARCH_MS = 1500;
const ATTEMPTS = 4;
/** Real-path polish: local moves tried on the best grid layout. */
const POLISH_MOVES = 400;
/** Pull towards short walks overall, weak against balance and the far spot. */
const MEAN_WEIGHT = 0.3;

export interface SpotPlacement {
  resource: ResourceType;
  position: Vec2;
}

/** Per castle: walking distance (tiles) to its nearest spot of each resource. */
export type SpotReach = Record<ResourceType, number>[];

const centre = (map: MapData, i: number): Vec2 => ({
  x: (i % map.width) + 0.5,
  y: Math.floor(i / map.width) + 0.5,
});
const distance = (a: Vec2, b: Vec2) => Math.hypot(a.x - b.x, a.y - b.y);

/** Tiles walked in `hours` of game time on this map. */
export function tilesFor(map: MapData, hours: number): number {
  return (hours * map.width) / CROSS_MAP_HOURS;
}

/**
 * Places `count` resource spots so every castle has about the same total walk to its nearest
 * wood, stone and gold (along land, water respected), with one of the three at least
 * `SPOT_FAR_HOURS` away. Simulated annealing on Dijkstra distance fields, then a polish on the
 * real (straightened) routes armies walk. `land` are the tiles spots may use, `taken` the sites
 * they keep clear of.
 */
export function placeBalancedSpots(
  map: MapData,
  castles: Vec2[],
  land: Vec2[],
  taken: Vec2[],
  count: number,
  random: () => number,
): SpotPlacement[] {
  const candidates = land
    .filter((p) => taken.every((t) => distance(t, p) >= MIN_GAP))
    .map((p) => Math.floor(p.y) * map.width + Math.floor(p.x));
  if (candidates.length < count) throw new Error('Too little free land for resource spots');
  const fields = castles.map((c) => distanceField(map, c));
  const grid = (player: number, tile: number) => fields[player]![tile]!;

  let best: Layout | null = null;
  for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
    const layout = anneal(map, castles.length, candidates, count, grid, random);
    polish(map, castles, candidates, layout, random);
    if (!best || layout.score < best.score) best = layout;
    if (layout.spreadHours <= SPOT_BALANCE_TOLERANCE_HOURS && layout.farOk) break;
  }
  return best!.spots.map((s) => ({ resource: s.resource, position: centre(map, s.tile) }));
}

interface Spot {
  tile: number;
  resource: ResourceType;
}

interface Layout {
  spots: Spot[];
  score: number;
  /** Largest minus smallest total walk, in game hours (real routes after polish). */
  spreadHours: number;
  farOk: boolean;
}

type Distance = (player: number, tile: number) => number;

/** Lower is better: spread of the totals, missing far distance, crowding, off-terrain, mean. */
function score(
  map: MapData,
  players: number,
  spots: Spot[],
  dist: Distance,
): { score: number; spread: number; farOk: boolean } {
  // A little margin: the polish may trade a few tenths of a tile away again.
  const far = tilesFor(map, SPOT_FAR_HOURS + 0.1);
  let min = Infinity;
  let max = -Infinity;
  let sum = 0;
  let farMissing = 0;
  for (let p = 0; p < players; p++) {
    let total = 0;
    let farthest = 0;
    for (const r of RESOURCES) {
      let nearest = Infinity;
      for (const s of spots) {
        if (s.resource === r) nearest = Math.min(nearest, dist(p, s.tile));
      }
      total += nearest;
      farthest = Math.max(farthest, nearest);
    }
    min = Math.min(min, total);
    max = Math.max(max, total);
    sum += total;
    farMissing += Math.max(0, far - farthest);
  }
  let crowding = 0;
  let offTerrain = 0;
  for (let i = 0; i < spots.length; i++) {
    const a = centre(map, spots[i]!.tile);
    if (map.tiles[spots[i]!.tile] !== SPOT_TERRAIN[spots[i]!.resource]) offTerrain++;
    for (let j = i + 1; j < spots.length; j++) {
      crowding += Math.max(0, MIN_GAP - distance(a, centre(map, spots[j]!.tile)));
    }
  }
  const spread = max - min;
  return {
    score:
      10 * spread +
      10 * farMissing +
      5 * crowding +
      0.3 * offTerrain +
      (MEAN_WEIGHT * sum) / players,
    spread,
    farOk: farMissing === 0,
  };
}

function anneal(
  map: MapData,
  players: number,
  candidates: number[],
  count: number,
  dist: Distance,
  random: () => number,
): Layout {
  const pick = <T>(items: readonly T[]) => items[Math.floor(random() * items.length)]!;
  const candidateSet = new Set(candidates);
  let spots: Spot[] = Array.from({ length: count }, (_, i) => ({
    tile: pick(candidates),
    resource: RESOURCES[i % RESOURCES.length]!,
  }));
  let current = score(map, players, spots, dist).score;
  let best = { spots, score: current };
  const started = Date.now();
  const startTemp = map.width / 4;
  for (let step = 0; ; step++) {
    const progress = (Date.now() - started) / SEARCH_MS;
    if (progress >= 1) break;
    const temp = startTemp * Math.pow(0.002, progress);
    const next = spots.map((s) => ({ ...s }));
    const spot = pick(next);
    const move = random();
    if (move < 0.15) {
      // Change the resource, keeping at least one spot of each.
      const resource = pick(RESOURCES);
      if (next.filter((s) => s.resource === spot.resource).length > 1) spot.resource = resource;
    } else if (move < 0.35) {
      spot.tile = pick(candidates);
    } else {
      spot.tile = nearbyTile(map, spot.tile, Math.max(1, Math.round(3 * (1 - progress))), random);
      if (!candidateSet.has(spot.tile)) continue;
    }
    const value = score(map, players, next, dist).score;
    if (value <= current || random() < Math.exp((current - value) / temp)) {
      spots = next;
      current = value;
      if (value < best.score) best = { spots, score: value };
    }
  }
  return { spots: best.spots, score: best.score, spreadHours: Infinity, farOk: false };
}

/** Refines a layout on the real routes armies walk (the grid overestimates diagonals). */
function polish(
  map: MapData,
  castles: Vec2[],
  candidates: number[],
  layout: Layout,
  random: () => number,
): void {
  const cache = new Map<number, number[]>();
  const real: Distance = (player, tile) => {
    let row = cache.get(tile);
    if (!row) {
      const to = centre(map, tile);
      row = castles.map((c) => {
        const path = findPath(map, c, to);
        return path ? pathLength(path) : Infinity;
      });
      cache.set(tile, row);
    }
    return row[player]!;
  };
  const players = castles.length;
  const candidateSet = new Set(candidates);
  let current = score(map, players, layout.spots, real);
  for (let i = 0; i < POLISH_MOVES; i++) {
    const next = layout.spots.map((s) => ({ ...s }));
    const spot = next[Math.floor(random() * next.length)]!;
    spot.tile = nearbyTile(map, spot.tile, 1 + Math.floor(random() * 2), random);
    if (!candidateSet.has(spot.tile)) continue;
    const value = score(map, players, next, real);
    if (value.score < current.score) {
      layout.spots = next;
      current = value;
    }
  }
  layout.score = current.score;
  layout.spreadHours = (current.spread / map.width) * CROSS_MAP_HOURS;
  layout.farOk = current.farOk;
}

function nearbyTile(map: MapData, tile: number, radius: number, random: () => number): number {
  const x = (tile % map.width) + Math.round((random() * 2 - 1) * radius);
  const y = Math.floor(tile / map.width) + Math.round((random() * 2 - 1) * radius);
  if (x < 0 || y < 0 || x >= map.width || y >= map.height) return tile;
  return y * map.width + x;
}

/** Real walking distance (tiles) from each castle to its nearest spot of each resource. */
export function spotReach(map: MapData, castles: Vec2[], spots: SpotPlacement[]): SpotReach {
  return castles.map((c) => {
    const reach = { wood: Infinity, stone: Infinity, gold: Infinity };
    for (const s of spots) {
      const path = findPath(map, c, s.position);
      if (path) reach[s.resource] = Math.min(reach[s.resource], pathLength(path));
    }
    return reach;
  });
}
