import type { Graphics } from 'pixi.js';

// Vector helpers for the map: dashed routes and rings. All illustrated pieces live in art/svg.ts.

/**
 * Dashed line through `points`; the dash pattern runs on across corners. Raising `phase` (world
 * px) moves the dashes forward along the line, for marching routes.
 */
export function dashedPolyline(
  g: Graphics,
  points: readonly { x: number; y: number }[],
  dash: number,
  gap: number,
  phase = 0,
): Graphics {
  const period = dash + gap;
  let offset = ((-phase % period) + period) % period;
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
