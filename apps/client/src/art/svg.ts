import type { ResourceType } from '@vectoria/shared';

// Hand-drawn art as SVG source. The same markup feeds the HUD (<img> data URLs) and the map
// (rasterised to Pixi textures in textures.ts), so both always look alike.

export const INK = '#3b2a18';

export interface Art {
  svg: string;
  width: number;
  height: number;
  /** Ground point in art pixels: where the art stands on the map. */
  anchor: { x: number; y: number };
}

function svg(width: number, height: number, body: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${body}</svg>`;
}

export function dataUrl(markup: string): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(markup)}`;
}

// ---- Resources ----

const RESOURCE_BODY: Record<ResourceType, string> = {
  // One log lying diagonally, end grain towards the viewer, with a leafy twig.
  wood: `<g transform="rotate(-24 32 34)" stroke="${INK}" stroke-width="2.6" stroke-linejoin="round">
      <path d="M17 22H50a6 12 0 0 1 0 24H17Z" fill="#8f5a2a"/>
      <path d="M17 22H50a6 12 0 0 1 4.4 4.2H17Z" fill="#a8703a" stroke="none"/>
      <path d="M24 30q8 2 18 0M27 39q7-2 16 0" fill="none" stroke="#5e3a18" stroke-width="1.8" stroke-linecap="round"/>
      <ellipse cx="38" cy="34.5" rx="2.4" ry="1.8" fill="#6b4220" stroke-width="1.4"/>
      <path d="M35 22v-6" stroke-width="2.2" stroke-linecap="round"/>
      <path d="M35 17c5-6 11-5 13-3c-3 5-9 6-13 3z" fill="#6aa046" stroke-width="1.8"/>
      <ellipse cx="17" cy="34" rx="8" ry="12" fill="#eec58c"/>
      <ellipse cx="17" cy="34" rx="5" ry="7.6" fill="none" stroke="#c99256" stroke-width="1.6"/>
      <ellipse cx="17" cy="34" rx="2.2" ry="3.4" fill="none" stroke="#c99256" stroke-width="1.4"/>
    </g>`,
  // One cut block.
  stone: `<g stroke="${INK}" stroke-width="2.6" stroke-linejoin="round">
      <path d="M9 28L23 17H55L41 28Z" fill="#e4e7eb"/>
      <path d="M41 28L55 17V42L41 53Z" fill="#7d8590"/>
      <rect x="9" y="28" width="32" height="25" fill="#aab1ba"/>
    </g>
    <path d="M13 32h14" stroke="#d6dadf" stroke-width="2" stroke-linecap="round"/>`,
  // One coin.
  gold: `<circle cx="34" cy="35" r="22" fill="#b07f14" stroke="${INK}" stroke-width="2.6"/>
    <circle cx="31" cy="32" r="22" fill="#f4c533" stroke="${INK}" stroke-width="2.6"/>
    <circle cx="31" cy="32" r="15.5" fill="none" stroke="#c9951b" stroke-width="2"/>
    <path d="M31 22l3 6.2l6.8 1l-4.9 4.8l1.2 6.8l-6.1-3.2l-6.1 3.2l1.2-6.8l-4.9-4.8l6.8-1z" fill="#e2ad25" stroke="#a87a14" stroke-width="1.4" stroke-linejoin="round"/>
    <path d="M18 24a15 15 0 0 1 8-6" fill="none" stroke="#fff3c4" stroke-width="2.6" stroke-linecap="round"/>`,
};

/** Resource icon, 64×64. */
export function resourceIcon(resource: ResourceType): string {
  return svg(64, 64, RESOURCE_BODY[resource]);
}

export const SPOT_RING: Record<ResourceType, string> = {
  wood: '#7a4b22',
  stone: '#5f6670',
  gold: '#c99a12',
};

