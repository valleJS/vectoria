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
import { COAST, FOREST, GRASS, ROCK, SEA, SHALLOW, hex } from '../theme/tokens';
import { INK } from './palette';

// Draws the static map once per MapData. The tile grid is resampled into slightly blurred
// fields whose iso-lines follow the tile edges but round the corners; those outlines are filled
// as flat vector regions (deep sea, shallow band, land, forest, rock) and the coast is inked.
// Trees, rocks and other details are sprites of the shared SVG art. All randomness is
// hashed from positions, so every client draws the same map.

/** Sea margin around the map, in tiles. */
export const SEA_MARGIN_TILES = 3;
/** Field samples per tile. */
const K = 8;
/** Width of the light shallow-water band along coasts, in tiles. */
const SHALLOW_TILES = 0.5;

// Old-map tones from the design tokens: parchment land, brown sea, so the pieces in colour
// stand out.
const DEEP = hex(SEA);

export interface Terrain {
  root: Container;
  /** Hides details (trees, peaks, grass) whose bounds come within `radius` world px of a point. */
  clearAround(points: { x: number; y: number; radius: number }[]): void;
  /** Whether a world point lies on the drawn water (past the coastline, clearings are land). */
  isWater(x: number, y: number): boolean;
}

/** A place (tile units, like server positions) that must be land; `open` also clears forest/rock. */
export interface Clearing {
  x: number;
  y: number;
  radius: number;
  open: boolean;
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

export function buildTerrain(map: MapData, art: MapArt, clearings: Clearing[] = []): Terrain {
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
      // Castles stand on open ground and spots on land, even at the water's edge.
      const u = (i + 0.5) / K - SEA_MARGIN_TILES;
      const v = (j + 0.5) / K - SEA_MARGIN_TILES;
      const here = clearings.filter((c) => Math.hypot(u - c.x, v - c.y) < c.radius);
      const open = here.some((c) => c.open);
      land.data[k] = here.length > 0 || type !== TileType.Water ? 1 : 0;
      forest.data[k] = !open && type === TileType.Forest ? 1 : 0;
      rock.data[k] = !open && type === TileType.Mountain ? 1 : 0;
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
  /** Field value at a world position (nearest sample); `outside` beyond the grid. */
  const sample = (field: Field, x: number, y: number, outside: number) => {
    const i = Math.round((x / T + SEA_MARGIN_TILES) * K - 0.5);
    const j = Math.round((y / T + SEA_MARGIN_TILES) * K - 0.5);
    if (i < 0 || j < 0 || i >= gw || j >= gh) return outside;
    return field.data[j * gw + i]!;
  };
  const distanceAt = (x: number, y: number) => sample(distance, x, y, 99);
  // Forest and rock areas reach a little past their tiles so the trees and peaks standing on
  // them stay inside, but never past the coast.
  const withinLand = (field: Field) => {
    const out = createField(gw, gh);
    for (let k = 0; k < out.data.length; k++) {
      out.data[k] = Math.min(field.data[k]! + 0.2, landField.data[k]!);
    }
    return out;
  };

  const root = new Container();
  const origin = -SEA_MARGIN_TILES * T;
  const worldW = gw * (T / K);
  const worldH = gh * (T / K);
  const toWorld = (v: number) => (v + 0.5) * (T / K) + origin;

  const ground = new Graphics().rect(origin, origin, worldW, worldH).fill(DEEP);
  const coast = outlines(landField, 0.5, toWorld);
  // The light shallow band along every coast is a wide stroke centred on the coastline; the land
  // fill then covers its inner half. Lakes and straits get an even band this way, with no
  // polygon holes to triangulate.
  const band = SHALLOW_TILES * T;
  const along = (width: number, color: number, alpha = 1) => {
    for (const region of coast) {
      ground.poly(region.points).stroke({ width, color, alpha, join: 'round' });
    }
  };
  along(band * 2, hex(SHALLOW));
  fillRegions(ground, coast, hex(GRASS));
  fillRegions(ground, outlines(withinLand(forestField), 0.5, toWorld), hex(FOREST));
  fillRegions(ground, outlines(withinLand(rockField), 0.5, toWorld), hex(ROCK));
  // A soft brown coastline instead of hard black ink.
  along(2.2, hex(COAST), 0.9);
  root.addChild(ground);

  // Details, painted back to front.
  const details: { sprite: Sprite; left: number; top: number; right: number; bottom: number }[] =
    [];
  const place = (a: ArtTexture, x: number, y: number, worldWidth: number, flip = false) => {
    const sprite = new Sprite(a.texture);
    const ax = a.anchor.x / a.width;
    const ay = a.anchor.y / a.height;
    sprite.anchor.set(ax, ay);
    const scale = worldWidth / a.width;
    sprite.scale.set(flip ? -scale : scale, scale);
    sprite.position.set(x, y);
    const h = a.height * scale;
    const left = x - (flip ? 1 - ax : ax) * worldWidth;
    details.push({
      sprite,
      left,
      right: left + worldWidth,
      top: y - ay * h,
      bottom: y + (1 - ay) * h,
    });
  };
  const pick = <T>(items: T[], r: number): T => items[Math.floor(r * items.length) % items.length]!;
  /** Mountain tiles among the eight neighbours: 8 deep inside a rock area, few at its rim. */
  const mountainsAround = (tx: number, ty: number) => {
    let count = 0;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if ((dx || dy) && typeAt(tx + dx, ty + dy) === TileType.Mountain) count++;
      }
    }
    return count;
  };

  for (let ty = 0; ty < height; ty++) {
    for (let tx = 0; tx < width; tx++) {
      const type = typeAt(tx, ty);
      if (type === TileType.Forest) {
        const pines = fbm(tx / 5, ty / 5, 21) > 0.58;
        for (let n = 0; n < 4; n++) {
          const x = (tx + 0.5 + (hash2(tx, ty, 10 + n) - 0.5) * 0.7) * T;
          const y = (ty + 0.55 + (hash2(tx, ty, 20 + n) - 0.5) * 0.7) * T;
          if (distanceAt(x, y) > -0.3 || sample(forestField, x, y, 0) < 0.5) continue;
          const r = hash2(tx, ty, 30 + n);
          const size = T * (0.8 + hash2(tx, ty, 40 + n) * 0.25);
          if (pines) place(pick(art.conifers, r), x, y, size * 0.85);
          else if (r > 0.9) place(pick(art.autumn, r * 7), x, y, size, r > 0.95);
          else place(pick(art.broadleaves, r * 3), x, y, size, hash2(tx, ty, 50 + n) > 0.5);
        }
      } else if (type === TileType.Mountain) {
        // Big crags stand in the heart of a rock area, loose boulders along its rim; positions,
        // sizes and the odd gap vary, so the rocks never line up tile by tile.
        const depth = mountainsAround(tx, ty);
        const r = hash2(tx, ty, 63);
        if (r < 0.1) continue;
        // Crags get likelier and bigger towards the interior; the rim keeps smaller ones.
        const inner = Math.min(1, depth / 7);
        const crag = hash2(tx, ty, 64) < 0.25 + inner * 0.6;
        if (crag) {
          const x = (tx + 0.5 + (hash2(tx, ty, 60) - 0.5) * 0.6) * T;
          const y = (ty + 0.75 + (hash2(tx, ty, 61) - 0.5) * 0.45) * T;
          if (distanceAt(x, y) > -0.3 || sample(rockField, x, y - T * 0.3, 0) < 0.5) continue;
          const size = T * (0.75 + inner * 0.55 + hash2(tx, ty, 65) * 0.4);
          place(pick(art.rocks, hash2(tx, ty, 66)), x, y, size, hash2(tx, ty, 67) > 0.5);
        } else {
          for (let n = 0; n < (r > 0.45 ? 2 : 1); n++) {
            const x = (tx + 0.5 + (hash2(tx, ty, 160 + n) - 0.5) * 0.8) * T;
            const y = (ty + 0.6 + (hash2(tx, ty, 170 + n) - 0.5) * 0.7) * T;
            if (distanceAt(x, y) > -0.25 || sample(rockField, x, y - T * 0.15, 0) < 0.45) continue;
            const size = T * (0.5 + hash2(tx, ty, 180 + n) * 0.4);
            place(
              pick(art.boulders, hash2(tx, ty, 190 + n)),
              x,
              y,
              size,
              hash2(tx, ty, 195 + n) > 0.5,
            );
          }
        }
      } else if (type === TileType.Grass) {
        // A stray boulder now and then on the meadow next to a rock area.
        if (mountainsAround(tx, ty) > 0 && hash2(tx, ty, 200) < 0.3) {
          const x = (tx + 0.5 + (hash2(tx, ty, 201) - 0.5) * 0.7) * T;
          const y = (ty + 0.5 + (hash2(tx, ty, 202) - 0.5) * 0.7) * T;
          if (distanceAt(x, y) < -0.3) {
            const size = T * (0.38 + hash2(tx, ty, 203) * 0.25);
            place(pick(art.boulders, hash2(tx, ty, 204)), x, y, size, hash2(tx, ty, 205) > 0.5);
          }
        }
        for (let n = 0; n < 2; n++) {
          const x = (tx + 0.5 + (hash2(tx, ty, 70 + n) - 0.5) * 0.9) * T;
          const y = (ty + 0.5 + (hash2(tx, ty, 80 + n) - 0.5) * 0.9) * T;
          if (distanceAt(x, y) > -0.25) continue;
          const r = hash2(tx, ty, 90 + n);
          if (r > 0.88) place(art.tuft, x, y, T * 0.55, r > 0.94);
          else if (r < 0.03) place(pick(art.broadleaves, r * 33), x, y, T * 1.05);
        }
      }
    }
  }
  // Boats on the water: cogs where the sea is open, small fishing boats on lakes and straits.
  // Candidates are ranked by a positional hash, so the picks spread over the whole map and stay
  // the same on every client; boats keep their distance from each other.
  const area = width * height;
  const limits = {
    cog: Math.max(2, Math.round(area / 260)),
    boat: Math.max(2, Math.round(area / 180)),
  };
  const candidates: { x: number; y: number; kind: 'cog' | 'boat'; rank: number; flip: boolean }[] =
    [];
  for (let ty = -SEA_MARGIN_TILES; ty < height + SEA_MARGIN_TILES; ty++) {
    for (let tx = -SEA_MARGIN_TILES; tx < width + SEA_MARGIN_TILES; tx++) {
      const x = (tx + 0.5 + (hash2(tx, ty, 100) - 0.5) * 0.5) * T;
      const y = (ty + 0.5 + (hash2(tx, ty, 101) - 0.5) * 0.5) * T;
      const d = distanceAt(x, y);
      const inland = tx >= 0 && ty >= 0 && tx < width && ty < height;
      const kind = d > 2.4 ? 'cog' : d > 0.95 && inland ? 'boat' : null;
      if (!kind) continue;
      candidates.push({ x, y, kind, rank: hash2(tx, ty, 102), flip: hash2(tx, ty, 103) > 0.5 });
    }
  }
  candidates.sort((a, b) => a.rank - b.rank);
  const boats: { x: number; y: number }[] = [];
  const count = { cog: 0, boat: 0 };
  for (const c of candidates) {
    if (count[c.kind] >= limits[c.kind]) continue;
    if (boats.some((o) => Math.hypot(o.x - c.x, o.y - c.y) < T * 5)) continue;
    count[c.kind]++;
    boats.push(c);
    if (c.kind === 'cog') place(art.ship, c.x, c.y, T * 2.1, c.flip);
    else place(art.boat, c.x, c.y, T * 1.15, c.flip);
  }
  details.sort((a, b) => a.sprite.y - b.sprite.y);
  const detailLayer = new Container();
  for (const { sprite } of details) detailLayer.addChild(sprite);
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
    isWater: (x, y) => sample(landField, x, y, 0) < 0.5,
    clearAround(points) {
      for (const d of details) {
        d.sprite.visible = !points.some((p) => {
          const dx = Math.max(d.left - p.x, 0, p.x - d.right);
          const dy = Math.max(d.top - p.y, 0, p.y - d.bottom);
          return dx * dx + dy * dy < p.radius * p.radius;
        });
      }
    },
  };
}
