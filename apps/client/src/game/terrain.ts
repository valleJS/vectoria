import { TileType, type MapData } from '@vectoria/shared';
import { Container, Graphics } from 'pixi.js';
import { INK, SEA } from './palette';

// Draws the static map once per MapData: sea, layered coastline, terrain washes and hand-drawn
// details (trees, mountains, grass, waves, ships). Shapes are unions of per-tile circles, so the
// tile grid reads as soft cartography; all randomness is a hash of the tile, so redraws match.

/** Sea margin around the map, in tiles, so coast rings at the edge aren't clipped. */
export const SEA_MARGIN_TILES = 3;
/** How far (tiles) coast distances are searched; beyond this a tile counts as interior. */
const COAST_SEARCH = 4;

/** Coastline bands from outside in: [radius in tiles, colour]. Each pair leaves a ring. */
const COAST_RINGS: [number, number][] = [
  [2.5, 0x4d8ea4],
  [2.375, SEA],
  [1.625, 0x46879d],
  [1.5, 0x86c2cc],
  [1.025, 0xa9d8d6],
  [0.95, INK],
];
const LAND_RADIUS = 0.75;
const BEACH = 0xecdcaa;

const WASH: Record<Exclude<TileType, typeof TileType.Water>, { color: number; radius: number }> = {
  [TileType.Grass]: { color: 0xc8d98a, radius: 0.69 },
  [TileType.Forest]: { color: 0x94bf6a, radius: 0.875 },
  [TileType.Mountain]: { color: 0xd6b77e, radius: 0.875 },
};
const WASH_ORDER = [TileType.Grass, TileType.Forest, TileType.Mountain] as const;

const TREE_CROWNS = [0x3f7f37, 0x52933e, 0x2f6b33, 0x67a446];
const AUTUMN_CROWNS = [0xd9822b, 0xc0452a];
const FLOWERS = [0xe0534a, 0xf2c230, 0xffffff, 0xb45bd0];

