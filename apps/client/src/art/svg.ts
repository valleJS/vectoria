import type { ResourceType } from '@vectoria/shared';
import {
  END_GRAIN,
  GOLD,
  GOLD_DEEP,
  GOLD_LIGHT,
  GRANITE,
  INK,
  IRON,
  MASONRY,
  PARCHMENT,
  SEAL,
  SKIN,
  STEEL,
  TIMBER,
} from '../theme/tokens';

// Hand-drawn art as SVG source. The same markup feeds the HUD (<img> data URLs), the design
// sheet (`/?design`) and the map (rasterised to Pixi textures in textures.ts), so all look alike.
//
// One drawing language for everything:
// - Light comes from the top left: left/top faces lit, right faces shaded (`facets`, `shade`).
// - Every object stands on a flat ground shadow, offset a little to the right.
// - Pieces players act on (sites, deposits, chests, armies) are outlined in INK (2.4 px at
//   castle scale) and get a parchment cut-out edge on the map (textures.ts).
// - Decoration (trees, rocks, tufts, ships) uses thin tonal lines — a darker shade of its own
//   colour — and is toned to sepia on the map, so it stays a backdrop.
// - Colours only from theme/tokens.ts.

export { INK };

export interface Art {
  svg: string;
  width: number;
  height: number;
  /** Ground point in art pixels: where the art stands on the map. */
  anchor: { x: number; y: number };
  /** Y (art px) of the visual centre that sits on the site's tile; defaults to `anchor.y`. */
  centreY?: number;
}

function svg(width: number, height: number, body: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${body}</svg>`;
}

export function dataUrl(markup: string): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(markup)}`;
}

/** Darkens (f < 1) or lightens (f > 1) a #rrggbb colour. */
export function shade(color: string, f: number): string {
  const channel = (i: number) => {
    const v = parseInt(color.slice(i, i + 2), 16);
    const out = f < 1 ? v * f : v + (255 - v) * (f - 1);
    return Math.round(Math.min(255, Math.max(0, out)))
      .toString(16)
      .padStart(2, '0');
  };
  return `#${channel(1)}${channel(3)}${channel(5)}`;
}

const n = (v: number) => (Math.round(v * 100) / 100).toString();

/** Flat ground shadow under an object standing at (x, y). */
function groundShadow(x: number, y: number, rx: number, ry: number, color = INK, alpha = 0.24) {
  return `<ellipse cx="${n(x + rx * 0.08)}" cy="${n(y)}" rx="${n(rx)}" ry="${n(ry)}" fill="${color}" opacity="${alpha}"/>`;
}

/**
 * Scalloped blob (clouds, tree crowns, smoke): `lobes` arcs bulging out of a circle around
 * (cx, cy). `wobble` varies the radius per lobe, deterministically by `seed`.
 */
function lobed(cx: number, cy: number, r: number, lobes: number, seed = 0, wobble = 0.12) {
  const pts: [number, number][] = [];
  for (let i = 0; i < lobes; i++) {
    const a = (i / lobes) * Math.PI * 2 - Math.PI / 2 + seed;
    const rr = r * (1 - wobble + wobble * 2 * (0.5 + 0.5 * Math.sin(i * 2.7 + seed * 5)));
    pts.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr]);
  }
  const bulge = (Math.PI * r) / lobes / 1.35;
  let d = `M${n(pts[0]![0])} ${n(pts[0]![1])}`;
  for (let i = 1; i <= lobes; i++) {
    const p = pts[i % lobes]!;
    d += `A${n(bulge)} ${n(bulge)} 0 0 1 ${n(p[0])} ${n(p[1])}`;
  }
  return `${d}Z`;
}

interface Ramp {
  light: string;
  base: string;
  shade: string;
}

/**
 * A faceted solid (rock, boulder, chunk): the outline `points` fanned from an inner `ridge`
 * point. Each facet is lit by how much its outer edge faces the top-left light.
 */
function facets(
  points: [number, number][],
  ridge: [number, number],
  ramp: Ramp,
  line: string,
  width: number,
  creases = 0.45,
): string {
  const lx = -0.62;
  const ly = -0.78;
  const count = points.length;
  const fills = points.map((a, i) => {
    const b = points[(i + 1) % count]!;
    // Outward normal of edge a→b for a clockwise outline (screen coordinates).
    const ex = b[0] - a[0];
    const ey = b[1] - a[1];
    const len = Math.hypot(ex, ey) || 1;
    const nx = ey / len;
    const ny = -ex / len;
    const lit = nx * lx + ny * ly;
    // Faces towards the ground (the front of a rock) stay at the base tone.
    if (ny > 0.85) return ramp.base;
    return lit > 0.35 ? ramp.light : lit > -0.25 ? ramp.base : ramp.shade;
  });
  let out = '';
  let lines = '';
  for (let i = 0; i < count; i++) {
    const a = points[i]!;
    const b = points[(i + 1) % count]!;
    const fill = fills[i]!;
    out += `<path d="M${n(ridge[0])} ${n(ridge[1])}L${n(a[0])} ${n(a[1])}L${n(b[0])} ${n(b[1])}Z" fill="${fill}" stroke="${fill}" stroke-width=".6" stroke-linejoin="round"/>`;
    // Crease only where the tone changes, so planes read as planes.
    if (fills[(i + count - 1) % count] !== fill) {
      lines += `M${n(ridge[0])} ${n(ridge[1])}L${n(a[0])} ${n(a[1])}`;
    }
  }
  const outline = `M${points.map(([x, y]) => `${n(x)} ${n(y)}`).join('L')}Z`;
  return `${out}<path d="${lines}" fill="none" stroke="${line}" stroke-width="${n(width * 0.45)}" stroke-linecap="round" opacity="${creases}"/>
    <path d="${outline}" fill="none" stroke="${line}" stroke-width="${width}" stroke-linejoin="round"/>`;
}

// ---- Resources ----

const STONE_RAMP: Ramp = { light: GRANITE.light, base: GRANITE.base, shade: GRANITE.shade };
const GOLD_RAMP: Ramp = { light: GOLD_LIGHT, base: GOLD, shade: GOLD_DEEP };
/** Warm earth of the gold mine's mound, so it never reads as the grey quarry. */
const EARTH: Ramp = { light: '#dcb886', base: '#b98d58', shade: '#8a6238' };

/** A log lying diagonally, end grain to the viewer; (x, y) is the end-grain centre. */
function log(x: number, y: number, length: number, r: number, angle: number, line: string) {
  return `<g transform="translate(${n(x)} ${n(y)}) rotate(${angle})">
    <path d="M0 ${n(-r)}H${n(length)}a${n(r * 0.5)} ${n(r)} 0 0 1 0 ${n(r * 2)}H0Z" fill="${TIMBER.base}" stroke="${line}" stroke-width="2.4" stroke-linejoin="round"/>
    <path d="M0 ${n(-r)}H${n(length)}a${n(r * 0.5)} ${n(r)} 0 0 1 ${n(r * 0.37)} ${n(r * 0.36)}H0Z" fill="${TIMBER.light}"/>
    <path d="M0 ${n(r * 0.45)}H${n(length + r * 0.45)}a${n(r * 0.5)} ${n(r)} 0 0 1 -${n(r * 0.43)} ${n(r * 0.55)}H0Z" fill="${TIMBER.shade}"/>
    <path d="M${n(length * 0.3)} ${n(-r * 0.2)}h${n(length * 0.35)}M${n(length * 0.45)} ${n(r * 0.15)}h${n(length * 0.3)}" stroke="${TIMBER.grain}" stroke-width="1.4" stroke-linecap="round" opacity=".7"/>
    <path d="M0 ${n(-r)}H${n(length)}a${n(r * 0.5)} ${n(r)} 0 0 1 0 ${n(r * 2)}H0" fill="none" stroke="${line}" stroke-width="2.4" stroke-linejoin="round"/>
    <ellipse cx="0" cy="0" rx="${n(r * 0.62)}" ry="${n(r)}" fill="${END_GRAIN.base}" stroke="${line}" stroke-width="2.4"/>
    <ellipse cx="0" cy="0" rx="${n(r * 0.38)}" ry="${n(r * 0.62)}" fill="none" stroke="${END_GRAIN.ring}" stroke-width="1.4"/>
    <ellipse cx="0" cy="0" rx="${n(r * 0.14)}" ry="${n(r * 0.24)}" fill="${END_GRAIN.ring}"/>
  </g>`;
}

