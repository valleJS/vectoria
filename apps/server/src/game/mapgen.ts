import { TileType, wrapDelta, type MapData } from '@vectoria/shared';
import { createRandom } from './random';

const TILE_SIZE = 32;
const SMOOTHING_PASSES = 4;
/** Share of the map that is sea or lake (the lowest tiles), before rivers. */
const WATER_SHARE = 0.25;
/** One river per this many tiles of map area (at least `MIN_RIVERS`). */
const TILES_PER_RIVER = 600;
const MIN_RIVERS = 2;
/** Rivers start on ground at least this high and run at most this share of the map width. */
const SPRING_LEVEL = 0.6;
const RIVER_MAX_LENGTH = 1.2;
/** A river runs on through lakes it meets until it is at least this share of the width long. */
const RIVER_MIN_LENGTH = 0.6;
/** A ford (land left across the river) after every this many river tiles. */
const FORD_EVERY = 9;
const FORD_LENGTH = 2;

/**
 * Smoothed value noise → terrain bands, rivers from the high ground down to the sea, joined into
 * one landmass. The map wraps at its edges, so smoothing, rivers, islands and bridges run round
 * them too and the terrain continues seamlessly. Placeholder until real world generation exists.
 */
export function generateMap(width: number, height: number, seed: number): MapData {
  const random = createRandom(seed);
  let field = Float32Array.from({ length: width * height }, random);

  for (let pass = 0; pass < SMOOTHING_PASSES; pass++) {
    const next = new Float32Array(field.length);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        let sum = 0;
        let count = 0;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const nx = (x + dx + width) % width;
            const ny = (y + dy + height) % height;
            sum += field[ny * width + nx]!;
            count++;
          }
        }
        next[y * width + x] = sum / count;
      }
    }
    field = next;
  }

  let min = Infinity;
  let max = -Infinity;
  for (const value of field) {
    min = Math.min(min, value);
    max = Math.max(max, value);
  }
  const range = max - min || 1;

  const heights = Array.from(field, (value) => (value - min) / range);
  // A share of the map rather than a fixed height, so every seed gets about as much water.
  const waterLevel = [...heights].sort((a, b) => a - b)[Math.floor(heights.length * WATER_SHARE)]!;
  const tiles = heights.map((h): TileType => {
    if (h < waterLevel) return TileType.Water;
    if (h < 0.62) return TileType.Grass;
    if (h < 0.8) return TileType.Forest;
    return TileType.Mountain;
  });

  carveRivers(tiles, heights, width, height, createRandom(seed ^ 0x51ae5));
  joinLand(tiles, width, height);
  return { width, height, tileSize: TILE_SIZE, tiles };
}

/**
 * Rivers: each springs on high ground and winds downhill (the height gradient, some momentum and
 * a random wobble) until it reaches the sea or a lake, or runs out of length. The bed is
 * 4-connected water one tile wide, so it really splits the land, with a ford of land left every
 * `FORD_EVERY` tiles so walking does not need long detours (`joinLand` bridges the rest).
 */
function carveRivers(
  tiles: TileType[],
  heights: number[],
  width: number,
  height: number,
  random: () => number,
): void {
  const count = Math.max(MIN_RIVERS, Math.round((width * height) / TILES_PER_RIVER));
  const wrap = (v: number, size: number) => ((Math.floor(v) % size) + size) % size;
  const heightAt = (x: number, y: number) => heights[wrap(y, height) * width + wrap(x, width)]!;
  const springs = heights.flatMap((h, i) => (h >= SPRING_LEVEL ? [i] : []));
  for (let r = 0; r < count && springs.length > 0; r++) {
    const spring = springs[Math.floor(random() * springs.length)]!;
    let x = (spring % width) + 0.5;
    let y = Math.floor(spring / width) + 0.5;
    let angle = random() * Math.PI * 2;
    let previous = -1;
    let carved = 0;
    const maxSteps = Math.round(width * RIVER_MAX_LENGTH * 2);
    const minTiles = Math.round(width * RIVER_MIN_LENGTH);
    const carve = (tx: number, ty: number) => {
      const i = wrap(ty, height) * width + wrap(tx, width);
      if (i === previous) return false;
      previous = i;
      const reachedWater = tiles[i] === TileType.Water;
      carved++;
      if (carved % FORD_EVERY >= FORD_LENGTH || carved < FORD_EVERY) tiles[i] = TileType.Water;
      return reachedWater && carved >= minTiles;
    };
    for (let step = 0; step < maxSteps; step++) {
      // Downhill: the height gradient pulls the heading round, momentum and wobble keep it winding.
      const gx = heightAt(x + 1, y) - heightAt(x - 1, y);
      const gy = heightAt(x, y + 1) - heightAt(x, y - 1);
      if (gx !== 0 || gy !== 0) {
        const downhill = Math.atan2(-gy, -gx);
        angle += wrapDelta(downhill - angle, Math.PI * 2) * 0.12;
      }
      angle += (random() - 0.5) * 0.5;
      const nx = x + Math.cos(angle) * 0.5;
      const ny = y + Math.sin(angle) * 0.5;
      // A diagonal step also takes the tile beside it, so the bed stays 4-connected.
      if (Math.floor(nx) !== Math.floor(x) && Math.floor(ny) !== Math.floor(y)) {
        if (carve(Math.floor(nx), Math.floor(y))) break;
      }
      x = nx;
      y = ny;
      if (carve(Math.floor(x), Math.floor(y))) break;
    }
  }
}