/** Deterministic 0..1 value for a tile and a salt. */
function hash(x: number, y: number, salt: number): number {
  let h =
    Math.imul(x + 1, 374761393) ^ Math.imul(y + 1, 668265263) ^ Math.imul(salt + 1, 2246822519);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

interface Detail {
  y: number;
  draw(g: Graphics): void;
}

export function buildTerrain(map: MapData): Container {
  const { width, height, tileSize: T, tiles } = map;
  const u = T / 24;
  const typeAt = (x: number, y: number): TileType =>
    x < 0 || y < 0 || x >= width || y >= height
      ? TileType.Water
      : (tiles[y * width + x] ?? TileType.Water);
  const isLand = (x: number, y: number) => typeAt(x, y) !== TileType.Water;

  // Distance (tile centres) from each tile to the nearest tile of the other kind; outside the
  // map counts as water.
  const coast = new Float32Array(width * height).fill(COAST_SEARCH + 1);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const land = isLand(x, y);
      let best = COAST_SEARCH + 1;
      for (let dy = -COAST_SEARCH; dy <= COAST_SEARCH; dy++) {
        for (let dx = -COAST_SEARCH; dx <= COAST_SEARCH; dx++) {
          if (isLand(x + dx, y + dy) !== land) best = Math.min(best, Math.hypot(dx, dy));
        }
      }
      coast[y * width + x] = best;
    }
  }
  const coastAt = (x: number, y: number) => coast[y * width + x]!;
  const cx = (x: number) => (x + 0.5) * T;
  const cy = (y: number) => (y + 0.5) * T;

  const root = new Container();
  const margin = SEA_MARGIN_TILES * T;
  const sea = new Graphics()
    .rect(-margin, -margin, width * T + margin * 2, height * T + margin * 2)
    .fill(SEA);
  root.addChild(sea);

  // Waves, specks and the odd ship on open water.
  const water = new Graphics();
  let ships = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (isLand(x, y)) continue;
      const open = coastAt(x, y);
      const px = cx(x) + (hash(x, y, 1) - 0.5) * T * 0.6;
      const py = cy(y) + (hash(x, y, 2) - 0.5) * T * 0.6;
      if (open >= 2 && hash(x, y, 3) < 0.16) {
        water
          .moveTo(px - 8 * u, py)
          .quadraticCurveTo(px - 4 * u, py - 4 * u, px, py)
          .quadraticCurveTo(px + 4 * u, py - 4 * u, px + 8 * u, py)
          .stroke({ width: 1.3 * u, color: 0xd6eef2, alpha: 0.7 });
      } else if (hash(x, y, 4) < 0.25) {
        water.circle(px, py, 0.8 * u).fill(0x4f8fa6);
      }
      if (open >= 3.5 && ships < 3 && hash(x, y, 5) < 0.01) {
        ships++;
        drawShip(water, cx(x), cy(y), u);
      }
    }
  }
  root.addChild(water);

  // Coast rings, then the beach-coloured land body. Only tiles near the coast need circles.
  const coastline = new Graphics();
  for (const [radius, color] of COAST_RINGS) {
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        if (isLand(x, y) && coastAt(x, y) <= radius + LAND_RADIUS) {
          coastline.circle(cx(x), cy(y), radius * T);
        }
      }
    }
    coastline.fill(color);
  }
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (!isLand(x, y)) continue;
      if (coastAt(x, y) <= 1.5) coastline.circle(cx(x), cy(y), LAND_RADIUS * T);
      else coastline.rect(x * T, y * T, T, T);
    }
  }
  coastline.fill(BEACH);
  root.addChild(coastline);

  // Terrain washes: blobs at type borders, plain squares inside uniform areas.
  const washes = new Graphics();
  for (const type of WASH_ORDER) {
    const { color, radius } = WASH[type];
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        if (typeAt(x, y) !== type) continue;
        let uniform = true;
        for (let dy = -1; dy <= 1 && uniform; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            if (typeAt(x + dx, y + dy) !== type) {
              uniform = false;
              break;
            }
          }
        }
        if (uniform) washes.rect(x * T - 1, y * T - 1, T + 2, T + 2);
        else washes.circle(cx(x), cy(y), radius * T);
      }
    }
    washes.fill(color);
  }
  root.addChild(washes);

  // Trees, peaks and grass, painted back to front.
  const details: Detail[] = [];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const type = typeAt(x, y);
      if (type === TileType.Forest) {
        for (let i = 0; i < 3; i++) {
          const tx = cx(x) + (hash(x, y, 10 + i) - 0.5) * T * 0.8;
          const ty = cy(y) + (hash(x, y, 20 + i) - 0.5) * T * 0.8;
          const pick = hash(x, y, 30 + i);
          const crown =
            pick > 0.92
              ? AUTUMN_CROWNS[0]!
              : pick > 0.86
                ? AUTUMN_CROWNS[1]!
                : TREE_CROWNS[Math.floor(pick * 4.65) % TREE_CROWNS.length]!;
          details.push({ y: ty, draw: (g) => drawTree(g, tx, ty, crown, u) });
        }
      } else if (type === TileType.Mountain && hash(x, y, 40) > 0.15) {
        const mx = cx(x) + (hash(x, y, 41) - 0.5) * T * 0.3;
        const my = cy(y) + (hash(x, y, 42) - 0.5) * T * 0.3;
        const snow = hash(x, y, 43) > 0.5;
        details.push({ y: my, draw: (g) => drawMountain(g, mx, my, snow, u) });
      } else if (type === TileType.Grass) {
        for (let i = 0; i < 2; i++) {
          const gx = cx(x) + (hash(x, y, 50 + i) - 0.5) * T * 0.8;
          const gy = cy(y) + (hash(x, y, 60 + i) - 0.5) * T * 0.8;
          const pick = hash(x, y, 70 + i);
          if (pick > 0.84) details.push({ y: gy, draw: (g) => drawTuft(g, gx, gy, u) });
          else if (pick > 0.76) {
            const color = FLOWERS[Math.floor(hash(x, y, 80 + i) * FLOWERS.length)]!;
            details.push({ y: gy, draw: (g) => g.circle(gx, gy, 1.6 * u).fill(color) });
          }
        }
      }
    }
  }
  details.sort((a, b) => a.y - b.y);
  const detailLayer = new Graphics();
  for (const detail of details) detail.draw(detailLayer);
  root.addChild(detailLayer);

  // Double map frame.
  const frame = new Graphics()
    .rect(-margin + 4, -margin + 4, width * T + margin * 2 - 8, height * T + margin * 2 - 8)
    .stroke({ width: 3, color: INK })
    .rect(-margin + 10, -margin + 10, width * T + margin * 2 - 20, height * T + margin * 2 - 20)
    .stroke({ width: 1, color: INK });
  root.addChild(frame);

  return root;
}