/** Rough stone chunk centred near (cx, cy), about `s` wide. */
function stoneChunk(cx: number, cy: number, s: number, seed = 0): string {
  const k = s / 46;
  const base: [number, number][] = [
    [-22, 8],
    [-17, -9],
    [-5, -19],
    [12, -16],
    [22, -4],
    [19, 14],
    [3, 20],
    [-15, 19],
  ];
  const pts = base.map(([x, y], i) => {
    const j = Math.sin(i * 3.1 + seed * 7) * 1.6;
    return [cx + (x + j) * k, cy + (y - j) * k] as [number, number];
  });
  return facets(pts, [cx + 2 * k, cy - 2 * k], STONE_RAMP, INK, 2.4, 0.35);
}

/** Gold nugget centred near (cx, cy), about `s` wide: faceted ore, lit like the stone. */
function goldNugget(cx: number, cy: number, s: number, seed = 0): string {
  const k = s / 46;
  const base: [number, number][] = [
    [-21, 6],
    [-14, -10],
    [-2, -17],
    [10, -12],
    [21, -8],
    [22, 8],
    [10, 17],
    [-8, 18],
  ];
  const pts = base.map(([x, y], i) => {
    const j = Math.sin(i * 2.3 + seed * 5) * 1.8;
    return [cx + (x + j) * k, cy + (y - j * 0.6) * k] as [number, number];
  });
  return `${facets(pts, [cx - 1 * k, cy - 3 * k], GOLD_RAMP, INK, 2.4, 0.4)}
    <path d="M${n(cx - 12 * k)} ${n(cy - 5 * k)}L${n(cx - 4 * k)} ${n(cy - 11 * k)}" stroke="#fffbe6" stroke-width="${n(2.4 * k)}" stroke-linecap="round"/>`;
}

/** Four-pointed glint at (x, y) with radius r. */
function glint(x: number, y: number, r: number, line = INK): string {
  const q = r * 0.28;
  return `<path d="M${n(x)} ${n(y - r)}L${n(x + q)} ${n(y - q)}L${n(x + r)} ${n(y)}L${n(x + q)} ${n(y + q)}L${n(x)} ${n(y + r)}L${n(x - q)} ${n(y + q)}L${n(x - r)} ${n(y)}L${n(x - q)} ${n(y - q)}Z" fill="${GOLD_LIGHT}" stroke="${line}" stroke-width=".9" stroke-linejoin="round"/>`;
}

const RESOURCE_BODY: Record<ResourceType, string> = {
  wood: log(18, 38, 32, 11, -22, INK),
  stone: stoneChunk(32, 34, 50),
  gold: `${goldNugget(30, 36, 50)}${glint(50, 14, 7)}${glint(13, 50, 4)}`,
};

/** Resource icon, 64×64: a log, a stone chunk, a gold nugget. */
export function resourceIcon(resource: ResourceType): string {
  return svg(64, 64, RESOURCE_BODY[resource]);
}

/**
 * Map piece for a resource deposit, 88×68, standing at (44, 58), centred on its tile at y 40:
 * a woodpile with a chopping block, a heap of quarry stone, a gold-veined outcrop with nuggets.
 */
export function deposit(resource: ResourceType): Art {
  let body: string;
  if (resource === 'wood') {
    body = `${groundShadow(44, 58, 38, 7)}
      <g transform="translate(66 50)">
        <path d="M-9 8V-5h18V8Q0 11-9 8Z" fill="${TIMBER.shade}" stroke="${INK}" stroke-width="2.2" stroke-linejoin="round"/>
        <ellipse cx="0" cy="-5" rx="9" ry="3.6" fill="${END_GRAIN.base}" stroke="${INK}" stroke-width="2.2"/>
        <ellipse cx="0" cy="-5" rx="5" ry="1.8" fill="none" stroke="${END_GRAIN.ring}" stroke-width="1.2"/>
        <path d="M1-6L9-24" stroke="${INK}" stroke-width="3.6" stroke-linecap="round"/>
        <path d="M1-6L9-24" stroke="${TIMBER.light}" stroke-width="1.8" stroke-linecap="round"/>
        <path d="M5-26L14-22L13-14L6-18Z" fill="${STEEL}" stroke="${INK}" stroke-width="1.8" stroke-linejoin="round"/>
        <path d="M13-22L12-15" stroke="${GRANITE.shade}" stroke-width="1.2"/>
      </g>
      ${log(14, 48, 30, 9, -8, INK)}
      ${log(31, 50, 26, 9, -8, INK)}
      ${log(22, 34, 28, 9, -8, INK)}`;
  } else if (resource === 'stone') {
    body = `${groundShadow(44, 58, 38, 7)}
      ${stoneChunk(62, 44, 36, 2)}
      ${stoneChunk(36, 36, 50, 1)}
      <g stroke="${INK}" stroke-width="2.2" stroke-linejoin="round">
        <path d="M10 46L18 40H34L26 46Z" fill="${GRANITE.light}"/>
        <path d="M26 46L34 40V50L26 56Z" fill="${GRANITE.shade}"/>
        <rect x="10" y="46" width="16" height="10" fill="${GRANITE.base}"/>
      </g>
      ${stoneChunk(72, 54, 14, 3)}`;
  } else {
    // A gold mine: earth mound with a timbered adit, a heap of nuggets spilling out in front.
    const mound: [number, number][] = [
      [8, 56],
      [14, 38],
      [28, 24],
      [46, 18],
      [64, 24],
      [76, 38],
      [80, 56],
    ];
    body = `${groundShadow(44, 58, 38, 7)}
      ${facets(mound, [44, 34], EARTH, INK, 2.4, 0.3)}
      <path d="M33 56V38Q44 28 55 38V56Z" fill="${INK}"/>
      <path d="M36 56V40Q44 33 52 40V56Z" fill="#2a1d10"/>
      <g stroke="${INK}" stroke-width="2.2" stroke-linejoin="round">
        <rect x="30" y="35" width="5.5" height="21" fill="${TIMBER.base}"/>
        <rect x="52.5" y="35" width="5.5" height="21" fill="${TIMBER.shade}"/>
        <rect x="27" y="30" width="34" height="6" rx="1" fill="${TIMBER.light}"/>
      </g>
      <path d="M31.6 38v16M54 38v16" stroke="${TIMBER.grain}" stroke-width="1" opacity=".6"/>
      ${goldNugget(22, 52, 20, 1)}${goldNugget(60, 54, 18, 2)}${goldNugget(41, 56, 22, 0)}${goldNugget(30, 58, 14, 3)}${goldNugget(70, 57, 12, 4)}
      ${glint(16, 40, 4.5)}${glint(68, 42, 5)}${glint(46, 47, 3.5)}`;
  }
  return { svg: svg(88, 68, body), width: 88, height: 68, anchor: { x: 44, y: 58 }, centreY: 40 };
}

// ---- Vegetation ----

interface Foliage {
  base: string;
  shade: string;
  light: string;
}

