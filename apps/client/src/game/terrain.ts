import { TileType, type MapData } from '@vectoria/shared';
import { CanvasSource, Container, Graphics, Sprite, Texture, TilingSprite } from 'pixi.js';
import type { ArtTexture, MapArt } from '../art/textures';
import {
  blur,
  contours,
  createField,
  distanceToEdge,
  fbm,
  hash2,
  smooth,
  type Field,
} from './fields';
import { INK } from './palette';

// Draws the static map once per MapData. The tile grid is resampled into smooth fields: a
// blurred, noise-perturbed land field gives an organic coastline; a distance field drives water
// depth colours and offshore ripple lines. Colours go into a small bitmap that the GPU upscales
// (soft watercolour washes); coast and ripples are crisp vector lines; trees, mountains and
// other details are sprites of the shared SVG art. All randomness is hashed from positions.

/** Sea margin around the map, in tiles. */
export const SEA_MARGIN_TILES = 3;
/** Field samples per tile. */
const K = 6;

type Rgb = [number, number, number];
const hex = (value: string): Rgb => [
  parseInt(value.slice(1, 3), 16),
  parseInt(value.slice(3, 5), 16),
  parseInt(value.slice(5, 7), 16),
];
const SHALLOW = hex('#a4d9cf');
const MID_WATER = hex('#6eb2c3');
const DEEP = hex('#4a8aab');
const SAND = hex('#ecdcaa');
const GRASS = hex('#bed37f');
const MEADOW = hex('#a8c66f');
const FOREST = hex('#8db564');
const ROCK = hex('#cdb98f');

const mix = (a: Rgb, b: Rgb, t: number): Rgb => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
  a[2] + (b[2] - a[2]) * t,
];
const smoothstep = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

export interface Terrain {
  root: Container;
  /** Hides details (trees, peaks, grass) within `radius` world px of each point. */
  clearAround(points: { x: number; y: number; radius: number }[]): void;
}

