import type { Graphics } from 'pixi.js';

// Vector helpers for the map: dashed routes and rings. All illustrated pieces live in art/svg.ts.

/**
 * Dashes along `points` as filled shapes `2 × halfWidth` wide whose leading end comes to a point
 * (`tip` long), so a route shows which way it runs without extra marks. The pattern runs on across
 * corners (a dash broken by one gets its point only where it ends); raising `phase` (world px)
 * moves the dashes forward, for marching routes. Call `fill` / `stroke` on the result.
 */
export function pointedDashes(
  g: Graphics,
  points: readonly { x: number; y: number }[],
  dash: number,
  gap: number,
  halfWidth: number,
  tip: number,
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
    const at = (d: number, side: number) => [
      from.x + dx * d - dy * halfWidth * side,
      from.y + dy * d + dx * halfWidth * side,
    ];
    for (let d = -offset; d < length; d += period) {
      const start = Math.max(0, d);
      const end = Math.min(d + dash, length);
      if (end <= start) continue;
      const pointed = end === d + dash && end - start > tip;
      if (pointed) {
        g.poly([
          ...at(start, 1),
          ...at(end - tip, 1),
          ...at(end, 0),
          ...at(end - tip, -1),
          ...at(start, -1),
        ]);
      } else {
        g.poly([...at(start, 1), ...at(end, 1), ...at(end, -1), ...at(start, -1)]);
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