export const FOLIAGE: Foliage[] = [
  { base: '#5f9a3f', shade: '#3d722c', light: '#8fc25c' },
  { base: '#4c8a3c', shade: '#2e6129', light: '#78ad4f' },
  { base: '#6f9c36', shade: '#4b7524', light: '#a0c75a' },
  { base: '#a9a540', shade: '#7a7a2a', light: '#cfc865' },
  { base: '#8f9a3a', shade: '#646e26', light: '#b8c05e' },
];

let clipId = 0;

/**
 * Broadleaf tree, 48×56, standing at (24, 50): a calm crown of a few round clumps, shaded lower
 * right with one highlight upper left, on a short trunk. `seed` shifts the clumps a little.
 */
export function broadleaf(f: Foliage, seed = 0): Art {
  const line = shade(f.shade, 0.55);
  const j = (k: number) => Math.sin(seed * 3.1 + k) * 1.2;
  const clumps: [number, number, number][] = [
    [15 + j(1), 29, 9.5],
    [33 + j(2), 29 + j(3) * 0.5, 9.5],
    [24, 18 + j(4) * 0.6, 12],
    [24 + j(5), 32, 9],
  ];
  const circles = (attrs: string) =>
    clumps.map(([x, y, r]) => `<circle cx="${n(x)}" cy="${n(y)}" r="${r}" ${attrs}/>`).join('');
  const id = `crown${clipId++}`;
  const body = `
    ${groundShadow(25, 50, 12, 3.2, line, 0.25)}
    <path d="M21.8 50l.9-12h2.6l.9 12z" fill="#6b4423" stroke="${line}" stroke-width="1.3" stroke-linejoin="round"/>
    ${circles(`fill="${line}" stroke="${line}" stroke-width="3.2"`)}
    <defs><clipPath id="${id}">${circles('')}</clipPath></defs>
    ${circles(`fill="${f.base}"`)}
    <g clip-path="url(#${id})">
      <circle cx="36" cy="40" r="17" fill="${f.shade}"/>
      <circle cx="18" cy="12" r="7.5" fill="${f.light}"/>
      <circle cx="10.5" cy="25" r="3.6" fill="${f.light}" opacity=".85"/>
    </g>`;
  return { svg: svg(48, 56, body), width: 48, height: 56, anchor: { x: 24, y: 50 } };
}

/** Conifer, 40×60, standing at (20, 54): three tiers, each upper tier overlapping the one below. */
export function conifer(dark: boolean): Art {
  const [base, dim, light] = dark
    ? ['#3b6b45', '#244a2f', '#5a8f5f']
    : ['#4a7d4a', '#2f5a34', '#6fa064'];
  const line = shade(dim, 0.55);
  // Bottom first: the higher tiers are painted over the lower ones.
  const tiers = [
    [20, 22, 17, 49],
    [20, 12, 13.5, 37],
    [20, 3, 10, 25],
  ] as const;
  const tier = ([x, top, half, bottom]: readonly [number, number, number, number]) =>
    `M${x} ${top}L${x + half} ${bottom}Q${x + half / 2} ${bottom + 2.6} ${x} ${bottom}Q${x - half / 2} ${bottom + 2.6} ${x - half} ${bottom}Z`;
  const body = `
    ${groundShadow(22, 54, 11, 3, line, 0.25)}
    <path d="M18.6 54v-8h2.8v8z" fill="#6b4423" stroke="${line}" stroke-width="1.2"/>
    ${tiers
      .map((t) => {
        const [x, top, half, bottom] = t;
        return `<path d="${tier(t)}" fill="${base}"/>
          <path d="M${x} ${top}L${x + half} ${bottom}Q${x + half / 2} ${bottom + 2.6} ${x} ${bottom}Z" fill="${dim}"/>
          <path d="M${x - 1.2} ${top + 5}L${n(x - half * 0.55)} ${bottom - 2.5}" stroke="${light}" stroke-width="1.5" stroke-linecap="round"/>
          <path d="${tier(t)}" fill="none" stroke="${line}" stroke-width="1.7" stroke-linejoin="round"/>`;
      })
      .join('')}`;
  return { svg: svg(40, 60, body), width: 40, height: 60, anchor: { x: 20, y: 54 } };
}

// ---- Rocks (on mountain tiles) ----

const CRAG: Ramp = { light: '#e3d6bc', base: '#bba98a', shade: '#8f7c60' };

/**
 * Rock formation, 100×72, standing at (50, 64): faceted crags and boulders in the same light as
 * every other piece. `variant` 0–3 picks the composition.
 */
export function rocks(variant: number): Art {
  const line = shade(CRAG.shade, 0.55);
  const rock = (pts: [number, number][], ridge: [number, number]) =>
    facets(pts, ridge, CRAG, line, 1.8, 0.4);
  const v = variant % 4;
  const parts: string[] = [];
  if (v === 0) {
    parts.push(
      rock(
        [
          [16, 64],
          [22, 40],
          [36, 22],
          [50, 12],
          [62, 24],
          [74, 30],
          [86, 50],
          [88, 64],
        ],
        [52, 34],
      ),
      rock(
        [
          [70, 64],
          [74, 54],
          [84, 50],
          [94, 58],
          [94, 64],
        ],
        [83, 57],
      ),
    );
  } else if (v === 1) {
    parts.push(
      rock(
        [
          [10, 64],
          [14, 46],
          [28, 34],
          [42, 36],
          [52, 50],
          [52, 64],
        ],
        [32, 48],
      ),
      rock(
        [
          [40, 64],
          [44, 42],
          [56, 26],
          [70, 22],
          [82, 36],
          [90, 64],
        ],
        [66, 40],
      ),
    );
  } else if (v === 2) {
    parts.push(
      rock(
        [
          [34, 64],
          [36, 36],
          [44, 10],
          [54, 6],
          [62, 22],
          [66, 44],
          [68, 64],
        ],
        [52, 28],
      ),
      rock(
        [
          [16, 64],
          [20, 54],
          [30, 50],
          [38, 58],
          [38, 64],
        ],
        [28, 58],
      ),
      rock(
        [
          [64, 64],
          [68, 56],
          [78, 54],
          [84, 64],
        ],
        [74, 60],
      ),
    );
  } else {
    parts.push(
      rock(
        [
          [8, 64],
          [12, 50],
          [26, 40],
          [58, 36],
          [80, 42],
          [92, 56],
          [92, 64],
        ],
        [46, 50],
      ),
      rock(
        [
          [26, 46],
          [30, 30],
          [42, 22],
          [52, 28],
          [56, 40],
        ],
        [42, 34],
      ),
    );
  }
  const body = `${groundShadow(52, 64, 42, 5, line, 0.22)}${parts.join('')}`;
  return { svg: svg(100, 72, body), width: 100, height: 72, anchor: { x: 50, y: 64 } };
}

/**
 * Loose boulders for the rim of a rock area and the meadow around it, 48×34, standing at (24, 30):
 * one or two low faceted stones. `variant` 0–2 picks the composition.
 */
export function boulder(variant: number): Art {
  const line = shade(CRAG.shade, 0.55);
  const rock = (pts: [number, number][], ridge: [number, number]) =>
    facets(pts, ridge, CRAG, line, 1.6, 0.4);
  const v = variant % 3;
  const parts =
    v === 0
      ? [
          rock(
            [
              [6, 30],
              [9, 20],
              [19, 13],
              [31, 15],
              [38, 25],
              [37, 30],
            ],
            [23, 22],
          ),
        ]
      : v === 1
        ? [
            rock(
              [
                [4, 30],
                [7, 22],
                [16, 17],
                [24, 21],
                [25, 30],
              ],
              [15, 24],
            ),
            rock(
              [
                [21, 30],
                [24, 24],
                [33, 20],
                [42, 24],
                [44, 30],
              ],
              [33, 26],
            ),
          ]
        : [
            rock(
              [
                [10, 30],
                [12, 18],
                [20, 9],
                [27, 12],
                [31, 23],
                [30, 30],
              ],
              [21, 19],
            ),
            rock(
              [
                [30, 30],
                [33, 25],
                [39, 24],
                [42, 30],
              ],
              [36, 27],
            ),
          ];
  const body = `${groundShadow(24, 30, 19, 2.6, line, 0.2)}${parts.join('')}`;
  return { svg: svg(48, 34, body), width: 48, height: 34, anchor: { x: 24, y: 30 } };
}