export function buildTerrain(map: MapData, art: MapArt): Terrain {
  const { width, height, tileSize: T, tiles } = map;
  const gw = (width + SEA_MARGIN_TILES * 2) * K;
  const gh = (height + SEA_MARGIN_TILES * 2) * K;
  const typeAt = (tx: number, ty: number): TileType =>
    tx < 0 || ty < 0 || tx >= width || ty >= height
      ? TileType.Water
      : (tiles[ty * width + tx] ?? TileType.Water);

  // Indicator fields per terrain type, sampled from the tile grid.
  const land = createField(gw, gh);
  const forest = createField(gw, gh);
  const rock = createField(gw, gh);
  for (let j = 0; j < gh; j++) {
    const ty = Math.floor(j / K) - SEA_MARGIN_TILES;
    for (let i = 0; i < gw; i++) {
      const type = typeAt(Math.floor(i / K) - SEA_MARGIN_TILES, ty);
      const k = j * gw + i;
      land.data[k] = type === TileType.Water ? 0 : 1;
      forest.data[k] = type === TileType.Forest ? 1 : 0;
      rock.data[k] = type === TileType.Mountain ? 1 : 0;
    }
  }
  const landSmooth = blur(land, Math.round(K * 0.45));
  const forestSmooth = blur(forest, Math.round(K * 0.6));
  const rockSmooth = blur(rock, Math.round(K * 0.6));

  // Perturb the coast with noise so it reads as drawn, not as a blurred grid.
  const coastField: Field = createField(gw, gh);
  const inside = new Uint8Array(gw * gh);
  for (let j = 0; j < gh; j++) {
    for (let i = 0; i < gw; i++) {
      const k = j * gw + i;
      const v = landSmooth.data[k]! + (fbm(i / (K * 1.4), j / (K * 1.4), 3) - 0.5) * 0.3;
      coastField.data[k] = v;
      inside[k] = v > 0.5 ? 1 : 0;
    }
  }
  // Signed distance to the coast in tiles: positive at sea, negative on land.
  const raw = distanceToEdge(inside, gw, gh);
  const signed = createField(gw, gh);
  for (let k = 0; k < raw.length; k++) signed.data[k] = ((inside[k] ? -1 : 1) * raw[k]!) / K;
  const distance = blur(signed, 1, 1);
  const distanceAt = (x: number, y: number) => {
    const i = Math.round((x / T + SEA_MARGIN_TILES) * K - 0.5);
    const j = Math.round((y / T + SEA_MARGIN_TILES) * K - 0.5);
    if (i < 0 || j < 0 || i >= gw || j >= gh) return 99;
    return distance.data[j * gw + i]!;
  };

  // Colour bitmap.
  const canvas = document.createElement('canvas');
  canvas.width = gw;
  canvas.height = gh;
  const ctx = canvas.getContext('2d')!;
  const image = ctx.createImageData(gw, gh);
  for (let j = 0; j < gh; j++) {
    for (let i = 0; i < gw; i++) {
      const k = j * gw + i;
      const d = distance.data[k]!;
      const grain = (fbm(i / K, j / K, 11) - 0.5) * 0.14;
      let color: Rgb;
      if (d > 0) {
        const depth = smoothstep(0, 2.6, d);
        color =
          depth < 0.4
            ? mix(SHALLOW, MID_WATER, depth / 0.4)
            : mix(MID_WATER, DEEP, (depth - 0.4) / 0.6);
      } else {
        const f = forestSmooth.data[k]!;
        const r = rockSmooth.data[k]!;
        const meadow = mix(
          GRASS,
          MEADOW,
          smoothstep(0.35, 0.75, fbm(i / (K * 3), j / (K * 3), 13)),
        );
        color = mix(mix(meadow, FOREST, smoothstep(0.15, 0.7, f)), ROCK, smoothstep(0.15, 0.7, r));
        color = mix(SAND, color, smoothstep(0.08, 0.32, -d));
      }
      const o = k * 4;
      image.data[o] = color[0] * (1 + grain);
      image.data[o + 1] = color[1] * (1 + grain);
      image.data[o + 2] = color[2] * (1 + grain);
      image.data[o + 3] = 255;
    }
  }
  ctx.putImageData(image, 0, 0);

  const root = new Container();
  const origin = -SEA_MARGIN_TILES * T;
  const worldW = gw * (T / K);
  const worldH = gh * (T / K);
  const washes = new Sprite(new Texture({ source: new CanvasSource({ resource: canvas }) }));
  washes.texture.source.scaleMode = 'linear';
  washes.position.set(origin, origin);
  washes.setSize(worldW, worldH);
  root.addChild(washes);

  const paper = new TilingSprite({ texture: paperGrain(), width: worldW, height: worldH });
  paper.position.set(origin, origin);
  paper.blendMode = 'multiply';
  paper.alpha = 0.5;
  root.addChild(paper);

  // Vector lines: offshore ripples, then the inked coastline.
  const toWorld = (points: number[]) => points.map((p) => (p + 0.5) * (T / K) + origin);
  const lines = new Graphics();
  const strokeLevel = (field: Field, level: number, style: Parameters<Graphics['stroke']>[0]) => {
    for (const line of contours(field, level)) {
      if (line.points.length < 8) continue;
      const pts = toWorld(smooth(line, 3).points);
      lines.poly(pts, line.closed).stroke(style);
    }
  };
  strokeLevel(distance, 0.9, { width: 1.2, color: 0xffffff, alpha: 0.28, join: 'round' });
  strokeLevel(distance, 0.45, { width: 1.5, color: 0xffffff, alpha: 0.5, join: 'round' });
  strokeLevel(coastField, 0.5, { width: 2.4, color: INK, join: 'round' });
  root.addChild(lines);

  // Details, painted back to front.
  const details: Sprite[] = [];
  const place = (a: ArtTexture, x: number, y: number, worldWidth: number, flip = false) => {
    const sprite = new Sprite(a.texture);
    sprite.anchor.set(a.anchor.x / a.width, a.anchor.y / a.height);
    const scale = worldWidth / a.width;
    sprite.scale.set(flip ? -scale : scale, scale);
    sprite.position.set(x, y);
    details.push(sprite);
  };
  const pick = <T>(items: T[], r: number): T => items[Math.floor(r * items.length) % items.length]!;

  for (let ty = 0; ty < height; ty++) {
    for (let tx = 0; tx < width; tx++) {
      const type = typeAt(tx, ty);
      if (type === TileType.Forest) {
        const pines = fbm(tx / 5, ty / 5, 21) > 0.58;
        for (let n = 0; n < 4; n++) {
          const x = (tx + 0.5 + (hash2(tx, ty, 10 + n) - 0.5) * 0.95) * T;
          const y = (ty + 0.5 + (hash2(tx, ty, 20 + n) - 0.5) * 0.95) * T;
          if (distanceAt(x, y) > -0.2) continue;
          const r = hash2(tx, ty, 30 + n);
          const size = T * (0.95 + hash2(tx, ty, 40 + n) * 0.35);
          if (pines) place(pick(art.conifers, r), x, y, size * 0.85);
          else if (r > 0.9) place(pick(art.autumn, r * 7), x, y, size, r > 0.95);
          else place(pick(art.broadleaves, r * 3), x, y, size, hash2(tx, ty, 50 + n) > 0.5);
        }
      } else if (type === TileType.Mountain) {
        const x = (tx + 0.5 + (hash2(tx, ty, 60) - 0.5) * 0.35) * T;
        const y = (ty + 0.75 + (hash2(tx, ty, 61) - 0.5) * 0.25) * T;
        if (distanceAt(x, y) > -0.3 || hash2(tx, ty, 62) < 0.08) continue;
        const r = hash2(tx, ty, 63);
        const snowy = fbm(tx / 4, ty / 4, 64) > 0.55;
        const size = T * (2.1 + hash2(tx, ty, 65) * 0.5);
        place(pick(snowy ? art.snowyMountains : art.mountains, r), x, y, size, r > 0.5);
      } else if (type === TileType.Grass) {
        for (let n = 0; n < 2; n++) {
          const x = (tx + 0.5 + (hash2(tx, ty, 70 + n) - 0.5) * 0.9) * T;
          const y = (ty + 0.5 + (hash2(tx, ty, 80 + n) - 0.5) * 0.9) * T;
          if (distanceAt(x, y) > -0.25) continue;
          const r = hash2(tx, ty, 90 + n);
          if (r > 0.8) place(art.tuft, x, y, T * 0.6, r > 0.9);
          else if (r > 0.835) place(pick(art.flowers, hash2(tx, ty, 95 + n)), x, y, T * 0.55);
          else if (r < 0.03) place(pick(art.broadleaves, r * 33), x, y, T * 1.05);
        }
      }
    }
  }
  // Waves and the odd ship on open water, including the margin.
  let ships = 0;
  for (let ty = -SEA_MARGIN_TILES; ty < height + SEA_MARGIN_TILES; ty++) {
    for (let tx = -SEA_MARGIN_TILES; tx < width + SEA_MARGIN_TILES; tx++) {
      const x = (tx + 0.5 + (hash2(tx, ty, 100) - 0.5) * 0.7) * T;
      const y = (ty + 0.5 + (hash2(tx, ty, 101) - 0.5) * 0.7) * T;
      const d = distanceAt(x, y);
      if (d > 2.8 && ships < 3 && hash2(tx, ty, 102) < 0.012) {
        ships++;
        place(art.ship, x, y, T * 2.2, hash2(tx, ty, 103) > 0.5);
      } else if (d > 1.4 && hash2(tx, ty, 104) < 0.05) {
        place(art.wave, x, y, T * 1.0);
      }
    }
  }
  details.sort((a, b) => a.y - b.y);
  const detailLayer = new Container();
  for (const sprite of details) detailLayer.addChild(sprite);
  root.addChild(detailLayer);

  // Double map frame.
  const fw = width * T - origin * 2;
  const fh = height * T - origin * 2;
  root.addChild(
    new Graphics()
      .rect(origin + 4, origin + 4, fw - 8, fh - 8)
      .stroke({ width: 3, color: INK })
      .rect(origin + 10, origin + 10, fw - 20, fh - 20)
      .stroke({ width: 1, color: INK }),
  );
  return {
    root,
    clearAround(points) {
      for (const sprite of details) {
        sprite.visible = !points.some((p) => Math.hypot(sprite.x - p.x, sprite.y - p.y) < p.radius);
      }
    },
  };
}