/** Map marker for a resource spot: parchment medallion with a coloured rim, 80×80. */
export function spotMedallion(resource: ResourceType): Art {
  const body = `
    <ellipse cx="40" cy="72" rx="24" ry="5" fill="${INK}" opacity=".25"/>
    <circle cx="40" cy="38" r="31" fill="${INK}"/>
    <circle cx="40" cy="38" r="28.5" fill="${SPOT_RING[resource]}"/>
    <circle cx="40" cy="38" r="23.5" fill="#f6ecd2" stroke="${INK}" stroke-width="1.5"/>
    <g transform="translate(14.4 12.4) scale(.8)">${RESOURCE_BODY[resource]}</g>`;
  return { svg: svg(80, 80, body), width: 80, height: 80, anchor: { x: 40, y: 38 } };
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
  { base: '#d8892c', shade: '#a6601b', light: '#f2b450' },
  { base: '#c3532f', shade: '#8e3621', light: '#e3804f' },
];

const CROWN = [
  [24, 20, 11],
  [15, 27, 8.5],
  [33, 27, 8.5],
  [24, 31, 9.5],
] as const;

/** Broadleaf tree, 48×56, standing at (24, 50). */
export function broadleaf(f: Foliage): Art {
  const circles = (extra: string) =>
    CROWN.map(([x, y, r]) => `<circle cx="${x}" cy="${y}" r="${r}" ${extra}/>`).join('');
  const body = `
    <ellipse cx="26" cy="50" rx="13" ry="3.6" fill="${INK}" opacity=".28"/>
    <path d="M21.5 50l1.2-14h2.6l1.2 14z" fill="#6b4423" stroke="${INK}" stroke-width="1.4" stroke-linejoin="round"/>
    ${circles(`fill="${INK}" stroke="${INK}" stroke-width="3.4"`)}
    ${circles(`fill="${f.base}"`)}
    <circle cx="28" cy="32" r="7.5" fill="${f.shade}"/>
    <circle cx="35" cy="28" r="5" fill="${f.shade}"/>
    <circle cx="19" cy="33" r="4" fill="${f.shade}" opacity=".7"/>
    <circle cx="19" cy="17" r="4.6" fill="${f.light}"/>
    <circle cx="13" cy="24.5" r="3" fill="${f.light}"/>
    <circle cx="26" cy="13.5" r="2.6" fill="${f.light}" opacity=".9"/>
    <g fill="${f.shade}" opacity=".55"><circle cx="22" cy="24" r="1.2"/><circle cx="29" cy="20" r="1.1"/><circle cx="17" cy="29" r="1"/></g>`;
  return { svg: svg(48, 56, body), width: 48, height: 56, anchor: { x: 24, y: 50 } };
}

/** Conifer, 40×60, standing at (20, 54). */
export function conifer(dark: boolean): Art {
  const [base, shade, light] = dark
    ? ['#3b6b45', '#244a2f', '#5a8f5f']
    : ['#4a7d4a', '#2f5a34', '#6fa064'];
  const tiers = [
    [20, 5, 11, 22],
    [20, 14, 14, 34],
    [20, 24, 17, 46],
  ];
  const outline = tiers
    .map(
      ([x, top, half, bottom]) =>
        `<path d="M${x} ${top}L${x! + half!} ${bottom}Q${x} ${bottom! + 3} ${x! - half!} ${bottom}Z"/>`,
    )
    .join('');
  const fills = tiers
    .map(
      ([x, top, half, bottom]) =>
        `<path d="M${x} ${top}L${x! + half!} ${bottom}Q${x} ${bottom! + 3} ${x! - half!} ${bottom}Z" fill="${base}"/>
         <path d="M${x} ${top}L${x! + half!} ${bottom}Q${x! + half! / 2} ${bottom! + 2} ${x! + 1} ${bottom! + 1.5}Z" fill="${shade}"/>
         <path d="M${x} ${top! + 3}L${x! - half! + 4} ${bottom! - 1}" stroke="${light}" stroke-width="1.6" stroke-linecap="round"/>`,
    )
    .join('');
  const body = `
    <ellipse cx="22" cy="54" rx="11" ry="3.2" fill="${INK}" opacity=".28"/>
    <path d="M18.5 54v-7h3v7z" fill="#6b4423" stroke="${INK}" stroke-width="1.3"/>
    <g fill="${INK}" stroke="${INK}" stroke-width="3.2" stroke-linejoin="round">${outline}</g>
    ${fills}`;
  return { svg: svg(40, 60, body), width: 40, height: 60, anchor: { x: 20, y: 54 } };
}