// ---- Small details ----

const GRASS_GREEN = { light: '#9cc25e', base: '#6f9a3f', line: '#3f5f24' };

/** Grass tuft, 24×18, standing at (12, 16): five tapered blades, the outer ones bent outward. */
export function grassTuft(): Art {
  const blade = (x: number, w: number, tipX: number, tipY: number, fill: string) =>
    `<path d="M${x} 16Q${n(x + (tipX - x) * 0.2)} ${n(16 - (16 - tipY) * 0.55)} ${tipX} ${tipY}Q${n(x + w + (tipX - x - w) * 0.35)} ${n(16 - (16 - tipY) * 0.5)} ${x + w} 16Z" fill="${fill}" stroke="${GRASS_GREEN.line}" stroke-width=".9" stroke-linejoin="round"/>`;
  const body = `
    ${groundShadow(12.5, 16, 8, 1.6, GRASS_GREEN.line, 0.2)}
    ${blade(4, 3, 1, 7, GRASS_GREEN.base)}
    ${blade(15.5, 3, 22, 6.5, GRASS_GREEN.base)}
    ${blade(7, 3.2, 6, 2.5, GRASS_GREEN.light)}
    ${blade(12.5, 3.2, 16, 3, GRASS_GREEN.light)}
    ${blade(9.6, 3.4, 11, 0.8, GRASS_GREEN.base)}`;
  return { svg: svg(24, 18, body), width: 24, height: 18, anchor: { x: 12, y: 16 } };
}

/** A few short wave strokes around a hull's waterline, (x0..x1) at y. */
function wake(x0: number, x1: number, y: number): string {
  return `<path d="M${x0 - 6} ${y + 1}q3-2.4 6 0M${x1} ${y + 1}q3-2.4 6 0M${x0 + 6} ${y + 4}q3-2 6 0q3 2 6 0M${x1 - 18} ${y + 4}q3-2 6 0" fill="none" stroke="#5e6f7a" stroke-width="1.3" stroke-linecap="round" opacity=".7"/>`;
}

/** Cog for the open sea, 68×56, floating at (34, 46): round hull, aft castle, square sail. */
export function ship(): Art {
  const line = TIMBER.grain;
  const body = `
    ${wake(10, 56, 45)}
    <path d="M34 47V6" stroke="${line}" stroke-width="2.4" stroke-linecap="round"/>
    <path d="M34 4l11 3.2-11 3.2z" fill="${SEAL}" stroke="${line}" stroke-width="1.1" stroke-linejoin="round"/>
    <path d="M19 12Q34 9 49 12L48 31Q34 34 20 31Z" fill="${PARCHMENT}" stroke="${line}" stroke-width="1.6" stroke-linejoin="round"/>
    <path d="M40 11.2Q45 11.6 49 12L48 31Q44 32.2 40 32.8Z" fill="#e2d5b4"/>
    <path d="M29.5 10.5V33M38.5 10.5V33" stroke="${SEAL}" stroke-width="3.2" opacity=".8"/>
    <path d="M19 12Q34 9 49 12L48 31Q34 34 20 31Z" fill="none" stroke="${line}" stroke-width="1.6" stroke-linejoin="round"/>
    <path d="M17 11.5Q34 8 51 11.5" fill="none" stroke="${line}" stroke-width="2" stroke-linecap="round"/>
    <path d="M47 35V28H59V33" fill="${TIMBER.light}" stroke="${line}" stroke-width="1.6" stroke-linejoin="round"/>
    <path d="M4 33L12 36H54L63 31Q60 45 34 47Q10 46 4 33Z" fill="${TIMBER.base}" stroke="${line}" stroke-width="1.8" stroke-linejoin="round"/>
    <path d="M40 46.5Q58 44 62 33L54 36H44Z" fill="${TIMBER.shade}"/>
    <path d="M7.5 39Q30 43 61 37M11 43Q32 46.5 57 42" fill="none" stroke="${line}" stroke-width="1" opacity=".7"/>
    <path d="M12 36H54" stroke="${TIMBER.light}" stroke-width="1.4"/>
    <path d="M4 33L12 36H54L63 31Q60 45 34 47Q10 46 4 33Z" fill="none" stroke="${line}" stroke-width="1.8" stroke-linejoin="round"/>`;
  return { svg: svg(68, 56, body), width: 68, height: 56, anchor: { x: 34, y: 46 } };
}

/** Small fishing boat for lakes and straits, 40×34, floating at (20, 28): one lateen sail. */
export function boat(): Art {
  const line = TIMBER.grain;
  const body = `
    ${wake(8, 30, 27)}
    <path d="M19 28V5" stroke="${line}" stroke-width="1.8" stroke-linecap="round"/>
    <path d="M20 5Q31 13 33 24H20Z" fill="${PARCHMENT}" stroke="${line}" stroke-width="1.4" stroke-linejoin="round"/>
    <path d="M26 11Q31 16 33 24H27Z" fill="#e2d5b4"/>
    <path d="M20 5Q31 13 33 24H20Z" fill="none" stroke="${line}" stroke-width="1.4" stroke-linejoin="round"/>
    <path d="M4 22L9 24H32L37 21Q35 29 20 29.5Q7 29 4 22Z" fill="${TIMBER.base}" stroke="${line}" stroke-width="1.5" stroke-linejoin="round"/>
    <path d="M7 26Q20 28.5 35 24.5" fill="none" stroke="${line}" stroke-width=".9" opacity=".7"/>
    <path d="M9 24H32" stroke="${TIMBER.light}" stroke-width="1.2"/>`;
  return { svg: svg(40, 34, body), width: 40, height: 34, anchor: { x: 20, y: 28 } };
}

// ---- Sites ----

const LINE = `stroke="${INK}" stroke-width="2.4" stroke-linejoin="round"`;

