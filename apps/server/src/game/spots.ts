import {
  CROSS_MAP_HOURS,
  distanceField,
  findPath,
  mapDistance,
  pathLength,
  SPOT_BALANCE_TOLERANCE_HOURS,
  SPOT_FAR_HOURS,
  SPOT_FAR_KINDS,
  SPOT_GAP_HOURS,
  SPOT_HOLE_HOURS,
  SPOT_KINDS,
  SPOT_MAX_HOURS,
  SPOT_NEAR_HOURS,
  SPOT_SAME_GAP_HOURS,
  wrapCoord,
  wrapDelta,
  type MapData,
  type SpotKind,
  type Vec2,
} from '@vectoria/shared';

/** Spots keep this far (tiles) from castles, outposts and chests (the hour rules come on top). */
const MIN_GAP = 2;
/**
 * Search budget per layout attempt in annealing steps (more castles, more to balance), and
 * attempts before the best one is taken. Counted in steps, not time, so a seed gives the same
 * layout on every machine (what was checked offline is what a running game gets).
 */
const SEARCH_STEPS = 100_000;
const SEARCH_STEPS_PER_CASTLE = 6_000;
const ATTEMPTS = 4;
/**
 * The search stops early once this many attempts kept every hard rule. A running game's re-layout
 * (during server start, under the deploy health check) takes the first valid one (`quick`).
 */
const VALID_ATTEMPTS = 2;
/** Real-route polish: local moves tried on the best grid layout. */
const POLISH_MOVES = 300;
/** Worst ratio of an 8-way grid walk to the straight line: at 22.5°, (1 + (√2 − 1)·tan) / sec. */
const GRID_EXCESS = 1.0824;
/** Search weight of one tile of rule violation against the soft score. */
const HARD = 50;
/** Rule violation (tiles) per land tile out of `SPOT_HOLE_HOURS` reach. */
const HOLE_TILE = 0.5;
/** Soft score: each spot costs a little, so spare ones go; a weak pull towards short walks. */
const SPOT_COST = 0.3;
const MEAN_WEIGHT = 0.1;
/** Soft score: castles whose far kind is wood and those whose is gold should be about as many. */
const FAR_SPLIT_WEIGHT = 0.5;
/** Spot of a kind beyond every reach; keeps sums finite while a kind is missing. */
const MISSING = 1e4;

export interface SpotPlacement {
  resource: SpotKind;
  position: Vec2;
}

export interface SpotLayout {
  spots: SpotPlacement[];
  /** All hard rules kept on the real routes armies walk. */
  valid: boolean;
  /** Largest minus smallest total walk to the four kinds, in game hours (real routes). */
  spreadHours: number;
  /** Castles with no room for a valid layout around them (see `crampedCastles`). */
  cramped: number[];
}

/** Per castle: walking distance (tiles) to its nearest spot of each kind. */
export type SpotReach = Record<SpotKind, number>[];

const centre = (map: MapData, i: number): Vec2 => ({
  x: (i % map.width) + 0.5,
  y: Math.floor(i / map.width) + 0.5,
});
const tileOf = (map: MapData, p: Vec2) => Math.floor(p.y) * map.width + Math.floor(p.x);

/** Tiles walked in `hours` of game time on this map. */
export function tilesFor(map: MapData, hours: number): number {
  return (hours * map.width) / CROSS_MAP_HOURS;
}

/**
 * Lays out resource spots (wood, stone, gold, trader) so that every castle has, on the real
 * routes armies walk: all spots at least `SPOT_NEAR_HOURS` away; its nearest wood or gold
 * `SPOT_FAR_HOURS`–`SPOT_MAX_HOURS` away and its nearest of the other three kinds under
 * `SPOT_FAR_HOURS`. Spots keep `SPOT_GAP_HOURS` apart (`SPOT_SAME_GAP_HOURS` within a kind), and
 * no land tile lies farther than `SPOT_HOLE_HOURS` from a spot, castle or outpost. Softly, every
 * castle's four walks add up to about the same.
 *
 * The rules are checked on the 8-way grid with margins that make them hold on real routes too
 * (a real route is never longer than the grid walk, nor shorter than it over `GRID_EXCESS`).
 * Simulated annealing (rule violations weigh far more than the soft score) from a greedy seed,
 * then a polish on real routes that never breaks a rule. `land` are the tiles spots may use and
 * must cover, `taken` the sites they keep `MIN_GAP` from, `anchors` (castles and outposts) the
 * sites that count as filled for the hole rule.
 */
