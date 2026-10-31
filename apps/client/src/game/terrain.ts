import { TileType, type MapData } from '@vectoria/shared';
import { Container, Graphics, Sprite } from 'pixi.js';
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

// Draws the static map once per MapData. The tile grid is resampled into slightly blurred
// fields whose iso-lines follow the tile edges but round the corners; those outlines are filled
// as flat vector regions (deep sea, shallow band, land, forest, rock) and the coast is inked.
// Trees, mountains and other details are sprites of the shared SVG art. All randomness is
// hashed from positions, so every client draws the same map.

/** Sea margin around the map, in tiles. */
export const SEA_MARGIN_TILES = 3;
/** Field samples per tile. */
const K = 8;
/** Width of the light shallow-water band along coasts, in tiles. */
const SHALLOW_TILES = 0.55;

const DEEP = 0x5b9dbb;
const SHALLOW = 0x8fcbd0;
const GRASS = 0xbdd480;
const FOREST = 0x86b05e;
const ROCK = 0xcfbc92;

export interface Terrain {
  root: Container;
  /** Hides details (trees, peaks, grass) within `radius` world px of each point. */
  clearAround(points: { x: number; y: number; radius: number }[]): void;
}

interface Region {
  points: number[];
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

function insidePolygon(x: number, y: number, region: Region): boolean {
  if (x < region.minX || x > region.maxX || y < region.minY || y > region.maxY) return false;
  const p = region.points;
  let inside = false;
  for (let i = 0, j = p.length - 2; i < p.length; j = i, i += 2) {
    const xi = p[i]!;
    const yi = p[i + 1]!;
    const xj = p[j]!;
    const yj = p[j + 1]!;
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/**
 * Closed iso-lines of `field` at `level`, smoothed and converted to world coordinates. The field
 * must be below `level` at the map margin, so outermost loops enclose the region above it.
 */
function outlines(field: Field, level: number, toWorld: (v: number) => number): Region[] {
  return contours(field, level)
    .filter((line) => line.closed && line.points.length >= 8)
    .map((line) => {
      const points = smooth(line, 2).points.map(toWorld);
      let minX = Infinity;
      let minY = Infinity;
      let maxX = -Infinity;
      let maxY = -Infinity;
      for (let i = 0; i < points.length; i += 2) {
        minX = Math.min(minX, points[i]!);
        maxX = Math.max(maxX, points[i]!);
        minY = Math.min(minY, points[i + 1]!);
        maxY = Math.max(maxY, points[i + 1]!);
      }
      return { points, minX, minY, maxX, maxY };
    });
}

/** Fills nested outlines: even nesting depth is solid, odd depth is a hole in its parent. */
function fillRegions(g: Graphics, regions: Region[], color: number): void {
  const depth = regions.map(
    (r) => regions.filter((o) => o !== r && insidePolygon(r.points[0]!, r.points[1]!, o)).length,
  );
  regions.forEach((outer, i) => {
    if (depth[i]! % 2 !== 0) return;
    g.poly(outer.points).fill(color);
    regions.forEach((hole, j) => {
      if (depth[j] === depth[i]! + 1 && insidePolygon(hole.points[0]!, hole.points[1]!, outer)) {
        g.poly(hole.points).cut();
      }
    });
  });
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
  // A light blur keeps edges on the tile lines but rounds the corners.
  const landField = blur(land, 2);
  const forestField = blur(forest, 3);
  const rockField = blur(rock, 3);

  // Distance to the coast in tiles (negative on land), for the shallow band and placement.
  const inside = new Uint8Array(gw * gh);
  for (let k = 0; k < inside.length; k++) inside[k] = landField.data[k]! > 0.5 ? 1 : 0;
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
  // Shallow band as "nearness": above the level within SHALLOW_TILES of land.
  const near = createField(gw, gh);
  for (let k = 0; k < near.data.length; k++) near.data[k] = SHALLOW_TILES - distance.data[k]!;

  const root = new Container();
  const origin = -SEA_MARGIN_TILES * T;
  const worldW = gw * (T / K);
  const worldH = gh * (T / K);
  const toWorld = (v: number) => (v + 0.5) * (T / K) + origin;

  const ground = new Graphics().rect(origin, origin, worldW, worldH).fill(DEEP);
  fillRegions(ground, outlines(near, 0, toWorld), SHALLOW);
  const coast = outlines(landField, 0.5, toWorld);
  fillRegions(ground, coast, GRASS);
  fillRegions(ground, outlines(forestField, 0.5, toWorld), FOREST);
  fillRegions(ground, outlines(rockField, 0.5, toWorld), ROCK);
  for (const region of coast) {
    ground.poly(region.points).stroke({ width: 2.6, color: INK, join: 'round' });
  }
  root.addChild(ground);

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
  // The odd ship on open water, including the margin.
  let ships = 0;
  for (let ty = -SEA_MARGIN_TILES; ty < height + SEA_MARGIN_TILES; ty++) {
    for (let tx = -SEA_MARGIN_TILES; tx < width + SEA_MARGIN_TILES; tx++) {
      const x = (tx + 0.5 + (hash2(tx, ty, 100) - 0.5) * 0.7) * T;
      const y = (ty + 0.5 + (hash2(tx, ty, 101) - 0.5) * 0.7) * T;
      const d = distanceAt(x, y);
      if (d > 2.8 && ships < 3 && hash2(tx, ty, 102) < 0.012) {
        ships++;
        place(art.ship, x, y, T * 2.2, hash2(tx, ty, 103) > 0.5);
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
