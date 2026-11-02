import { TileType, type MapData } from '@vectoria/shared';
import { createRandom } from './random';

const TILE_SIZE = 32;
const SMOOTHING_PASSES = 4;

/** Smoothed value noise → terrain bands, joined into one landmass. Placeholder until real world generation exists. */
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
            const nx = x + dx;
            const ny = y + dy;
            if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
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

  const tiles = Array.from(field, (value): TileType => {
    const h = (value - min) / range;
    if (h < 0.35) return TileType.Water;
    if (h < 0.62) return TileType.Grass;
    if (h < 0.8) return TileType.Forest;
    return TileType.Mountain;
  });

  joinLand(tiles, width, height);
  return { width, height, tileSize: TILE_SIZE, tiles };
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
        const d = Math.abs((to % width) - fx) + Math.abs(Math.floor(to / width) - fy);
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

/** Tiles of a straight-ish 4-connected path from `from` to `to`, `BRIDGE_WIDTH` tiles wide. */
function bridge(from: number, to: number, width: number, height: number): number[] {
  let x = from % width;
  let y = Math.floor(from / width);
  const tx = to % width;
  const ty = Math.floor(to / width);
  const path: number[] = [];
  const add = (px: number, py: number) => {
    for (let o = 0; o < BRIDGE_WIDTH; o++) {
      // Widen sideways: below for horizontal runs, right of vertical runs (clamped to the map).
      const wx = Math.min(width - 1, px + (py === ty ? 0 : o));
      const wy = Math.min(height - 1, py + (py === ty ? o : 0));
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
        x > 0 ? i - 1 : -1,
        x < width - 1 ? i + 1 : -1,
        y > 0 ? i - width : -1,
        y < height - 1 ? i + width : -1,
      ]) {
        if (n < 0 || seen[n] || tiles[n] === TileType.Water) continue;
        seen[n] = 1;
        stack.push(n);
      }
    }
    components.push(members);
  }
  return components;
}
