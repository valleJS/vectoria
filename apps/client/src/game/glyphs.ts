import type { ResourceType } from '@vectoria/shared';
import type { Graphics } from 'pixi.js';
import { INK } from './palette';

// Map glyphs in the cartography style. Each is authored on a 24-unit tile around (0, 0);
// `u` converts units to world pixels (tileSize / 24). The HUD mirrors them in ui/icons.tsx.

const WALL = 0xe9dfc6;
const STONEWORK = 0xf3ead4;
const MEDALLION = 0xf3e7c4;

export const SPOT_RING: Record<ResourceType, number> = {
  wood: 0x7a4b22,
  stone: 0x6b6f78,
  gold: 0xc99a12,
};

const scaled = (u: number, points: number[]) => points.map((n) => n * u);

/** Castle with two towers and a keep; roofs and pennant in the owner's colour. */
export function drawCastle(g: Graphics, color: number, u: number): Graphics {
  const line = { width: u, color: INK };
  g.ellipse(0, 11 * u, 20 * u, 5 * u).fill({ color: INK, alpha: 0.25 });
  g.rect(-14 * u, -2 * u, 28 * u, 13 * u)
    .fill(WALL)
    .stroke(line);
  for (const x of [-18, 10]) {
    g.rect(x * u, -10 * u, 8 * u, 21 * u)
      .fill(STONEWORK)
      .stroke(line);
    g.poly(scaled(u, [x - 1, -10, x + 4, -19, x + 9, -10]))
      .fill(color)
      .stroke(line);
  }
  g.rect(-6 * u, -14 * u, 12 * u, 16 * u)
    .fill(STONEWORK)
    .stroke(line);
  g.poly(scaled(u, [-7, -14, 0, -25, 7, -14]))
    .fill(color)
    .stroke(line);
  g.moveTo(0, -25 * u)
    .lineTo(0, -33 * u)
    .stroke(line);
  g.poly(scaled(u, [0, -33, 9, -30.5, 0, -28]))
    .fill(color)
    .stroke(line);
  g.moveTo(-3 * u, 11 * u)
    .lineTo(-3 * u, 5 * u)
    .quadraticCurveTo(0, u, 3 * u, 5 * u)
    .lineTo(3 * u, 11 * u)
    .closePath()
    .fill(INK);
  g.rect(-u, -10 * u, 2 * u, 4 * u).fill(INK);
  return g;
}

/** Round medallion with logs, stone blocks or gold nuggets. */
export function drawSpot(g: Graphics, resource: ResourceType, u: number): Graphics {
  g.circle(0, 0, 11 * u)
    .fill(MEDALLION)
    .stroke({ width: 2 * u, color: SPOT_RING[resource] });
  const line = { width: 0.7 * u, color: INK };
  switch (resource) {
    case 'wood':
      g.roundRect(-7 * u, 0, 14 * u, 4 * u, 2 * u)
        .fill(0xa0652e)
        .stroke(line);
      g.roundRect(-5 * u, -4 * u, 10 * u, 4 * u, 2 * u)
        .fill(0xb8763a)
        .stroke(line);
      g.circle(6 * u, 2 * u, 1.4 * u).fill(0xe8c48a);
      break;
    case 'stone':
      g.poly(scaled(u, [-7, 5, -5, -2, 1, -2, 3, 5]))
        .fill(0x9aa0aa)
        .stroke(line);
      g.poly(scaled(u, [0, 5, 2, 0, 7, 0, 8, 5]))
        .fill(0xb9bec6)
        .stroke(line);
      break;
    case 'gold': {
      const rim = { width: 0.7 * u, color: 0x7a5a08 };
      g.circle(-3 * u, 2 * u, 3.6 * u)
        .fill(0xf4c430)
        .stroke(rim);
      g.circle(3 * u, u, 3 * u)
        .fill(0xffd95a)
        .stroke(rim);
      g.circle(0, -3 * u, 2.6 * u)
        .fill(0xf4c430)
        .stroke(rim);
      g.moveTo(6 * u, -7 * u)
        .lineTo(6 * u, -3 * u)
        .moveTo(4 * u, -5 * u)
        .lineTo(8 * u, -5 * u)
        .stroke({ width: u, color: 0xffffff });
      break;
    }
  }
  return g;
}

/** Treasure chest with a gold band and a sparkle. */
export function drawChest(g: Graphics, u: number): Graphics {
  const line = { width: u, color: INK };
  g.moveTo(-9 * u, -2 * u)
    .quadraticCurveTo(0, -10 * u, 9 * u, -2 * u)
    .closePath()
    .fill(0x9a5b22)
    .stroke(line);
  g.rect(-9 * u, -2 * u, 18 * u, 10 * u)
    .fill(0xb8702c)
    .stroke(line);
  g.rect(-9 * u, u, 18 * u, 2 * u).fill(0xf2c230);
  g.rect(-2 * u, 0, 4 * u, 5 * u)
    .fill(0xf2c230)
    .stroke({ width: 0.5 * u, color: INK });
  g.poly(
    scaled(u, [11, -10, 12.5, -7, 15.5, -5.5, 12.5, -4, 11, -1, 9.5, -4, 6.5, -5.5, 9.5, -7]),
  ).fill(0xfff6c2);
  return g;
}

/** Army banner on a pole; the troop count is a separate Text centred at (0, -7u). */
export function drawBanner(g: Graphics, color: number, u: number): Graphics {
  g.ellipse(0, 12 * u, 9 * u, 3 * u).fill({ color: INK, alpha: 0.3 });
  g.moveTo(-10 * u, 11 * u)
    .lineTo(-10 * u, -16 * u)
    .stroke({ width: 1.4 * u, color: INK });
  g.poly(scaled(u, [-10, -16, 10, -16, 10, -2, 0, 4, -10, -2]))
    .fill(color)
    .stroke({ width: 1.2 * u, color: INK });
  g.moveTo(-10 * u, -12 * u)
    .lineTo(10 * u, -12 * u)
    .stroke({ width: u, color: 0xffffff, alpha: 0.5 });
  return g;
}

export function dashedLine(
  g: Graphics,
  from: { x: number; y: number },
  to: { x: number; y: number },
  dash: number,
  gap: number,
): Graphics {
  const length = Math.hypot(to.x - from.x, to.y - from.y);
  if (length === 0) return g;
  const dx = (to.x - from.x) / length;
  const dy = (to.y - from.y) / length;
  for (let d = 0; d < length; d += dash + gap) {
    const end = Math.min(d + dash, length);
    g.moveTo(from.x + dx * d, from.y + dy * d).lineTo(from.x + dx * end, from.y + dy * end);
  }
  return g;
}

/** Dashed circle around (0, 0) with `segments` dashes. */
export function dashedCircle(g: Graphics, radius: number, segments: number): Graphics {
  const step = (Math.PI * 2) / segments;
  for (let i = 0; i < segments; i++) {
    const start = i * step;
    g.moveTo(Math.cos(start) * radius, Math.sin(start) * radius).arc(
      0,
      0,
      radius,
      start,
      start + step * 0.6,
    );
  }
  return g;
}