export function placeBalancedSpots(
  map: MapData,
  castles: Vec2[],
  land: Vec2[],
  taken: Vec2[],
  anchors: Vec2[],
  random: () => number,
  options: { force?: boolean; quick?: boolean } = {},
): SpotLayout {
  const ctx = context(map, castles, land, taken, anchors);
  const cramped = crampedCastles(ctx);
  if (cramped.length > 0 && !options.force) {
    return { spots: [], valid: false, spreadHours: Infinity, cramped };
  }
  let best: { layout: Layout; real: Evaluation } | null = null;
  let valid = 0;
  for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
    const layout = anneal(ctx, random);
    const real = polish(ctx, layout, random);
    if (!best || better(real, best.real)) best = { layout, real };
    if (real.hard === 0) valid++;
    if (
      best.real.hard === 0 &&
      (best.real.spread <= ctx.tolerance || valid >= (options.quick ? 1 : VALID_ATTEMPTS))
    )
      break;
  }
  const { layout, real } = best!;
  return {
    spots: layout.spots.map((s) => ({ resource: s.kind, position: centre(map, s.tile) })),
    valid: real.hard === 0,
    spreadHours: (real.spread / map.width) * CROSS_MAP_HOURS,
    cramped,
  };
}

/**
 * Castles whose surroundings cannot hold a valid layout at all: no room for three spots
 * `SPOT_GAP_HOURS` apart under `SPOT_FAR_HOURS` (stone, trader and the near one of wood and gold),
 * or no tile for the far kind. Cheap, so castle placements can be thrown away before searching.
 */
export function crampedCastles(ctx: Context): number[] {
  const { map } = ctx;
  const cramped: number[] = [];
  ctx.castles.forEach((_, p) => {
    const ring = ctx.nearRing[p]!.map((t) => centre(map, t));
    const roomy = ring.some((a) =>
      ring.some(
        (b) =>
          mapDistance(map, a, b) >= ctx.gap &&
          ring.some((c) => mapDistance(map, a, c) >= ctx.gap && mapDistance(map, b, c) >= ctx.gap),
      ),
    );
    if (!roomy || ctx.farRing[p]!.length === 0) cramped.push(p);
  });
  return cramped;
}

/** Distance limits (tiles) a layout must keep, per castle. */
interface Bounds {
  /** Every spot at least this far from every castle. */
  min: number;
  /** The near kinds below this. */
  near: number;
  /** The far kind at least this far … */
  far: number;
  /** … and at most this far. */
  max: number;
}

export interface Context {
  map: MapData;
  castles: Vec2[];
  /** Grid walking distance (tiles) from each castle to every tile. */
  grid: Float64Array[];
  candidates: number[];
  candidateSet: Set<number>;
  /** Per castle: candidates for a near kind and for its far kind (grid bounds). */
  nearRing: number[][];
  farRing: number[][];
  /** Land tiles that the hole rule covers, and per tile how many anchors already reach it. */
  coverTiles: number[];
  coverMask: Uint8Array;
  anchorCover: Uint16Array;
  /** Tiles within `SPOT_HOLE_HOURS` (grid) of a candidate; filled on first use. */
  reachCache: Map<number, Int32Array>;
  holeLimit: number;
  gap: number;
  sameGap: number;
  tolerance: number;
  /** Bounds on the grid during the search (margins for real routes) and on real routes. */
  gridBounds: Bounds;
  realBounds: Bounds;
}