function drawTree(g: Graphics, x: number, y: number, crown: number, u: number): void {
  g.moveTo(x, y + 4 * u)
    .lineTo(x, y + 8 * u)
    .stroke({ width: 1.8 * u, color: 0x5a3a1c });
  g.circle(x, y, 5.4 * u)
    .fill(crown)
    .stroke({ width: 0.9 * u, color: INK });
  g.circle(x - 1.7 * u, y - 1.7 * u, 1.7 * u).fill({ color: 0xffffff, alpha: 0.25 });
}

function drawMountain(g: Graphics, x: number, y: number, snow: boolean, u: number): void {
  const base = y + 7 * u;
  const peak = y - 11 * u;
  g.poly([x - 13 * u, base, x, peak, x + 13 * u, base])
    .fill(0xc9a46a)
    .stroke({ width: 1.2 * u, color: INK });
  g.poly([x, peak, x + 13 * u, base, x + 3 * u, base]).fill(0x9c7745);
  g.moveTo(x - 13 * u, base)
    .lineTo(x, peak)
    .lineTo(x + 13 * u, base)
    .stroke({ width: 1.2 * u, color: INK });
  if (snow) {
    g.poly([
      x - 5 * u,
      y - 4 * u,
      x,
      peak,
      x + 5 * u,
      y - 4 * u,
      x + 2 * u,
      y - 2.5 * u,
      x,
      y - 4.5 * u,
      x - 2 * u,
      y - 2.5 * u,
    ])
      .fill(0xffffff)
      .stroke({ width: 0.6 * u, color: INK });
  }
}

function drawTuft(g: Graphics, x: number, y: number, u: number): void {
  g.moveTo(x - 4 * u, y + 3 * u)
    .lineTo(x - 2 * u, y - 2 * u)
    .moveTo(x, y + 3 * u)
    .lineTo(x, y - 3.5 * u)
    .moveTo(x + 4 * u, y + 3 * u)
    .lineTo(x + 2 * u, y - 2 * u)
    .stroke({ width: 1.1 * u, color: 0x5f7d2e });
}

function drawShip(g: Graphics, x: number, y: number, u: number): void {
  const line = { width: u, color: INK };
  g.poly([x - 14 * u, y, x + 14 * u, y, x + 8 * u, y + 7 * u, x - 8 * u, y + 7 * u])
    .fill(0x8a5a2b)
    .stroke(line);
  g.moveTo(x, y)
    .lineTo(x, y - 21 * u)
    .stroke(line);
  g.poly([x + u, y - 20 * u, x + 12 * u, y - 3 * u, x + u, y - 3 * u])
    .fill(0xf6efd9)
    .stroke({ width: 0.8 * u, color: INK });
  g.poly([x, y - 21 * u, x + 7 * u, y - 19 * u, x, y - 17 * u]).fill(0xd4472f);
}
