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

function logEnd(cx: number, cy: number): string {
  return `<g>
    <circle cx="${cx}" cy="${cy}" r="11.5" fill="#7a4a22" stroke="${INK}" stroke-width="2.2"/>
    <circle cx="${cx}" cy="${cy}" r="8.6" fill="#ebbd82"/>
    <circle cx="${cx}" cy="${cy}" r="6" fill="none" stroke="#c48d52" stroke-width="1.3"/>
    <circle cx="${cx}" cy="${cy}" r="3.2" fill="none" stroke="#c48d52" stroke-width="1.2"/>
    <circle cx="${cx}" cy="${cy}" r="1" fill="#a8723c"/>
    <path d="M${cx - 6} ${cy - 5.5} a8 8 0 0 1 6-2.4" fill="none" stroke="#fff3dc" stroke-width="1.4" stroke-linecap="round" opacity=".8"/>
  </g>`;
}

function block(x: number, y: number, w: number, h: number, d: number): string {
  const r = d * 0.6;
  return `<g stroke="${INK}" stroke-width="2.2" stroke-linejoin="round">
    <path d="M${x} ${y}L${x + d} ${y - r}H${x + w + d}L${x + w} ${y}Z" fill="#e3e6ea"/>
    <path d="M${x + w} ${y}L${x + w + d} ${y - r}V${y + h - r}L${x + w} ${y + h}Z" fill="#7f8792"/>
    <rect x="${x}" y="${y}" width="${w}" height="${h}" fill="#adb4bd"/>
  </g>
  <path d="M${x + w * 0.3} ${y + h * 0.35}l${w * 0.12} ${h * 0.18}l-${w * 0.05} ${h * 0.22}" fill="none" stroke="#6c737c" stroke-width="1.2" stroke-linecap="round"/>
  <path d="M${x + 2.5} ${y + 2.5}h${w * 0.45}" stroke="#d3d7dc" stroke-width="1.4" stroke-linecap="round"/>`;
}

function coin(cx: number, cy: number): string {
  return `<g stroke="${INK}" stroke-width="2">
    <path d="M${cx - 13} ${cy}v4a13 5 0 0 0 26 0v-4" fill="#c9951b"/>
    <ellipse cx="${cx}" cy="${cy}" rx="13" ry="5" fill="#f7cf3d"/>
  </g>
  <ellipse cx="${cx}" cy="${cy}" rx="8.5" ry="3" fill="none" stroke="#d8a523" stroke-width="1.3"/>`;
}