function context(
  map: MapData,
  castles: Vec2[],
  land: Vec2[],
  taken: Vec2[],
  anchors: Vec2[],
): Context {
  const grid = castles.map((c) => distanceField(map, c));
  const realBounds: Bounds = {
    min: tilesFor(map, SPOT_NEAR_HOURS),
    near: tilesFor(map, SPOT_FAR_HOURS),
    far: tilesFor(map, SPOT_FAR_HOURS),
    max: tilesFor(map, SPOT_MAX_HOURS),
  };
  // Real ≤ grid ≤ real × GRID_EXCESS: upper limits hold as they are, lower ones need the margin.
  const gridBounds: Bounds = {
    min: realBounds.min * GRID_EXCESS,
    near: realBounds.near,
    far: realBounds.far * GRID_EXCESS,
    max: realBounds.max,
  };
  const candidates = land
    .filter((p) => taken.every((t) => mapDistance(map, t, p) >= MIN_GAP))
    .map((p) => tileOf(map, p))
    .filter((tile) => grid.every((f) => f[tile]! >= gridBounds.min));
  if (candidates.length < SPOT_KINDS.length) throw new Error('Too little free land for spots');
  const nearRing = grid.map((f) => candidates.filter((t) => f[t]! < gridBounds.near));
  const farRing = grid.map((f) =>
    candidates.filter((t) => f[t]! >= gridBounds.far && f[t]! <= gridBounds.max),
  );

  const holeLimit = tilesFor(map, SPOT_HOLE_HOURS);
  const coverTiles = land.map((p) => tileOf(map, p));
  const coverMask = new Uint8Array(map.tiles.length);
  for (const t of coverTiles) coverMask[t] = 1;
  const anchorCover = new Uint16Array(map.tiles.length);
  for (const a of anchors) {
    const field = distanceField(map, a, holeLimit);
    for (let i = 0; i < field.length; i++) if (field[i]! <= holeLimit) anchorCover[i]!++;
  }
  return {
    map,
    castles,
    grid,
    candidates,
    candidateSet: new Set(candidates),
    nearRing,
    farRing,
    coverTiles,
    coverMask,
    anchorCover,
    reachCache: new Map(),
    holeLimit,
    gap: tilesFor(map, SPOT_GAP_HOURS),
    sameGap: tilesFor(map, SPOT_SAME_GAP_HOURS),
    tolerance: tilesFor(map, SPOT_BALANCE_TOLERANCE_HOURS),
    gridBounds,
    realBounds,
  };
}

/** Tiles within the hole limit of `tile`. */
function reach(ctx: Context, tile: number): Int32Array {
  let tiles = ctx.reachCache.get(tile);
  if (!tiles) {
    const field = distanceField(ctx.map, centre(ctx.map, tile), ctx.holeLimit);
    const list: number[] = [];
    for (let i = 0; i < field.length; i++) if (field[i]! <= ctx.holeLimit) list.push(i);
    tiles = Int32Array.from(list);
    ctx.reachCache.set(tile, tiles);
  }
  return tiles;
}

interface Spot {
  tile: number;
  kind: SpotKind;
}

/** Spots plus how often each tile is reached, kept up to date for the hole rule. */
class Layout {
  spots: Spot[] = [];
  private readonly ctx: Context;
  private readonly cover: Uint16Array;
  /** Covered tiles that lie out of reach of every spot and anchor. */
  holes: number;

  constructor(ctx: Context) {
    this.ctx = ctx;
    this.cover = Uint16Array.from(ctx.anchorCover);
    this.holes = ctx.coverTiles.filter((t) => this.cover[t] === 0).length;
  }

  private mark(tile: number, delta: 1 | -1): void {
    for (const t of reach(this.ctx, tile)) {
      const before = this.cover[t]!;
      this.cover[t] = before + delta;
      if (this.ctx.coverMask[t]) {
        if (delta === 1 && before === 0) this.holes--;
        if (delta === -1 && before === 1) this.holes++;
      }
    }
  }

  /** Tiles out of reach right now (for seeding). */
  holeTiles(): number[] {
    return this.ctx.coverTiles.filter((t) => this.cover[t] === 0);
  }

  add(spot: Spot): void {
    this.spots.push(spot);
    this.mark(spot.tile, 1);
  }

