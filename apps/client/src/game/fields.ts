// Scalar-field helpers for terrain drawing: blur, value noise, distance transform, contour
// extraction (marching squares) and polyline smoothing. Fields are row-major Float32Arrays.

export interface Field {
  width: number;
  height: number;
  data: Float32Array;
}

export function createField(width: number, height: number): Field {
  return { width, height, data: new Float32Array(width * height) };
}

/** Separable box blur, repeated `passes` times (≈ Gaussian). Edges clamp. */
export function blur(field: Field, radius: number, passes = 2): Field {
  const { width, height } = field;
  let src = field.data;
  let tmp = new Float32Array(src.length);
  const span = radius * 2 + 1;
  for (let pass = 0; pass < passes; pass++) {
    for (let y = 0; y < height; y++) {
      const row = y * width;
      let sum = 0;
      for (let k = -radius; k <= radius; k++) sum += src[row + clamp(k, 0, width - 1)]!;
      for (let x = 0; x < width; x++) {
        tmp[row + x] = sum / span;
        sum +=
          src[row + Math.min(x + radius + 1, width - 1)]! - src[row + Math.max(x - radius, 0)]!;
      }
    }
    const out = new Float32Array(src.length);
    for (let x = 0; x < width; x++) {
      let sum = 0;
      for (let k = -radius; k <= radius; k++) sum += tmp[clamp(k, 0, height - 1) * width + x]!;
      for (let y = 0; y < height; y++) {
        out[y * width + x] = sum / span;
        sum +=
          tmp[Math.min(y + radius + 1, height - 1) * width + x]! -
          tmp[Math.max(y - radius, 0) * width + x]!;
      }
    }
    src = out;
    tmp = new Float32Array(src.length);
  }
  return { width, height, data: src };
}

function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value;
}

/** Deterministic 0..1 hash of an integer lattice point. */
export function hash2(x: number, y: number, salt = 0): number {
  let h =
    Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(salt + 1, 2246822519);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Smooth value noise in 0..1. */
export function valueNoise(x: number, y: number, salt = 0): number {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const fx = x - x0;
  const fy = y - y0;
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);
  const a = hash2(x0, y0, salt);
  const b = hash2(x0 + 1, y0, salt);
  const c = hash2(x0, y0 + 1, salt);
  const d = hash2(x0 + 1, y0 + 1, salt);
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
}

/** Two-octave value noise in 0..1. */
export function fbm(x: number, y: number, salt = 0): number {
  return valueNoise(x, y, salt) * 0.65 + valueNoise(x * 2.3, y * 2.3, salt + 7) * 0.35;
}

/**
 * Distance (in samples) from every cell to the nearest cell where `inside` differs, via a
 * two-pass chamfer transform. Returns positive values on both sides.
 */
export function distanceToEdge(inside: Uint8Array, width: number, height: number): Float32Array {
  const far = width + height;
  const dist = new Float32Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      const own = inside[i];
      const edge =
        (x > 0 && inside[i - 1] !== own) ||
        (x < width - 1 && inside[i + 1] !== own) ||
        (y > 0 && inside[i - width] !== own) ||
        (y < height - 1 && inside[i + width] !== own);
      dist[i] = edge ? 0.5 : far;
    }
  }
  const D = Math.SQRT2;
  const relax = (i: number, j: number, cost: number) => {
    if (inside[i] === inside[j] && dist[j]! + cost < dist[i]!) dist[i] = dist[j]! + cost;
  };
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      if (x > 0) relax(i, i - 1, 1);
      if (y > 0) {
        relax(i, i - width, 1);
        if (x > 0) relax(i, i - width - 1, D);
        if (x < width - 1) relax(i, i - width + 1, D);
      }
    }
  }
  for (let y = height - 1; y >= 0; y--) {
    for (let x = width - 1; x >= 0; x--) {
      const i = y * width + x;
      if (x < width - 1) relax(i, i + 1, 1);
      if (y < height - 1) {
        relax(i, i + width, 1);
        if (x < width - 1) relax(i, i + width + 1, D);
        if (x > 0) relax(i, i + width - 1, D);
      }
    }
  }
  return dist;
}

export type Polyline = { points: number[]; closed: boolean };

/**
 * Iso-lines of `field` at `level` as polylines in grid coordinates (cell corners at integer
 * positions). Saddles are resolved by the cell average.
 */
