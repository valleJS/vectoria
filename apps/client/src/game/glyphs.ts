import type { Graphics } from 'pixi.js';
import { INK } from './palette';

// Map glyphs in the cartography style. Each is authored on a 24-unit tile around (0, 0);
// `u` converts units to world pixels (tileSize / 24). The HUD mirrors them in ui/icons.tsx.

const WALL = 0xe9dfc6;
const STONEWORK = 0xf3ead4;

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

/** Dashed line through `points`; the dash pattern runs on across corners. */
export function dashedPolyline(
  g: Graphics,
  points: readonly { x: number; y: number }[],
  dash: number,
  gap: number,
): Graphics {
  const period = dash + gap;
  let offset = 0;
  for (let i = 1; i < points.length; i++) {
    const from = points[i - 1]!;
    const to = points[i]!;
    const length = Math.hypot(to.x - from.x, to.y - from.y);
    if (length === 0) continue;
    const dx = (to.x - from.x) / length;
    const dy = (to.y - from.y) / length;
    // `offset` is how far into the current period the segment starts.
    for (let d = -offset; d < length; d += period) {
      const start = Math.max(0, d);
      const end = Math.min(d + dash, length);
      if (end > start) {
        g.moveTo(from.x + dx * start, from.y + dy * start).lineTo(
          from.x + dx * end,
          from.y + dy * end,
        );
      }
    }
    offset = (offset + length) % period;
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