  removeAt(index: number): Spot {
    const [spot] = this.spots.splice(index, 1);
    this.mark(spot!.tile, -1);
    return spot!;
  }

  insertAt(index: number, spot: Spot): void {
    this.spots.splice(index, 0, spot);
    this.mark(spot.tile, 1);
  }

  moveTo(index: number, tile: number): number {
    const spot = this.spots[index]!;
    const from = spot.tile;
    this.mark(from, -1);
    spot.tile = tile;
    this.mark(tile, 1);
    return from;
  }

  clone(): Layout {
    const copy = new Layout(this.ctx);
    for (const s of this.spots) copy.add({ ...s });
    return copy;
  }
}

interface Evaluation {
  /** Rule violation in tiles (0 = every hard rule kept). */
  hard: number;
  soft: number;
  spread: number;
  /** Per castle: its violation and the kind that serves as its far one. */
  castleHard: number[];
  far: SpotKind[];
}

/** Per castle: walking distance (tiles) to every tile, filled at least for the spots' tiles. */
type Distances = readonly ArrayLike<number>[];

const better = (a: Evaluation, b: Evaluation) =>
  a.hard < b.hard - 1e-9 || (Math.abs(a.hard - b.hard) <= 1e-9 && a.soft < b.soft);

/** Module-local copies: the hot loop below must not go through the shared module's exports. */
const KINDS: readonly SpotKind[] = [...SPOT_KINDS];
const KIND_INDEX: Record<SpotKind, number> = { wood: 0, stone: 1, gold: 2, trader: 3 };
const FAR_INDEX: readonly number[] = SPOT_FAR_KINDS.map((k) => KIND_INDEX[k]);
const nearest = new Float64Array(KINDS.length);

/** Scores a layout: rule violation (tiles) first, then the soft score. The hot loop of the search. */
function evaluate(ctx: Context, layout: Layout, dist: Distances, bounds: Bounds): Evaluation {
  const { spots } = layout;
  const n = spots.length;
  const { width, height } = ctx.map;
  const tiles = new Int32Array(n);
  const kinds = new Int8Array(n);
  const xs = new Float64Array(n);
  const ys = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const t = spots[i]!.tile;
    tiles[i] = t;
    kinds[i] = KIND_INDEX[spots[i]!.kind];
    xs[i] = t % width;
    ys[i] = (t - (t % width)) / width;
  }
  const players = ctx.castles.length;
  const nearLimit = bounds.near - 1e-6; // strictly below: a hair of margin
  let hard = 0;
  const castleHard: number[] = [];
  const far: SpotKind[] = [];
  let min = Infinity;
  let max = -Infinity;
  let sum = 0;
  let farWood = 0;
  for (let p = 0; p < players; p++) {
    const row = dist[p]!;
    nearest.fill(MISSING);
    let tooNear = 0;
    for (let i = 0; i < n; i++) {
      const d = row[tiles[i]!]!;
      const k = kinds[i]!;
      if (d < nearest[k]!) nearest[k] = d;
      if (d < bounds.min) tooNear += bounds.min - d;
    }
    // The far kind is whichever of wood and gold fits better; the rest must be near.
    let bestV = Infinity;
    let bestFar = FAR_INDEX[0]!;
    for (const f of FAR_INDEX) {
      const df = nearest[f]!;
      let v = Math.max(0, bounds.far - df) + Math.max(0, df - bounds.max);
      for (let k = 0; k < KINDS.length; k++) {
        if (k !== f && nearest[k]! > nearLimit) v += nearest[k]! - nearLimit;
      }
      if (v < bestV) {
        bestV = v;
        bestFar = f;
      }
    }
    const v = bestV + tooNear;
    castleHard.push(v);
    far.push(KINDS[bestFar]!);
    hard += v;
    if (bestFar === KIND_INDEX.wood) farWood++;
    let total = 0;
    for (let k = 0; k < KINDS.length; k++) total += nearest[k]!;
    if (total < min) min = total;
    if (total > max) max = total;
    sum += total;
  }
  const gap = ctx.gap;
  const sameGap = ctx.sameGap;
  const reach = Math.max(gap, sameGap);
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const dx = wrapDelta(xs[i]! - xs[j]!, width);
      const dy = wrapDelta(ys[i]! - ys[j]!, height);
      const squared = dx * dx + dy * dy;
      if (squared >= reach * reach) continue;
      const d = Math.sqrt(squared);
      if (d < gap) hard += gap - d;
      if (kinds[i] === kinds[j] && d < sameGap) hard += sameGap - d;
    }
  }
  hard += HOLE_TILE * layout.holes;
  const spread = max - min;
  const soft =
    10 * spread +
    40 * Math.max(0, spread - ctx.tolerance * 0.8) +
    (MEAN_WEIGHT * sum) / players +
    SPOT_COST * n +
    FAR_SPLIT_WEIGHT * Math.abs(2 * farWood - players);
  return { hard: hard < 1e-9 ? 0 : hard, soft, spread, castleHard, far };
}