let grain: Texture | null = null;

/** Soft paper fibre texture, multiplied over the washes. */
function paperGrain(): Texture {
  if (grain) return grain;
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const image = ctx.createImageData(size, size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      // Tileable: noise sampled on a torus-friendly lattice period.
      const n =
        hash2(x, y, 200) * 0.5 +
        valueTile(x / 16, y / 16, 16, 201) * 0.35 +
        valueTile(x / 4, y / 4, 64, 202) * 0.15;
      const v = 255 - n * 26;
      const o = (y * size + x) * 4;
      image.data[o] = v;
      image.data[o + 1] = v - 2;
      image.data[o + 2] = v - 8;
      image.data[o + 3] = 255;
    }
  }
  ctx.putImageData(image, 0, 0);
  grain = new Texture({ source: new CanvasSource({ resource: canvas }) });
  return grain;
}

/** Value noise that wraps every `period` lattice cells. */
function valueTile(x: number, y: number, period: number, salt: number): number {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const fx = x - x0;
  const fy = y - y0;
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);
  const h = (a: number, b: number) =>
    hash2(((a % period) + period) % period, ((b % period) + period) % period, salt);
  const a = h(x0, y0);
  const b = h(x0 + 1, y0);
  const c = h(x0, y0 + 1);
  const d = h(x0 + 1, y0 + 1);
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
}
