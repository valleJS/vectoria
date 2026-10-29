import { TileType, type MapData } from '@vectoria/shared';
import { createRandom } from './random';

const TILE_SIZE = 32;
const SMOOTHING_PASSES = 4;

/** Smoothed value noise → terrain bands. Placeholder until real world generation exists. */
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

  return { width, height, tileSize: TILE_SIZE, tiles };
}