/** Greedy start: each castle gets its kinds in the right ring, then holes are filled. */
function seed(ctx: Context, random: () => number): Layout {
  const { map, grid } = ctx;
  const layout = new Layout(ctx);
  const players = ctx.castles.length;
  const pick = <T>(items: readonly T[]) => items[Math.floor(random() * items.length)]!;
  const order = shuffle([...Array(players).keys()], random);
  // Alternate wood and gold as the far kind.
  const far: SpotKind[] = [];
  order.forEach((p, i) => (far[p] = SPOT_FAR_KINDS[i % 2]!));
  const conflicts = (tile: number, kind: SpotKind) => {
    let n = 0;
    for (let p = 0; p < players; p++) {
      const d = grid[p]![tile]!;
      if (far[p] === kind ? d < ctx.gridBounds.far : false) n++;
    }
    return n;
  };
  const spacing = (tile: number, kind: SpotKind) => {
    const at = centre(map, tile);
    let room = Infinity;
    for (const s of layout.spots) {
      const d = mapDistance(map, at, centre(map, s.tile));
      room = Math.min(room, s.kind === kind ? d - ctx.sameGap : d - ctx.gap);
    }
    return room;
  };
  const place = (pool: number[], kind: SpotKind) => {
    if (pool.length === 0) return;
    let bestTile = pool[0]!;
    let bestScore = -Infinity;
    for (let k = 0; k < 60; k++) {
      const tile = pick(pool);
      const score = Math.min(spacing(tile, kind), ctx.gap) - 100 * conflicts(tile, kind);
      if (score > bestScore) {
        bestScore = score;
        bestTile = tile;
      }
    }
    layout.add({ tile: bestTile, kind });
  };
  for (const p of order) {
    for (const kind of shuffle([...SPOT_KINDS], random)) {
      const isFar = kind === far[p];
      const has = layout.spots.some((s) => {
        if (s.kind !== kind) return false;
        const d = grid[p]![s.tile]!;
        return isFar ? d >= ctx.gridBounds.far && d <= ctx.gridBounds.max : d < ctx.gridBounds.near;
      });
      if (!has) place(isFar ? ctx.farRing[p]! : ctx.nearRing[p]!, kind);
    }
  }
  // Fill holes: a spot close to a random uncovered tile, of the kind that fits best there.
  for (let guard = 0; guard < 200 && layout.holes > 0; guard++) {
    const hole = centre(map, pick(layout.holeTiles()));
    const pool = ctx.candidates.filter(
      (t) => mapDistance(map, centre(map, t), hole) <= ctx.holeLimit,
    );
    if (pool.length === 0) break;
    const kinds = shuffle([...SPOT_KINDS], random);
    let bestTile = pool[0]!;
    let bestKind = kinds[0]!;
    let bestScore = -Infinity;
    for (let k = 0; k < 40; k++) {
      const tile = pick(pool);
      for (const kind of kinds) {
        const score =
          Math.min(spacing(tile, kind), ctx.gap) -
          100 * conflicts(tile, kind) -
          0.1 * mapDistance(map, centre(map, tile), hole);
        if (score > bestScore) {
          bestScore = score;
          bestTile = tile;
          bestKind = kind;
        }
      }
    }
    layout.add({ tile: bestTile, kind: bestKind });
  }
  return layout;
}