// ---- Mountains ----

interface Peak {
  lit: string;
  shade: string;
}

const ROCK: Peak[] = [
  { lit: '#d9c59d', shade: '#9a7f58' },
  { lit: '#cfc0a6', shade: '#8c7d68' },
  { lit: '#dcc193', shade: '#a27a4c' },
];

function hatch(x: number, y: number, n: number, len: number): string {
  let out = '';
  for (let i = 0; i < n; i++) {
    out += `<path d="M${x + i * 4} ${y + i * 3}l${len * 0.55} ${len}" />`;
  }
  return `<g stroke="${INK}" stroke-width="1" opacity=".45" stroke-linecap="round">${out}</g>`;
}

/** Mountain, 100×72, standing at (50, 64). `variant` picks shape, `snow` adds a cap. */
export function mountain(variant: number, snow: boolean): Art {
  const rock = ROCK[variant % ROCK.length]!;
  const twin = variant % 2 === 1;
  const back = twin
    ? `<path d="M10 64L30 30L38 36L46 26L60 64Z" fill="${rock.lit}" stroke="${INK}" stroke-width="2.2" stroke-linejoin="round"/>
       <path d="M46 26L60 64H40L44 44Z" fill="${rock.shade}"/>
       <path d="M46 26L60 64" fill="none" stroke="${INK}" stroke-width="2.2" stroke-linejoin="round"/>`
    : `<path d="M12 64L34 34L44 44L56 64Z" fill="${rock.lit}" stroke="${INK}" stroke-width="2.2" stroke-linejoin="round"/>
       <path d="M34 34L44 44L56 64H40Z" fill="${rock.shade}" opacity=".85"/>`;
  const cap = snow
    ? `<path d="M48.5 24L56 12L64.5 25L61 23.5L58.5 28L55.5 24.5L52 28.5Z" fill="#fbfaf3" stroke="${INK}" stroke-width="1.4" stroke-linejoin="round"/>
       <path d="M56 12L64.5 25L61 23.5L58.5 28L57 22Z" fill="#d9e2ea"/>`
    : '';
  const body = `
    <ellipse cx="52" cy="65" rx="40" ry="5" fill="${INK}" opacity=".22"/>
    ${back}
    <path d="M26 64L44 32L50 24L56 12L64 24L72 34L90 64Z" fill="${rock.lit}" stroke="${INK}" stroke-width="2.4" stroke-linejoin="round"/>
    <path d="M56 12L64 24L72 34L90 64H62L57 48L60 34Z" fill="${rock.shade}"/>
    ${hatch(64, 36, 5, 9)}
    <path d="M56 12L60 34L57 48L62 64" fill="none" stroke="${INK}" stroke-width="1.3" stroke-linejoin="round"/>
    <path d="M44 32L47 40M38 44l3 5M48 50l2 4" fill="none" stroke="${INK}" stroke-width="1.1" opacity=".5" stroke-linecap="round"/>
    ${cap}
    <path d="M26 64L44 32L50 24L56 12L64 24L72 34L90 64" fill="none" stroke="${INK}" stroke-width="2.4" stroke-linejoin="round"/>`;
  return { svg: svg(100, 72, body), width: 100, height: 72, anchor: { x: 50, y: 64 } };
}

// ---- Small details ----