/** Land areas smaller than this many tiles sink; larger ones get a land bridge. */
const MIN_ISLAND_TILES = 12;
/** Bridges are this many tiles wide, so the rounded coastline keeps them open. */
const BRIDGE_WIDTH = 2;

/**
 * Makes all land one 4-connected mass, so every tile can be reached on foot: small islands become
 * water, bigger ones are joined to the mainland (largest first) by a grass bridge along the
 * shortest gap. Deterministic, so the map still follows from the seed alone.
 */
function joinLand(tiles: TileType[], width: number, height: number): void {
  const components = landComponents(tiles, width, height).sort((a, b) => b.length - a.length);
  const [main = [], ...rest] = components;
  // Sink small islands first, so no bridge built later runs over a tile that then sinks.
  for (const island of rest) {
    if (island.length < MIN_ISLAND_TILES) for (const i of island) tiles[i] = TileType.Water;
  }
  const mainland = new Set(main);
  for (const island of rest) {
    if (island.length < MIN_ISLAND_TILES) continue;
    // Closest pair of tiles between the island and the mainland grown so far.
    let best = { from: island[0]!, to: main[0]!, d: Infinity };
    for (const from of island) {
      const fx = from % width;
      const fy = Math.floor(from / width);
      for (const to of mainland) {
        const d =
          Math.abs(wrapDelta((to % width) - fx, width)) +
          Math.abs(wrapDelta(Math.floor(to / width) - fy, height));
        if (d < best.d) best = { from, to, d };
      }
    }
    for (const i of bridge(best.from, best.to, width, height)) {
      if (tiles[i] === TileType.Water) tiles[i] = TileType.Grass;
      mainland.add(i);
    }
    for (const i of island) mainland.add(i);
  }
}

/**
 * Tiles of a straight-ish 4-connected path from `from` to `to` (the short way round the wrapped
 * map), `BRIDGE_WIDTH` tiles wide.
 */
function bridge(from: number, to: number, width: number, height: number): number[] {
  let x = from % width;
  let y = Math.floor(from / width);
  // Walk in unwrapped coordinates towards the nearest copy of the target; fold when adding.
  const tx = x + wrapDelta((to % width) - x, width);
  const ty = y + wrapDelta(Math.floor(to / width) - y, height);
  const path: number[] = [];
  const add = (px: number, py: number) => {
    for (let o = 0; o < BRIDGE_WIDTH; o++) {
      // Widen sideways: below for horizontal runs, right of vertical runs.
      const wx = (((px + (py === ty ? 0 : o)) % width) + width) % width;
      const wy = (((py + (py === ty ? o : 0)) % height) + height) % height;
      path.push(wy * width + wx);
    }
  };
  add(x, y);
  // Alternate steps toward the target so the bridge runs diagonally instead of in an L.
  while (x !== tx || y !== ty) {
    const dx = tx - x;
    const dy = ty - y;
    if (Math.abs(dx) >= Math.abs(dy)) x += Math.sign(dx);
    else y += Math.sign(dy);
    add(x, y);
  }
  return path;
}

/** Index lists of the 4-connected land areas. */
function landComponents(tiles: TileType[], width: number, height: number): number[][] {
  const seen = new Uint8Array(tiles.length);
  const components: number[][] = [];
  for (let start = 0; start < tiles.length; start++) {
    if (seen[start] || tiles[start] === TileType.Water) continue;
    const members: number[] = [];
    const stack = [start];
    seen[start] = 1;
    while (stack.length > 0) {
      const i = stack.pop()!;
      members.push(i);
      const x = i % width;
      const y = Math.floor(i / width);
      for (const n of [
        y * width + ((x + width - 1) % width),
        y * width + ((x + 1) % width),
        ((y + height - 1) % height) * width + x,
        ((y + 1) % height) * width + x,
      ]) {
        if (seen[n] || tiles[n] === TileType.Water) continue;
        seen[n] = 1;
        stack.push(n);
      }
    }
    components.push(members);
  }
  return components;
}