function anneal(ctx: Context, random: () => number): Layout {
  const { map } = ctx;
  const pick = <T>(items: readonly T[]) => items[Math.floor(random() * items.length)]!;
  const dist: Distances = ctx.grid;
  const value = (e: Evaluation) => HARD * e.hard + e.soft;
  const layout = seed(ctx, random);
  let current = evaluate(ctx, layout, dist, ctx.gridBounds);
  let best = { layout: layout.clone(), eval: current };
  const budget = SEARCH_STEPS + SEARCH_STEPS_PER_CASTLE * ctx.castles.length;
  const startTemp = map.width / 4;
  for (let step = 0; step < budget; step++) {
    const progress = step / budget;
    const temp = startTemp * Math.pow(0.002, progress);
    const { spots } = layout;
    let undo: () => void;
    const move = random();
    if (move < 0.3) {
      // Repair: put a spot of some kind into the ring a castle needs it in.
      const violated = current.castleHard.map((v, p) => (v > 0 ? p : -1)).filter((p) => p >= 0);
      const p = violated.length > 0 ? pick(violated) : Math.floor(random() * ctx.castles.length);
      const kind = pick(SPOT_KINDS);
      const ring = kind === current.far[p] ? ctx.farRing[p]! : ctx.nearRing[p]!;
      if (ring.length === 0) continue;
      const tile = pick(ring);
      const same = spots.map((s, i) => (s.kind === kind ? i : -1)).filter((i) => i >= 0);
      if (same.length === 0 || random() < 0.3) {
        layout.add({ tile, kind });
        undo = () => layout.removeAt(layout.spots.length - 1);
      } else {
        const index = pick(same);
        const from = layout.moveTo(index, tile);
        undo = () => layout.moveTo(index, from);
      }
    } else if (move < 0.45) {
      if (spots.length === 0) continue;
      const spot = pick(spots);
      const before = spot.kind;
      spot.kind = pick(SPOT_KINDS);
      undo = () => (spot.kind = before);
    } else if (move < 0.55) {
      if (spots.length < 2) continue;
      const a = pick(spots);
      const b = pick(spots);
      if (a.kind === b.kind) continue;
      [a.kind, b.kind] = [b.kind, a.kind];
      undo = () => ([a.kind, b.kind] = [b.kind, a.kind]);
    } else if (move < 0.85) {
      if (spots.length === 0) continue;
      const index = Math.floor(random() * spots.length);
      const radius = Math.max(1, Math.round(3 * (1 - progress)));
      const tile = nearbyTile(map, spots[index]!.tile, radius, random);
      if (!ctx.candidateSet.has(tile)) continue;
      const from = layout.moveTo(index, tile);
      undo = () => layout.moveTo(index, from);
    } else if (move < 0.9) {
      if (spots.length === 0) continue;
      const index = Math.floor(random() * spots.length);
      const from = layout.moveTo(index, pick(ctx.candidates));
      undo = () => layout.moveTo(index, from);
    } else if (move < 0.95) {
      layout.add({ tile: pick(ctx.candidates), kind: pick(SPOT_KINDS) });
      undo = () => layout.removeAt(layout.spots.length - 1);
    } else {
      if (spots.length <= SPOT_KINDS.length) continue;
      const index = Math.floor(random() * spots.length);
      const removed = layout.removeAt(index);
      undo = () => layout.insertAt(index, removed);
    }
    const next = evaluate(ctx, layout, dist, ctx.gridBounds);
    const delta = value(next) - value(current);
    if (delta <= 0 || random() < Math.exp(-delta / temp)) {
      current = next;
      if (better(next, best.eval)) best = { layout: layout.clone(), eval: next };
    } else {
      undo();
    }
  }
  return best.layout;
}

/**
 * Refines a layout on the real routes armies walk (the grid overestimates diagonals), never
 * letting the rule violation grow; returns the real evaluation.
 */