export function grassTuft(): Art {
  const body = `<g fill="none" stroke="#557a2a" stroke-width="1.6" stroke-linecap="round">
    <path d="M6 16q0-6-3-10"/><path d="M10 16q0-8 1-13"/><path d="M14 16q1-6 5-9"/></g>`;
  return { svg: svg(22, 18, body), width: 22, height: 18, anchor: { x: 11, y: 16 } };
}

export function flowers(color: string): Art {
  const body = `<g stroke="#557a2a" stroke-width="1.2"><path d="M6 14v-6M12 14v-8M17 14v-5"/></g>
    <g fill="${color}" stroke="${INK}" stroke-width=".7"><circle cx="6" cy="7" r="2.2"/><circle cx="12" cy="5" r="2.4"/><circle cx="17" cy="8" r="2"/></g>`;
  return { svg: svg(22, 16, body), width: 22, height: 16, anchor: { x: 11, y: 14 } };
}

export function ship(): Art {
  const body = `
    <path d="M8 40h44l-8 10H16z" fill="#8a5a2b" stroke="${INK}" stroke-width="2" stroke-linejoin="round"/>
    <path d="M12 44h36" stroke="#5e3b1a" stroke-width="1.4"/>
    <path d="M30 40V6" stroke="${INK}" stroke-width="2"/>
    <path d="M32 9q14 12 0 28z" fill="#f6efd9" stroke="${INK}" stroke-width="1.6"/>
    <path d="M28 12q-12 10 0 24z" fill="#ebe0c2" stroke="${INK}" stroke-width="1.6"/>
    <path d="M30 6l9 3l-9 3z" fill="#d4472f" stroke="${INK}" stroke-width="1"/>`;
  return { svg: svg(62, 56, body), width: 62, height: 56, anchor: { x: 30, y: 46 } };
}

// ---- Sites ----

/** Darkens (f < 1) or lightens (f > 1) a #rrggbb colour. */
function shade(color: string, f: number): string {
  const channel = (i: number) => {
    const v = parseInt(color.slice(i, i + 2), 16);
    const out = f < 1 ? v * f : v + (255 - v) * (f - 1);
    return Math.round(Math.min(255, Math.max(0, out)))
      .toString(16)
      .padStart(2, '0');
  };
  return `#${channel(1)}${channel(3)}${channel(5)}`;
}

const STONE = '#d9cdb5';
const STONE_LIGHT = '#e8dfcc';
const STONE_SHADE = '#b5a68a';
const MORTAR = '#ab9c7f';

/** Castle: round towers with roofs, a crenellated keep with a flag, gate and wall banners.
 *  Roofs, flag and banners in the owner's colour. 120×110, standing at (60, 96). */