const merlons = (xs: number[], y: number, fill: string, w = 5.5, h = 6.5) =>
  xs
    .map((x) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${fill}" ${LINE}/>`)
    .join('');

/** Mortar lines: courses at `rows`, joints staggered every other course. */
const bricks = (x0: number, x1: number, rows: number[], gap = 10) =>
  rows
    .map((y, i) => {
      let d = `M${x0 + 2} ${y}H${x1 - 2}`;
      for (let x = x0 + (i % 2 ? gap / 2 : gap); x < x1 - 3; x += gap) d += `M${x} ${y}v-7`;
      return d;
    })
    .join('');

const mortar = (x0: number, x1: number, rows: number[], gap?: number) =>
  `<path d="${bricks(x0, x1, rows, gap)}" stroke="${MASONRY.mortar}" stroke-width="1" fill="none" opacity=".75"/>`;

/** Arched gate with planked doors, bottom at y, centred on x. */
function gate(x: number, y: number, w: number, h: number): string {
  const r = w / 2;
  const iw = w - 7;
  const ir = iw / 2;
  return `<path d="M${x - r} ${y}V${y - h + r}a${r} ${r} 0 0 1 ${w} 0V${y}Z" fill="${MASONRY.shade}" ${LINE}/>
    <path d="M${x - ir} ${y}V${y - h + r + 1}a${ir} ${ir} 0 0 1 ${iw} 0V${y}Z" fill="${TIMBER.shade}" stroke="${INK}" stroke-width="1.8"/>
    <path d="M${x - ir / 2} ${y}V${y - h + r + 1 - ir * 0.6}M${x} ${y}V${y - h + r + 1 - ir}M${x + ir / 2} ${y}V${y - h + r + 1 - ir * 0.6}M${x - ir} ${y - h * 0.35}h${iw}" stroke="${TIMBER.grain}" stroke-width="1.3"/>
    <circle cx="${x + 2}" cy="${y - h * 0.3}" r="1.2" fill="${GOLD}" stroke="${INK}" stroke-width=".8"/>`;
}

/** Hanging banner in the owner's colour, top-left at (x, y). */
function banner(x: number, y: number, color: string, w = 9, h = 15): string {
  const light = shade(color, 1.35);
  return `<path d="M${x} ${y}h${w}v${h}l-${w / 2}-${h * 0.22}L${x} ${y + h}Z" fill="${color}" stroke="${INK}" stroke-width="1.6" stroke-linejoin="round"/>
    <path d="M${x + w * 0.22} ${y + 4}h${w * 0.56}" stroke="${light}" stroke-width="1.4"/>`;
}

/** Pointed roof (cone) over [x0, x1] with its eaves at y and apex at `apex`. */
function cone(x0: number, x1: number, y: number, apex: number, color: string, finial = true) {
  const mid = (x0 + x1) / 2;
  const dark = shade(color, 0.66);
  const light = shade(color, 1.3);
  const sag = (x1 - x0) * 0.18;
  return `<path d="M${x0} ${y}L${mid} ${apex}L${x1} ${y}Q${mid} ${y + sag} ${x0} ${y}Z" fill="${color}" ${LINE}/>
    <path d="M${mid} ${apex}L${x1} ${y}Q${mid + (x1 - mid) * 0.5} ${y + sag * 0.8} ${mid} ${y + sag * 0.85}Z" fill="${dark}"/>
    <path d="M${n(mid - (x1 - x0) * 0.22)} ${n(y - (y - apex) * 0.28)}L${n(mid - (x1 - x0) * 0.05)} ${n(apex + (y - apex) * 0.2)}" stroke="${light}" stroke-width="2" stroke-linecap="round"/>
    <path d="M${x0} ${y}L${mid} ${apex}L${x1} ${y}Q${mid} ${y + sag} ${x0} ${y}Z" fill="none" ${LINE}/>
    ${finial ? `<circle cx="${mid}" cy="${apex - 1}" r="2.6" fill="${GOLD}" stroke="${INK}" stroke-width="1.4"/>` : ''}`;
}

/** Swallow-tailed pennant on a pole rising from (x, y) to `top`. */
function pennant(x: number, y: number, top: number, color: string, w = 26, pole = true): string {
  const dark = shade(color, 0.66);
  return `${pole ? `<path d="M${x} ${y}V${top}" stroke="${INK}" stroke-width="2.2"/>` : ''}
    <path d="M${x} ${top + 1}H${x + w}L${x + w * 0.79} ${top + 7}L${x + w} ${top + 13}H${x}Z" fill="${color}" stroke="${INK}" stroke-width="1.8" stroke-linejoin="round"/>
    <path d="M${x} ${top + 8}H${x + w * 0.88}L${x + w} ${top + 13}H${x}Z" fill="${dark}"/>
    <path d="M${x} ${top + 1}H${x + w}L${x + w * 0.79} ${top + 7}L${x + w} ${top + 13}H${x}Z" fill="none" stroke="${INK}" stroke-width="1.8" stroke-linejoin="round"/>`;
}

/** Round tower body [x, x + w] from `top` down to `bottom`, shaded right, with a slit window. */
function roundTower(x: number, w: number, top: number, bottom: number): string {
  const curve = w * 0.15;
  const rows: number[] = [];
  for (let y = top + 12; y < bottom - 3; y += 7) rows.push(y);
  return `<path d="M${x} ${top}H${x + w}V${bottom}Q${x + w / 2} ${bottom + curve} ${x} ${bottom}Z" fill="${MASONRY.base}" ${LINE}/>
    <path d="M${x + w * 0.73} ${top + 1.2}H${x + w - 1.2}V${bottom - 0.5}Q${x + w * 0.85} ${bottom + curve * 0.6} ${x + w * 0.73} ${bottom + curve * 0.9}Z" fill="${MASONRY.shade}"/>
    ${mortar(x, x + w, rows)}
    <path d="M${x + w / 2 - 3} ${top + 22}v-5a3 3 0 0 1 6 0v5z" fill="${INK}"/>
    <path d="M${x} ${bottom}Q${x + w / 2} ${bottom + curve} ${x + w} ${bottom}V${top}" fill="none" ${LINE}/>`;
}

/** Square block [x, x + w] × [top, bottom], shaded on its right side. */
function block(x: number, w: number, top: number, bottom: number, fill = MASONRY.base): string {
  const rows: number[] = [];
  for (let y = top + 9; y < bottom - 2; y += 7) rows.push(y);
  return `<rect x="${x}" y="${top}" width="${w}" height="${bottom - top}" fill="${fill}" ${LINE}/>
    <rect x="${x + w - 7}" y="${top + 1.2}" width="5.8" height="${bottom - top - 2.4}" fill="${MASONRY.shade}" opacity=".85"/>
    ${mortar(x, x + w, rows)}
    <rect x="${x}" y="${top}" width="${w}" height="${bottom - top}" fill="none" ${LINE}/>`;
}

/** Number of castle designs; format.ts assigns one per player. */
export const CASTLE_STYLE_NAMES = ['Burg', 'Bergfried', 'Zitadelle'] as const;

/**
 * Castle in the owner's colour, 120×110, standing at (60, 96), body centred at y 66.
 * Style 0 "Burg": two round towers and a keep. 1 "Bergfried": one tall square keep between
 * crenellated corner towers. 2 "Zitadelle": a great round tower under a tall cone, slim spires.
 */
export function castle(color: string, style = 0): Art {
  let body: string;
  if (style === 1) {
    body = `
      ${groundShadow(60, 97, 56, 8)}
      ${merlons([16, 24.5, 79.5, 88], 56, MASONRY.base)}
      ${block(16, 24, 62, 96)}${block(80, 24, 62, 96)}
      ${block(40, 40, 36, 96, MASONRY.light)}
      ${cone(30, 90, 38, 2, color)}
      <path d="M53 60v-9a7 7 0 0 1 14 0v9z" fill="${GOLD}" stroke="${INK}" stroke-width="2"/>
      <path d="M60 45v15M53 53h14" stroke="${INK}" stroke-width="1.4"/>
      ${merlons([2, 10, 18, 26], 42, MASONRY.light, 5.5, 6)}
      ${block(2, 30, 48, 96, MASONRY.light)}
      ${banner(9.5, 56, color, 14, 22)}
      ${merlons([88, 96, 104, 112], 42, MASONRY.light, 5.5, 6)}
      ${block(88, 30, 48, 96, MASONRY.light)}
      ${banner(96.5, 56, color, 14, 22)}
      ${gate(60, 96, 24, 24)}`;
  } else if (style === 2) {
    body = `
      ${groundShadow(60, 97, 56, 8)}
      ${roundTower(12, 16, 44, 86)}${cone(8, 32, 45, 10, color)}
      ${roundTower(92, 16, 44, 86)}${cone(88, 112, 45, 10, color)}
      ${roundTower(34, 52, 42, 92)}
      ${cone(28, 92, 44, 4, color)}
      <path d="M54 62v-7a6 6 0 0 1 12 0v7z" fill="${GOLD}" stroke="${INK}" stroke-width="2"/>
      ${merlons([16, 24.5, 33, 41.5, 72.5, 81, 89.5, 98], 70, MASONRY.base)}
      <path d="M16 76H104V95Q60 101 16 95Z" fill="${MASONRY.base}" ${LINE}/>
      <path d="M96 77.2H102.8V95Q99.5 96 96 96.4Z" fill="${MASONRY.shade}"/>
      ${mortar(16, 104, [83, 90])}
      <path d="M16 95Q60 101 104 95V76" fill="none" ${LINE}/>
      ${banner(24, 79, color, 8, 13)}${banner(88, 79, color, 8, 13)}
      ${gate(60, 98, 22, 24)}`;
  } else {
    body = `
      ${groundShadow(60, 97, 56, 8)}
      ${pennant(60, 30, 5, color)}
      ${merlons([41, 50, 58.5, 67, 73.5], 25, MASONRY.light)}
      ${block(41, 38, 31, 67, MASONRY.light)}
      <path d="M55 52v-8a5 5 0 0 1 10 0v8z" fill="${GOLD}" stroke="${INK}" stroke-width="2"/>
      <path d="M60 39v13M55 46h10" stroke="${INK}" stroke-width="1.4"/>
      ${merlons([30, 38.5, 47, 55.5, 64, 72.5, 81], 55, MASONRY.base)}
      ${block(30, 60, 61, 96)}
      <rect x="30" y="88" width="60" height="8" fill="${MASONRY.shade}" ${LINE}/>
      ${gate(60, 96, 24, 22)}
      ${banner(34, 66, color)}${banner(77, 66, color)}
      ${roundTower(4, 26, 50, 95)}${cone(0, 30, 51, 14, color)}
      ${roundTower(90, 26, 50, 95)}${cone(86, 116, 51, 14, color)}`;
  }
  return {
    svg: svg(120, 110, body),
    width: 120,
    height: 110,
    anchor: { x: 60, y: 96 },
    centreY: 66,
  };
}

/** Outpost ("Stützpunkt") in the owner's colour: a watchtower behind a palisade. 84×80, standing
 *  at (42, 72), centred at y 50. */
export function outpost(color: string): Art {
  const stakes: string[] = [];
  for (let i = 0; i < 9; i++) {
    const x = 8 + i * 7.6;
    const dip = Math.abs(i - 4) * 0.8;
    stakes.push(
      `<path d="M${n(x)} ${n(72 - dip * 0.4)}V${n(52 + dip)}L${n(x + 3.6)} ${n(46 + dip)}L${n(x + 7.2)} ${n(52 + dip)}V${n(72 - dip * 0.4)}Z" fill="${i % 2 ? TIMBER.base : TIMBER.light}" ${LINE}/>`,
    );
  }
  const body = `
    ${groundShadow(42, 73, 38, 6)}
    ${block(28, 28, 26, 66, MASONRY.light)}
    <path d="M39 40v-6a3 3 0 0 1 6 0v6z" fill="${INK}"/>
    ${cone(22, 62, 27, 4, color)}
    ${stakes.join('')}
    <path d="M8 60H76" stroke="${TIMBER.grain}" stroke-width="2" stroke-linecap="round"/>
    ${banner(37.5, 52, color, 9, 14)}`;
  return { svg: svg(84, 80, body), width: 84, height: 80, anchor: { x: 42, y: 72 }, centreY: 50 };
}

/** Unowned outpost: a broken watchtower with rubble, 84×80 like `outpost`. */
export function ruin(): Art {
  const body = `
    ${groundShadow(42, 73, 38, 6)}
    <path d="M26 72V36L31 32L35 38L40 28L45 35L50 30L56 40V72Z" fill="${MASONRY.base}" ${LINE}/>
    <path d="M49 33L56 40V72H49Z" fill="${MASONRY.shade}"/>
    ${mortar(26, 56, [45, 52, 59, 66])}
    <path d="M38 58v-8a3.5 3.5 0 0 1 7 0v8z" fill="${INK}" opacity=".85"/>
    <path d="M26 72V36L31 32L35 38L40 28L45 35L50 30L56 40V72Z" fill="none" ${LINE}/>
    <path d="M8 72V58L12 55L16 59L20 54V72Z" fill="${MASONRY.base}" ${LINE}/>
    <path d="M62 72V60L68 57L72 62V72Z" fill="${MASONRY.base}" ${LINE}/>
    <g stroke="${INK}" stroke-width="2" stroke-linejoin="round">
      <path d="M58 72l4-6h8l3 6z" fill="${MASONRY.shade}"/>
      <path d="M14 72l3-5h7l2 5z" fill="${MASONRY.light}"/>
      <rect x="70" y="66" width="8" height="6" fill="${MASONRY.base}" transform="rotate(-12 74 69)"/>
    </g>
    <path d="M30 70q2-8 0-14M33 70q3-6 6-8" fill="none" stroke="#557a2a" stroke-width="1.6" stroke-linecap="round"/>`;
  return { svg: svg(84, 80, body), width: 84, height: 80, anchor: { x: 42, y: 72 }, centreY: 50 };
}

/** Compass rose for the HUD, 110×120 (centre at 55, 65). */
export function compassRose(): string {
  const cx = 55;
  const cy = 65;
  const point = (angle: number, length: number, half: number, dark: string, lit: string) => {
    const a = (angle * Math.PI) / 180;
    const tip = [cx + Math.sin(a) * length, cy - Math.cos(a) * length];
    const left = [cx - Math.cos(a) * half, cy - Math.sin(a) * half];
    const right = [cx + Math.cos(a) * half, cy + Math.sin(a) * half];
    const f = (p: number[]) => `${p[0]!.toFixed(2)} ${p[1]!.toFixed(2)}`;
    return `<path d="M${cx} ${cy}L${f(tip)}L${f(left)}Z" fill="${lit}"/>
      <path d="M${cx} ${cy}L${f(tip)}L${f(right)}Z" fill="${dark}"/>
      <path d="M${f(left)}L${f(tip)}L${f(right)}" fill="none" stroke="${INK}" stroke-width="1.4" stroke-linejoin="round"/>`;
  };
  let ticks = '';
  for (let i = 0; i < 32; i++) {
    const a = (i * Math.PI) / 16;
    const inner = i % 4 === 0 ? 37 : 39.5;
    ticks += `<path d="M${(cx + Math.sin(a) * inner).toFixed(2)} ${(cy - Math.cos(a) * inner).toFixed(2)}L${(cx + Math.sin(a) * 42).toFixed(2)} ${(cy - Math.cos(a) * 42).toFixed(2)}"/>`;
  }
  const body = `
    <circle cx="${cx}" cy="${cy}" r="47" fill="${PARCHMENT}" stroke="${INK}" stroke-width="2.2"/>
    <circle cx="${cx}" cy="${cy}" r="42" fill="none" stroke="${INK}" stroke-width="1"/>
    <circle cx="${cx}" cy="${cy}" r="24" fill="none" stroke="${INK}" stroke-width=".8" opacity=".5"/>
    <g stroke="${INK}" stroke-width="1">${ticks}</g>
    ${[45, 135, 225, 315].map((a) => point(a, 27, 6, '#8a7550', '#e9dcbc')).join('')}
    ${[90, 180, 270].map((a) => point(a, 40, 8, INK, '#e9dcbc')).join('')}
    ${point(0, 40, 8, '#9e2a1a', '#e2735f')}
    <circle cx="${cx}" cy="${cy}" r="5" fill="${GOLD}" stroke="${INK}" stroke-width="1.6"/>
    <text x="${cx}" y="15" text-anchor="middle" font-family="Georgia, serif" font-size="16" font-weight="bold" fill="${INK}">N</text>`;
  return svg(110, 120, body);
}

// ---- Armies ----

/** One foot soldier standing at (x, y): helmet, spear, tunic and shield in the owner's colour. */
function soldier(x: number, y: number, scale: number, color: string): string {
  const dark = shade(color, 0.66);
  const light = shade(color, 1.35);
  return `<g transform="translate(${x} ${y}) scale(${scale})">
    <ellipse cx="1" cy="0" rx="10" ry="2.8" fill="${INK}" opacity=".24"/>
    <path d="M-3.2-.6V-8M3.2-.6V-8" stroke="${INK}" stroke-width="4" stroke-linecap="round"/>
    <path d="M-3.2-.6V-8M3.2-.6V-8" stroke="#5a3a1e" stroke-width="2" stroke-linecap="round"/>
    <path d="M7 2V-32" stroke="${INK}" stroke-width="3" stroke-linecap="round"/>
    <path d="M7 2V-32" stroke="${TIMBER.light}" stroke-width="1.4" stroke-linecap="round"/>
    <path d="M7-39.5L9.6-32.5H4.4Z" fill="${STEEL}" stroke="${INK}" stroke-width="1.3" stroke-linejoin="round"/>
    <path d="M-6-7L-5-19Q0-21.6 5-19L6-7Z" fill="${color}" stroke="${INK}" stroke-width="1.8" stroke-linejoin="round"/>
    <path d="M-5.6-11.5H5.6" stroke="${dark}" stroke-width="1.8"/>
    <circle cx="6.6" cy="-14.5" r="2" fill="${SKIN}" stroke="${INK}" stroke-width="1.2"/>
    <circle cx="0" cy="-23.4" r="4" fill="${SKIN}" stroke="${INK}" stroke-width="1.6"/>
    <path d="M-4.8-23.6a4.8 4.8 0 0 1 9.6 0Z" fill="${GRANITE.base}" stroke="${INK}" stroke-width="1.6" stroke-linejoin="round"/>
    <path d="M-2.6-27a3.6 3.6 0 0 1 3-1.2" stroke="${STEEL}" stroke-width="1.1" stroke-linecap="round"/>
    <path d="M-11-18H-1V-11Q-1-5-6-2.6Q-11-5-11-11Z" fill="${color}" stroke="${INK}" stroke-width="1.8" stroke-linejoin="round"/>
    <path d="M-11-18H-1V-14.5H-11Z" fill="${light}" stroke="${INK}" stroke-width="1.2" stroke-linejoin="round"/>
    <circle cx="-6" cy="-9.5" r="1.6" fill="${GOLD}" stroke="${INK}" stroke-width=".9"/>
  </g>`;
}

/** Army: three foot soldiers with spears and shields in the owner's colour, 60×56, standing at (30, 50). */
export function soldiers(color: string): Art {
  const body = `${soldier(17, 42, 0.82, color)}${soldier(43, 42, 0.82, color)}${soldier(30, 50, 1, color)}`;
  return { svg: svg(60, 56, body), width: 60, height: 56, anchor: { x: 30, y: 50 } };
}

/**
 * Claim flag an army plants at a deposit while it gathers: a swallow-tailed pennant on a pole in
 * the owner's colour, 34×52, standing at (8, 48).
 */
export function claimFlag(color: string): Art {
  const body = `
    ${groundShadow(10, 48, 8, 2.4)}
    <path d="M4 48q4-4 8 0z" fill="${TIMBER.shade}" stroke="${INK}" stroke-width="1.6" stroke-linejoin="round"/>
    <path d="M8 47V6" stroke="${INK}" stroke-width="3.4" stroke-linecap="round"/>
    <path d="M8 47V6" stroke="${TIMBER.light}" stroke-width="1.6" stroke-linecap="round"/>
    ${pennant(8, 47, 7, color, 24, false)}
    <circle cx="8" cy="5" r="2.8" fill="${GOLD}" stroke="${INK}" stroke-width="1.4"/>`;
  return { svg: svg(34, 52, body), width: 34, height: 52, anchor: { x: 8, y: 48 } };
}

// ---- Night camp ----

/**
 * Night camp of an army: an A-frame tent in the owner's colour, seen from the front left, with a
 * warmly lit doorway and a little pennant. 56×46, standing at (26, 42).
 */
export function tent(color: string): Art {
  const dark = shade(color, 0.62);
  const light = shade(color, 1.3);
  const line = `stroke="${INK}" stroke-width="2.2" stroke-linejoin="round"`;
  const body = `
    ${groundShadow(28, 42, 24, 3.4)}
    <path d="M4 42L22 42M44 39L52 40" stroke="${INK}" stroke-width="1" opacity=".5"/>
    <path d="M24 10L34 7L52 39L44 42Z" fill="${dark}" ${line}/>
    <path d="M34 7L52 39" stroke="${shade(color, 0.5)}" stroke-width="1"/>
    <path d="M6 42L24 10L44 42Z" fill="${color}" ${line}/>
    <path d="M24 10L11 37" stroke="${light}" stroke-width="2" stroke-linecap="round" opacity=".7"/>
    <path d="M19 42L25 24L32 42Z" fill="#f2a144"/>
    <path d="M22 42L25.5 30L29.5 42Z" fill="${GOLD_LIGHT}"/>
    <path d="M19 42L25 24L15 40Z" fill="${light}" stroke="${INK}" stroke-width="1.4" stroke-linejoin="round"/>
    <path d="M6 42L24 10L44 42Z" fill="none" ${line}/>
    <path d="M24 10V2" stroke="${INK}" stroke-width="1.8" stroke-linecap="round"/>
    <path d="M24 2.4h8l-2 2.3 2 2.3h-8Z" fill="${color}" stroke="${INK}" stroke-width="1.1" stroke-linejoin="round"/>`;
  return { svg: svg(56, 46, body), width: 56, height: 46, anchor: { x: 26, y: 42 } };
}

/** Campfire base (stones and crossed logs) without flame, 30×18, standing at (15, 14). The
 *  flame (`flame`) is drawn on top separately so it can flicker. */
export function campfire(): Art {
  const stones = [6, 11, 17, 23]
    .map(
      (x, i) =>
        `<ellipse cx="${x + 1}" cy="${i % 3 ? 14.5 : 13.5}" rx="3.4" ry="2.4" fill="${GRANITE.base}" stroke="${INK}" stroke-width="1.1"/>`,
    )
    .join('');
  const body = `
    ${groundShadow(15, 14.5, 12, 2.2)}
    <g stroke="${INK}" stroke-width="1.4" stroke-linejoin="round">
      <path d="M5 13L23 6l1.6 3L6.6 16Z" fill="${TIMBER.base}"/>
      <path d="M25 13L7 6l-1.6 3l17.8 7Z" fill="${TIMBER.shade}"/>
    </g>
    ${stones}`;
  return { svg: svg(30, 18, body), width: 30, height: 18, anchor: { x: 15, y: 14 } };
}

// ---- Treasure ----

/**
 * Chest lid and body as separate markup (ChestOpening flies the lid off), 56×48 canvas, seen
 * straight from the front: domed lid with a trim, planked body on little feet, iron bands with
 * rivets, brass corners and a big lock. Lit from the left like every other piece.
 */
export function chestParts(): { lid: string; body: string; shadow: string } {
  const line = `stroke="${INK}" stroke-width="2.2" stroke-linejoin="round"`;
  const dome = 'M7 24V19Q7 8 28 8Q49 8 49 19V24Z';
  const rivets = (x: number, ys: number[]) =>
    ys.map((y) => `<circle cx="${x}" cy="${y}" r=".9" fill="${GOLD}"/>`).join('');
  const lidBand = (x: number) =>
    `<path d="M${x} 24V${x < 28 ? 13.2 : 10.4}Q${x + 2} ${x < 28 ? 11.6 : 9.6} ${x + 4} ${x < 28 ? 10.4 : 11.6}V24Z" fill="${IRON.base}" stroke="${INK}" stroke-width="1.4" stroke-linejoin="round"/>
     ${rivets(x + 2, [16, 21])}`;
  const band = (x: number) =>
    `<rect x="${x}" y="27" width="4" height="15" fill="${IRON.base}" stroke="${INK}" stroke-width="1.4"/>
     <path d="M${x + 1} 28.5v12" stroke="${IRON.light}" stroke-width=".9"/>
     ${rivets(x + 2, [31, 38.5])}`;
  return {
    shadow: groundShadow(28, 44.5, 24, 3.6),
    lid: `<path d="${dome}" fill="${TIMBER.base}" ${line}/>
      <path d="M41 9.4Q48.4 11.6 48.4 19V23.4H43Z" fill="${TIMBER.shade}" opacity=".8"/>
      <path d="M7.6 19Q7.6 9.6 15 9.2V23.4H7.6Z" fill="${TIMBER.light}" opacity=".7"/>
      <path d="M8.5 17.5Q12 12.8 28 12.8Q44 12.8 47.5 17.5" fill="none" stroke="${TIMBER.grain}" stroke-width="1" opacity=".55"/>
      <path d="M11 12.6Q15 9.8 28 9.8" fill="none" stroke="${END_GRAIN.base}" stroke-width="1.6" stroke-linecap="round" opacity=".9"/>
      ${lidBand(12.5)}${lidBand(39.5)}
      <path d="${dome}" fill="none" ${line}/>
      <rect x="5.5" y="22.5" width="45" height="4.5" rx="1" fill="${TIMBER.shade}" ${line}/>
      <path d="M7 23.8H49" stroke="${TIMBER.light}" stroke-width="1" opacity=".6"/>
      <path d="M24.5 22v6h7v-6z" fill="${GOLD}" stroke="${INK}" stroke-width="1.4" stroke-linejoin="round"/>`,
    body: `<path d="M9 42v3h5v-3M42 42v3h5v-3" fill="${TIMBER.shade}" stroke="${INK}" stroke-width="1.6" stroke-linejoin="round"/>
      <rect x="7" y="26" width="42" height="17" rx="1" fill="${TIMBER.base}" ${line}/>
      <rect x="8.2" y="27.2" width="5" height="14.6" fill="${TIMBER.light}" opacity=".6"/>
      <rect x="42.8" y="27.2" width="5" height="14.6" fill="${TIMBER.shade}" opacity=".8"/>
      <path d="M8.2 32.5H47.8M8.2 37.8H47.8" stroke="${TIMBER.grain}" stroke-width="1" opacity=".6"/>
      ${band(12.5)}${band(39.5)}
      <g fill="${GOLD}" stroke="${INK}" stroke-width="1.1" stroke-linejoin="round">
        <path d="M7 38.5h4.5v4.5H7z"/><path d="M44.5 38.5H49v4.5h-4.5z"/>
      </g>
      <path d="M22.5 28h11v8.5q-5.5 4.2-11 0z" fill="${GOLD}" stroke="${INK}" stroke-width="1.6" stroke-linejoin="round"/>
      <path d="M24.2 29.6h4" stroke="${GOLD_LIGHT}" stroke-width="1.1" stroke-linecap="round"/>
      <path d="M31.8 29.6v5.8" stroke="${GOLD_DEEP}" stroke-width="1.1" stroke-linecap="round"/>
      <circle cx="28" cy="32" r="1.5" fill="${INK}"/><path d="M28 32.5v3" stroke="${INK}" stroke-width="1.4" stroke-linecap="round"/>
      <rect x="7" y="26" width="42" height="17" rx="1" fill="none" ${line}/>`,
  };
}

/** Treasure chest seen from the front. 56×48, centred on its body at (28, 33). */
export function chest(): Art {
  const { lid, body, shadow } = chestParts();
  return {
    svg: svg(56, 48, `${shadow}${body}${lid}`),
    width: 56,
    height: 48,
    anchor: { x: 28, y: 33 },
  };
}

/** Four-pointed glint for chests on the map, 16×16 around its centre. */
export function sparkle(): Art {
  return { svg: svg(16, 16, glint(8, 8, 7.2)), width: 16, height: 16, anchor: { x: 8, y: 8 } };
}

// ---- Alerts ----

/** Alarm badge for a site under attack: crossed swords on a red disc, 40×40 around its centre. */
export function alarm(): Art {
  const sword = (angle: number) => `<g transform="rotate(${angle} 20 20)">
      <path d="M18.6 25.5V10L20 6.8L21.4 10V25.5Z" fill="#eef0f2" stroke="${INK}" stroke-width="1.3" stroke-linejoin="round"/>
      <path d="M20 9v15" stroke="#b9c0c8" stroke-width=".9"/>
      <rect x="14.6" y="25.5" width="10.8" height="2.4" rx=".8" fill="${GOLD}" stroke="${INK}" stroke-width="1.2"/>
      <rect x="19" y="27.9" width="2" height="4.6" fill="#6b4423" stroke="${INK}" stroke-width="1"/>
      <circle cx="20" cy="33.6" r="1.6" fill="${GOLD}" stroke="${INK}" stroke-width="1"/>
    </g>`;
  const body = `
    <circle cx="20" cy="20" r="17.5" fill="${SEAL}" stroke="${INK}" stroke-width="2.4"/>
    <circle cx="20" cy="20" r="14" fill="none" stroke="#d0604c" stroke-width="1.4"/>
    ${sword(-45)}${sword(45)}`;
  return { svg: svg(40, 40, body), width: 40, height: 40, anchor: { x: 20, y: 20 } };
}

/** Billowing smoke puff after an assault, 50×48 around its centre; `seed` varies the outline. */
export function smokePuff(seed = 0): Art {
  const outer = lobed(25, 24, 16, 7, seed, 0.06);
  const id = `smoke${clipId++}`;
  const body = `
    <defs><clipPath id="${id}"><path d="${outer}"/></clipPath></defs>
    <path d="${outer}" fill="#b9ae9c"/>
    <g clip-path="url(#${id})">
      <path d="${lobed(34, 36, 16, 6, seed + 1, 0.05)}" fill="#998f80"/>
      <path d="${lobed(17, 15, 8, 5, seed + 2, 0.05)}" fill="#e2dacb"/>
    </g>
    <path d="${outer}" fill="none" stroke="#5d5347" stroke-width="1.8" stroke-linejoin="round"/>`;
  return { svg: svg(50, 48, body), width: 50, height: 48, anchor: { x: 25, y: 24 } };
}

/** Flame licking from a burnt site, 24×32, standing at (12, 30). */
export function flame(): Art {
  const body = `
    <path d="M12 30C4 30 3 22 7 16C8 20 10 20 10 18C9 12 12 6 16 2C15 9 21 12 21 20C21 26 18 30 12 30Z" fill="#e0662a" stroke="${INK}" stroke-width="1.8" stroke-linejoin="round"/>
    <path d="M12 28C8 28 8 23 10 20C11 22 12 22 12.5 20C12.5 17 14 14 16 12C16 17 18 19 18 23C18 26 16 28 12 28Z" fill="${GOLD}"/>
    <path d="M12 27C10.5 27 10.5 25 11.5 23.5C12.5 24.5 14 24 14.5 23C15 25 14 27 12 27Z" fill="${GOLD_LIGHT}"/>`;
  return { svg: svg(24, 32, body), width: 24, height: 32, anchor: { x: 12, y: 30 } };
}