export function contours(field: Field, level: number): Polyline[] {
  const { width, height, data } = field;
  const at = (x: number, y: number) => data[y * width + x]! - level;
  // Edge ids: horizontal edge (x,y)-(x+1,y) = 2k, vertical edge (x,y)-(x,y+1) = 2k+1.
  const hEdge = (x: number, y: number) => (y * width + x) * 2;
  const vEdge = (x: number, y: number) => (y * width + x) * 2 + 1;
  const links = new Map<number, number[]>();
  const link = (a: number, b: number) => {
    let la = links.get(a);
    if (!la) links.set(a, (la = []));
    la.push(b);
    let lb = links.get(b);
    if (!lb) links.set(b, (lb = []));
    lb.push(a);
  };

  for (let y = 0; y < height - 1; y++) {
    for (let x = 0; x < width - 1; x++) {
      const tl = at(x, y);
      const tr = at(x + 1, y);
      const br = at(x + 1, y + 1);
      const bl = at(x, y + 1);
      const index = (tl > 0 ? 8 : 0) | (tr > 0 ? 4 : 0) | (br > 0 ? 2 : 0) | (bl > 0 ? 1 : 0);
      if (index === 0 || index === 15) continue;
      const top = hEdge(x, y);
      const bottom = hEdge(x, y + 1);
      const left = vEdge(x, y);
      const right = vEdge(x + 1, y);
      switch (index) {
        case 1:
        case 14:
          link(left, bottom);
          break;
        case 2:
        case 13:
          link(bottom, right);
          break;
        case 3:
        case 12:
          link(left, right);
          break;
        case 4:
        case 11:
          link(top, right);
          break;
        case 6:
        case 9:
          link(top, bottom);
          break;
        case 7:
        case 8:
          link(left, top);
          break;
        case 5:
        case 10: {
          const centre = (tl + tr + br + bl) / 4 > 0;
          if ((index === 5) === centre) {
            link(left, top);
            link(bottom, right);
          } else {
            link(left, bottom);
            link(top, right);
          }
          break;
        }
      }
    }
  }

  const position = (edge: number): [number, number] => {
    const k = edge >> 1;
    const x = k % width;
    const y = (k - x) / width;
    if ((edge & 1) === 0) {
      const a = at(x, y);
      const b = at(x + 1, y);
      return [x + a / (a - b), y];
    }
    const a = at(x, y);
    const b = at(x, y + 1);
    return [x, y + a / (a - b)];
  };

  const visited = new Set<number>();
  const lines: Polyline[] = [];
  const walk = (start: number) => {
    const points: number[] = [];
    let previous = -1;
    let current = start;
    let closed: boolean;
    for (;;) {
      visited.add(current);
      points.push(...position(current));
      const next = links.get(current)!.find((e) => e !== previous && !visited.has(e));
      if (next === undefined) {
        closed = links.get(current)!.includes(start) && points.length > 4;
        break;
      }
      previous = current;
      current = next;
    }
    lines.push({ points, closed });
  };
  // Open chains first (they start at an end), then the remaining loops.
  for (const [edge, neighbours] of links) {
    if (neighbours.length === 1 && !visited.has(edge)) walk(edge);
  }
  for (const edge of links.keys()) if (!visited.has(edge)) walk(edge);
  return lines;
}

/** Chaikin corner cutting. */
export function smooth(line: Polyline, iterations = 2): Polyline {
  let points = line.points;
  for (let it = 0; it < iterations; it++) {
    const n = points.length / 2;
    if (n < 3) break;
    const out: number[] = [];
    const segments = line.closed ? n : n - 1;
    if (!line.closed) out.push(points[0]!, points[1]!);
    for (let i = 0; i < segments; i++) {
      const j = (i + 1) % n;
      const ax = points[i * 2]!;
      const ay = points[i * 2 + 1]!;
      const bx = points[j * 2]!;
      const by = points[j * 2 + 1]!;
      out.push(
        ax * 0.75 + bx * 0.25,
        ay * 0.75 + by * 0.25,
        ax * 0.25 + bx * 0.75,
        ay * 0.25 + by * 0.75,
      );
    }
    if (!line.closed) out.push(points[points.length - 2]!, points[points.length - 1]!);
    points = out;
  }
  return { points, closed: line.closed };
}