export function castle(color: string): Art {
  const dark = shade(color, 0.66);
  const light = shade(color, 1.25);
  const line = `stroke="${INK}" stroke-width="2.4" stroke-linejoin="round"`;
  const merlons = (xs: number[], y: number, fill: string) =>
    xs
      .map((x) => `<rect x="${x}" y="${y}" width="5.5" height="6.5" fill="${fill}" ${line}/>`)
      .join('');
  const bricks = (x0: number, x1: number, rows: number[]) =>
    rows
      .map((y, i) => {
        let d = `M${x0 + 2} ${y}H${x1 - 2}`;
        for (let x = x0 + (i % 2 ? 5 : 10); x < x1 - 3; x += 10) d += `M${x} ${y}v-7`;
        return d;
      })
      .join('');
  const tower = (x: number) => `
    <path d="M${x} 50H${x + 26}V95Q${x + 13} 99 ${x} 95Z" fill="${STONE}" ${line}/>
    <path d="M${x + 19} 51.2H${x + 24.8}V94.5Q${x + 22} 96.4 ${x + 19} 97Z" fill="${STONE_SHADE}"/>
    <path d="${bricks(x, x + 26, [62, 69, 76, 83, 90])}" stroke="${MORTAR}" stroke-width="1" fill="none" opacity=".8"/>
    <path d="M${x + 10} 72v-5a3 3 0 0 1 6 0v5z" fill="${INK}"/>
    <path d="M${x} 95Q${x + 13} 99 ${x + 26} 95V50" fill="none" ${line}/>
    <path d="M${x - 4} 51L${x + 13} 14L${x + 30} 51Q${x + 13} 57 ${x - 4} 51Z" fill="${color}" ${line}/>
    <path d="M${x + 13} 14L${x + 30} 51Q${x + 22} 54 ${x + 13} 54.4Z" fill="${dark}"/>
    <path d="M${x + 6} 40L${x + 12} 22" stroke="${light}" stroke-width="2" stroke-linecap="round"/>
    <path d="M${x - 4} 51L${x + 13} 14L${x + 30} 51Q${x + 13} 57 ${x - 4} 51Z" fill="none" ${line}/>
    <circle cx="${x + 13}" cy="13" r="2.6" fill="#f2c230" stroke="${INK}" stroke-width="1.4"/>`;
  const banner = (x: number) =>
    `<path d="M${x} 66h9v15l-4.5-3.4L${x} 81Z" fill="${color}" stroke="${INK}" stroke-width="1.6" stroke-linejoin="round"/>
     <path d="M${x + 2} 70h5" stroke="${light}" stroke-width="1.4"/>`;
  const body = `
    <ellipse cx="60" cy="97" rx="56" ry="8" fill="${INK}" opacity=".28"/>
    <path d="M60 30V5" stroke="${INK}" stroke-width="2.2"/>
    <path d="M60 6H86L80.5 12L86 18H60Z" fill="${color}" stroke="${INK}" stroke-width="1.8" stroke-linejoin="round"/>
    <path d="M60 13H83L86 18H60Z" fill="${dark}"/>
    <path d="M60 6H86L80.5 12L86 18H60Z" fill="none" stroke="${INK}" stroke-width="1.8" stroke-linejoin="round"/>
    ${merlons([41, 50, 58.5, 67, 73.5], 25, STONE_LIGHT)}
    <rect x="41" y="31" width="38" height="36" fill="${STONE_LIGHT}" ${line}/>
    <rect x="71" y="32.2" width="6.8" height="33.6" fill="${STONE}"/>
    <path d="${bricks(41, 79, [40, 47, 54, 61])}" stroke="${MORTAR}" stroke-width="1" fill="none" opacity=".7"/>
    <path d="M55 52v-8a5 5 0 0 1 10 0v8z" fill="#f2c230" stroke="${INK}" stroke-width="2"/>
    <path d="M60 39v13M55 46h10" stroke="${INK}" stroke-width="1.4"/>
    ${merlons([30, 38.5, 47, 55.5, 64, 72.5, 81], 55, STONE)}
    <rect x="30" y="61" width="60" height="35" fill="${STONE}" ${line}/>
    <rect x="30" y="88" width="60" height="8" fill="${STONE_SHADE}" ${line}/>
    <path d="${bricks(30, 90, [68, 75, 82])}" stroke="${MORTAR}" stroke-width="1" fill="none" opacity=".8"/>
    <path d="M48 96V80a12 12 0 0 1 24 0V96Z" fill="${STONE_SHADE}" ${line}/>
    <path d="M51.5 96V80.5a8.5 8.5 0 0 1 17 0V96Z" fill="#7a4b22" stroke="${INK}" stroke-width="1.8"/>
    <path d="M56 96V75M60 96V72M64 96V75M51.5 84h17M51.5 90h17" stroke="#5a3616" stroke-width="1.3"/>
    ${banner(34)}${banner(77)}
    ${tower(4)}${tower(90)}`;
  return { svg: svg(120, 110, body), width: 120, height: 110, anchor: { x: 60, y: 96 } };
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
    <circle cx="${cx}" cy="${cy}" r="47" fill="#f6eedb" stroke="${INK}" stroke-width="2.2"/>
    <circle cx="${cx}" cy="${cy}" r="42" fill="none" stroke="${INK}" stroke-width="1"/>
    <circle cx="${cx}" cy="${cy}" r="24" fill="none" stroke="${INK}" stroke-width=".8" opacity=".5"/>
    <g stroke="${INK}" stroke-width="1">${ticks}</g>
    ${[45, 135, 225, 315].map((a) => point(a, 27, 6, '#8a7550', '#e9dcbc')).join('')}
    ${[90, 180, 270].map((a) => point(a, 40, 8, INK, '#e9dcbc')).join('')}
    ${point(0, 40, 8, '#9e2a1a', '#e2735f')}
    <circle cx="${cx}" cy="${cy}" r="5" fill="#f2c230" stroke="${INK}" stroke-width="1.6"/>
    <text x="${cx}" y="15" text-anchor="middle" font-family="Georgia, serif" font-size="16" font-weight="bold" fill="${INK}">N</text>`;
  return svg(110, 120, body);
}

/** Army banner: pole with a swallow-tailed flag in the owner's colour, 48×64, standing at (14, 58). */
export function banner(color: string): Art {
  const dark = shade(color, 0.66);
  const light = shade(color, 1.3);
  const body = `
    <ellipse cx="18" cy="58" rx="13" ry="4" fill="${INK}" opacity=".3"/>
    <path d="M14 58V7" stroke="${INK}" stroke-width="4.4" stroke-linecap="round"/>
    <path d="M14 58V7" stroke="#8a5a2b" stroke-width="2.2" stroke-linecap="round"/>
    <path d="M14 9H44L37 21L44 33H14Z" fill="${color}" stroke="${INK}" stroke-width="2.4" stroke-linejoin="round"/>
    <path d="M14 26H40.2L44 33H14Z" fill="${dark}"/>
    <path d="M18 13H38" stroke="${light}" stroke-width="2" stroke-linecap="round"/>
    <path d="M14 9H44L37 21L44 33H14Z" fill="none" stroke="${INK}" stroke-width="2.4" stroke-linejoin="round"/>
    <circle cx="14" cy="6" r="3.6" fill="#f2c230" stroke="${INK}" stroke-width="1.8"/>`;
  return { svg: svg(48, 64, body), width: 48, height: 64, anchor: { x: 14, y: 58 } };
}

/** Treasure chest with gold trim and sparkles, 56×48. */
export function chest(): Art {
  const line = `stroke="${INK}" stroke-width="2" stroke-linejoin="round"`;
  const body = `
    <ellipse cx="28" cy="43" rx="19" ry="3.6" fill="${INK}" opacity=".28"/>
    <path d="M10 22q18-16 36 0z" fill="#9a5b22" ${line}/>
    <path d="M14 21q14-11 28 0" fill="none" stroke="#c07a35" stroke-width="2"/>
    <rect x="10" y="22" width="36" height="20" rx="1.5" fill="#b8702c" ${line}/>
    <path d="M10 30h36" stroke="${INK}" stroke-width="1.4"/>
    <g fill="#f2c230" stroke="${INK}" stroke-width="1.4" stroke-linejoin="round">
      <rect x="15" y="22" width="5" height="20"/>
      <rect x="36" y="22" width="5" height="20"/>
      <rect x="24" y="26" width="8" height="9" rx="1.5"/>
    </g>
    <circle cx="28" cy="30" r="1.4" fill="${INK}"/>
    <g fill="#fff6c2" stroke="${INK}" stroke-width=".8">
      <path d="M47 6l1.4 3.6l3.6 1.4l-3.6 1.4l-1.4 3.6l-1.4-3.6l-3.6-1.4l3.6-1.4z"/>
      <path d="M8 9l1 2.4l2.4 1l-2.4 1l-1 2.4l-1-2.4l-2.4-1l2.4-1z"/>
    </g>`;
  return { svg: svg(56, 48, body), width: 56, height: 48, anchor: { x: 28, y: 36 } };
}