const RESOURCE_BODY: Record<ResourceType, string> = {
  wood: `${logEnd(21, 41)}${logEnd(43, 41)}${logEnd(32, 22)}
    <path d="M47 13c4-5 9-5 11-3c-2 4-7 6-11 3z" fill="#6aa046" stroke="${INK}" stroke-width="1.6"/>
    <path d="M47 13l7-2" stroke="${INK}" stroke-width="1"/>`,
  stone: `${block(7, 34, 30, 20, 9)}${block(31, 40, 18, 14, 7)}${block(16, 18, 18, 14, 7)}`,
  gold: `${coin(32, 50)}${coin(32, 43)}${coin(32, 36)}${coin(30, 29)}
    <g transform="translate(46 20) rotate(18)" stroke="${INK}" stroke-width="2">
      <ellipse cx="0" cy="0" rx="6" ry="13" fill="#c9951b"/>
      <ellipse cx="2" cy="0" rx="6" ry="13" fill="#f7cf3d"/>
      <ellipse cx="2" cy="0" rx="3.4" ry="8.5" fill="none" stroke="#d8a523" stroke-width="1.3"/>
    </g>
    <path d="M14 14l1.6 4.2l4.2 1.6l-4.2 1.6l-1.6 4.2l-1.6-4.2l-4.2-1.6l4.2-1.6z" fill="#fff6c2" stroke="${INK}" stroke-width=".8"/>
    <path d="M22 26q4-1.6 8-1" fill="none" stroke="#fff6c2" stroke-width="1.6" stroke-linecap="round"/>`,
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
    <g transform="translate(18 16) scale(.69)">${RESOURCE_BODY[resource]}</g>`;
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

export function wave(): Art {
  const body = `<path d="M2 9q4-6 8 0t8 0t8 0" fill="none" stroke="#e8f6f6" stroke-width="1.8" stroke-linecap="round" opacity=".85"/>`;
  return { svg: svg(28, 14, body), width: 28, height: 14, anchor: { x: 14, y: 7 } };
}

export function ship(): Art {
  const body = `
    <path d="M8 40h44l-8 10H16z" fill="#8a5a2b" stroke="${INK}" stroke-width="2" stroke-linejoin="round"/>
    <path d="M12 44h36" stroke="#5e3b1a" stroke-width="1.4"/>
    <path d="M30 40V6" stroke="${INK}" stroke-width="2"/>
    <path d="M32 9q14 12 0 28z" fill="#f6efd9" stroke="${INK}" stroke-width="1.6"/>
    <path d="M28 12q-12 10 0 24z" fill="#ebe0c2" stroke="${INK}" stroke-width="1.6"/>
    <path d="M30 6l9 3l-9 3z" fill="#d4472f" stroke="${INK}" stroke-width="1"/>
    <path d="M2 52q6-4 12 0t12 0t12 0t12 0t10 0" fill="none" stroke="#e8f6f6" stroke-width="1.6" opacity=".8"/>`;
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

/** Castle with two towers and a keep; roofs and banner in the owner's colour. 100×100. */
export function castle(color: string): Art {
  const dark = shade(color, 0.68);
  const line = `stroke="${INK}" stroke-width="2.2" stroke-linejoin="round"`;
  const tower = (x: number) => `
    <rect x="${x}" y="44" width="20" height="44" fill="#f1e8d2" ${line}/>
    <rect x="${x + 14}" y="45.1" width="4.9" height="41.8" fill="#d9ccb0"/>
    <rect x="${x + 8}" y="56" width="4" height="9" rx="2" fill="${INK}"/>
    <path d="M${x - 3} 46L${x + 10} 22L${x + 23} 46Z" fill="${color}" ${line}/>
    <path d="M${x + 10} 22L${x + 23} 46H${x + 10}Z" fill="${dark}"/>
    <path d="M${x - 3} 46L${x + 10} 22L${x + 23} 46Z" fill="none" ${line}/>`;
  const merlons = [16, 24, 32, 40, 48, 56, 64, 72, 79]
    .map((x) => `<rect x="${x}" y="55" width="5" height="6" fill="#e9dfc6" ${line}/>`)
    .join('');
  const body = `
    <ellipse cx="50" cy="89" rx="42" ry="7" fill="${INK}" opacity=".28"/>
    <rect x="38" y="38" width="24" height="26" fill="#f1e8d2" ${line}/>
    <path d="M47 50a3 3 0 0 1 6 0v6h-6z" fill="${INK}"/>
    <path d="M35 40L50 16L65 40Z" fill="${color}" ${line}/>
    <path d="M50 16L65 40H50Z" fill="${dark}"/>
    <path d="M35 40L50 16L65 40Z" fill="none" ${line}/>
    <path d="M50 16V3" stroke="${INK}" stroke-width="2"/>
    <path d="M50 3.5L66 7.5L50 11.5Z" fill="${color}" stroke="${INK}" stroke-width="1.6" stroke-linejoin="round"/>
    ${merlons}
    <rect x="16" y="60" width="68" height="28" fill="#e9dfc6" ${line}/>
    <g stroke="#c9bb9a" stroke-width="1.2" stroke-linecap="round">
      <path d="M22 68h8M34 74h7M62 70h8M24 80h6M66 80h8M58 64h6"/>
    </g>
    <path d="M41 88V75a9 9 0 0 1 18 0V88Z" fill="#4a3520" ${line}/>
    <path d="M45 74v14M50 71v17M55 74v14M41 80h18" stroke="#7a5a33" stroke-width="1.2"/>
    ${tower(6)}${tower(74)}`;
  return { svg: svg(100, 100, body), width: 100, height: 100, anchor: { x: 50, y: 84 } };
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