function polish(ctx: Context, layout: Layout, random: () => number): Evaluation {
  const { map, castles } = ctx;
  const pick = <T>(items: readonly T[]) => items[Math.floor(random() * items.length)]!;
  // Real route lengths, per castle, filled for a tile when a spot first stands there.
  const real = castles.map(() => new Float64Array(map.tiles.length).fill(NaN));
  const measure = (tile: number) => {
    if (!Number.isNaN(real[0]![tile]!)) return;
    const to = centre(map, tile);
    castles.forEach((c, p) => {
      const path = findPath(map, c, to);
      real[p]![tile] = path ? pathLength(path) : Infinity;
    });
  };
  for (const s of layout.spots) measure(s.tile);
  let current = evaluate(ctx, layout, real, ctx.realBounds);
  for (let i = 0; i < POLISH_MOVES && layout.spots.length > 0; i++) {
    let undo: () => void;
    const violated = current.castleHard.map((v, p) => (v > 0 ? p : -1)).filter((p) => p >= 0);
    if (violated.length > 0 && random() < 0.6) {
      // Repair on real routes: bring a spot of some kind into the ring a broken castle needs it
      // in — the castle's own nearest one of that kind moves, or a new one comes.
      const p = pick(violated);
      const kind = pick(SPOT_KINDS);
      const ring = kind === current.far[p] ? ctx.farRing[p]! : ctx.nearRing[p]!;
      if (ring.length === 0) continue;
      const tile = pick(ring);
      measure(tile);
      let index = -1;
      for (let j = 0; j < layout.spots.length; j++) {
        const s = layout.spots[j]!;
        if (s.kind !== kind) continue;
        if (index < 0 || ctx.grid[p]![s.tile]! < ctx.grid[p]![layout.spots[index]!.tile]!) {
          index = j;
        }
      }
      if (index < 0 || random() < 0.3) {
        layout.add({ tile, kind });
        undo = () => layout.removeAt(layout.spots.length - 1);
      } else {
        const from = layout.moveTo(index, tile);
        undo = () => layout.moveTo(index, from);
      }
    } else {
      const index = Math.floor(random() * layout.spots.length);
      const tile = nearbyTile(map, layout.spots[index]!.tile, 1 + Math.floor(random() * 2), random);
      if (!ctx.candidateSet.has(tile)) continue;
      measure(tile);
      const from = layout.moveTo(index, tile);
      undo = () => layout.moveTo(index, from);
    }
    const next = evaluate(ctx, layout, real, ctx.realBounds);
    if (better(next, current)) current = next;
    else undo();
  }
  // Last, drop spots the rules and the balance do without.
  for (let index = layout.spots.length - 1; index >= 0; index--) {
    if (layout.spots.length <= SPOT_KINDS.length) break;
    const removed = layout.removeAt(index);
    const next = evaluate(ctx, layout, real, ctx.realBounds);
    if (better(next, current)) current = next;
    else layout.insertAt(index, removed);
  }
  return current;
}

function nearbyTile(map: MapData, tile: number, radius: number, random: () => number): number {
  const x = wrapCoord((tile % map.width) + Math.round((random() * 2 - 1) * radius), map.width);
  const y = wrapCoord(
    Math.floor(tile / map.width) + Math.round((random() * 2 - 1) * radius),
    map.height,
  );
  return y * map.width + x;
}

function shuffle<T>(items: T[], random: () => number): T[] {
  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [items[i], items[j]] = [items[j]!, items[i]!];
  }
  return items;
}

/** Real walking distance (tiles) from each castle to its nearest spot of each resource. */
export function spotReach(map: MapData, castles: Vec2[], spots: SpotPlacement[]): SpotReach {
  return castles.map((c) => {
    const reach = { wood: Infinity, stone: Infinity, gold: Infinity, trader: Infinity };
    for (const s of spots) {
      const path = findPath(map, c, s.position);
      if (path) reach[s.resource] = Math.min(reach[s.resource], pathLength(path));
    }
    return reach;
  });
}
