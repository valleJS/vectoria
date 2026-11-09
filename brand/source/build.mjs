// Vectoria brand kit generator: the "Numeral V" mark, lockups, icons and social images.
// Usage: node brand.mjs <outDir> <fontPath> <publicDir>
// Needs `sharp` and `opentype.js` resolvable (installed next to this script, not in the repo).
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(join(process.cwd(), 'tools', 'x.js'));
const sharp = require('sharp');
const opentype = require('opentype.js');

const [OUT, FONT, PUB] = process.argv.slice(2);
const font = opentype.loadSync(FONT);
const f = (n) => +n.toFixed(2);

// ---------- palette ----------
const WAYS = {
  day: { m1: '#3b2a18', m2: '#6b5434', m3: '#a3311f', word: '#3b2a18', bg: '#f6eedb' },
  night: { m1: '#f2c230', m2: '#c9951b', m3: '#d4462e', word: '#f2c230', bg: '#16130e' },
  black: { m1: '#16130e', m2: '#16130e', m3: '#16130e', word: '#16130e', bg: '#ffffff' },
  white: { m1: '#ffffff', m2: '#ffffff', m3: '#ffffff', word: '#ffffff', bg: '#16130e' },
};

// ---------- mark geometry (viewBox 0 0 212 134) ----------
function leaf(x, y, ang, L, W, c) {
  const k = L * 0.34;
  return `<g transform="translate(${f(x)} ${f(y)}) rotate(${f(ang)})"><path d="M0 0L${f(k)} ${f(-W)}L${f(L)} 0Z" fill="${c.m1}"/><path d="M0 0L${f(k)} ${f(W)}L${f(L)} 0Z" fill="${c.m2}"/></g>`;
}
// Drawn upright (V apex down at 64,130), rotated so the apex points right.
function markInner(c, { simple = false } = {}) {
  let s = '';
  if (simple) {
    s += `<rect x="66" y="-40" width="8" height="122" fill="${c.m3}"/>`;
  } else {
    s += `<rect x="67" y="-58" width="6" height="24" fill="${c.m3}"/>`;
    s += `<rect x="67" y="-18" width="6" height="100" fill="${c.m3}"/>`;
    s += `<circle cx="70" cy="-26" r="8" fill="none" stroke="${c.m3}" stroke-width="4"/>`;
    for (let i = 0; i < 3; i++) {
      const y = -56 + i * 13;
      s += leaf(70, y, -142, 28 - i * 4, 6.5, c) + leaf(70, y, -38, 28 - i * 4, 6.5, c);
    }
  }
  s += `<path d="M10 0L38 0L72.6 83.4L106 0L116 0L64 130Z" fill="${c.m1}"/>`;
  s += `<rect x="0" y="-11" width="48" height="5" fill="${c.m1}"/><rect x="98" y="-11" width="26" height="4" fill="${c.m1}"/>`;
  // translate(32 -34) moves the old viewBox origin (-32, 34) to 0,0.
  return `<g transform="translate(32 -34) translate(176 100) rotate(-90) translate(-64 -130)">${s}</g>`;
}
const MARK = { w: 212, h: 134 };
const SIMPLE = { x: 30, w: 182 }; // simple mark has no fletching: crop the left
const svg = (w, h, body, vb = `0 0 ${w} ${h}`) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb}" width="${w}" height="${h}">${body}</svg>`;
const place = (x, y, w, h, vb, inner) =>
  `<svg x="${f(x)}" y="${f(y)}" width="${f(w)}" height="${f(h)}" viewBox="${vb}">${inner}</svg>`;
const markAt = (x, y, h, c, opt) => {
  const vb = opt?.simple ? `${SIMPLE.x} 0 ${SIMPLE.w} ${MARK.h}` : `0 0 ${MARK.w} ${MARK.h}`;
  const w = (h * (opt?.simple ? SIMPLE.w : MARK.w)) / MARK.h;
  return { w, svg: place(x, y, w, h, vb, markInner(c, opt)) };
};

// ---------- wordmark as outlines ----------
const TRACK = 0.24; // em
function wordPath(text, size) {
  let x = 0;
  const parts = [];
  for (const ch of text) {
    const g = font.charToGlyph(ch);
    parts.push(g.getPath(x, 0, size).toPathData(2));
    x += (g.advanceWidth / font.unitsPerEm) * size + TRACK * size;
  }
  x -= TRACK * size;
  const cap = (font.charToGlyph('V').getBoundingBox().y2 * size) / font.unitsPerEm;
  return { d: parts.join(''), w: x, cap };
}
const WORD = wordPath('VECTORIA', 100); // cap height `WORD.cap` at size 100
const wordAt = (x, y, capH, color) => {
  const s = capH / WORD.cap;
  // baseline at y + capH
  return {
    w: WORD.w * s,
    svg: `<path transform="translate(${f(x)} ${f(y + capH)}) scale(${f(s)})" d="${WORD.d}" fill="${color}"/>`,
  };
};

// ---------- lockups ----------
// Horizontal: mark height h, wordmark cap = 0.3h centred on the mark.
function horizontal(c, h) {
  const m = markAt(0, 0, h, c);
  const cap = h * 0.3,
    gap = h * 0.32;
  const wd = wordAt(m.w + gap, (h - cap) / 2, cap, c.word);
  return { w: m.w + gap + wd.w, h, svg: m.svg + wd.svg };
}
function stacked(c, h) {
  const cap = h * 0.24;
  const gap = h * 0.26;
  const wdW = (WORD.w * cap) / WORD.cap;
  const m = markAt(0, 0, h, c);
  const w = Math.max(m.w, wdW);
  const mm = markAt((w - m.w) / 2, 0, h, c);
  const wd = wordAt((w - wdW) / 2, h + gap, cap, c.word);
  return { w, h: h + gap + cap, svg: mm.svg + wd.svg };
}
const fit = (box, lock, x0, y0, bw, bh) => {
  const s = Math.min(bw / box.w, bh / box.h);
  const x = x0 + (bw - box.w * s) / 2,
    y = y0 + (bh - box.h * s) / 2;
  return `<g transform="translate(${f(x)} ${f(y)}) scale(${f(s)})">${lock}</g>`;
};

// ---------- backgrounds ----------
// Quiet ground: flat colour, a faint vector track and beaded rim echoing the coin.
function ground(W, H, c, way) {
  const faint = way === 'day' ? 'rgba(59,42,24,0.07)' : 'rgba(242,194,48,0.06)';
  const y = H / 2;
  let dots = '';
  const step = Math.max(14, Math.round(W / 90));
  for (let x = step / 2; x < W; x += step) {
    dots += `<circle cx="${f(x)}" cy="${f(H * 0.06)}" r="${f(step * 0.12)}" fill="${faint}"/><circle cx="${f(x)}" cy="${f(H * 0.94)}" r="${f(step * 0.12)}" fill="${faint}"/>`;
  }
  return `<rect width="${W}" height="${H}" fill="${c.bg}"/>${dots}<rect x="0" y="${f(y - H * 0.004)}" width="${W}" height="${f(Math.max(2, H * 0.008))}" fill="${faint}"/>`;
}

// ---------- writers ----------
const files = [];
const ensure = (p) => mkdirSync(p, { recursive: true });
async function out(rel, svgText, png) {
  const p = join(OUT, rel);
  ensure(join(p, '..'));
  if (png) {
    await sharp(Buffer.from(svgText), { density: 72 })
      .resize(png.w, png.h)
      .png({ compressionLevel: 9 })
      .toFile(p);
  } else writeFileSync(p, svgText);
  files.push(rel);
}

// mark & lockup SVG masters (transparent)
for (const [way, c] of Object.entries(WAYS)) {
  const m = markAt(0, 0, MARK.h, c);
  await out(`logo/svg/mark-${way}.svg`, svg(MARK.w, MARK.h, m.svg));
  const hz = horizontal(c, 134);
  await out(`logo/svg/lockup-horizontal-${way}.svg`, svg(Math.ceil(hz.w), hz.h, hz.svg));
  const st = stacked(c, 134);
  await out(`logo/svg/lockup-stacked-${way}.svg`, svg(Math.ceil(st.w), Math.ceil(st.h), st.svg));
  const wd = wordAt(0, 0, 100, c.word);
  await out(
    `logo/svg/wordmark-${way}.svg`,
    svg(Math.ceil(wd.w + 4), 100, wd.svg, `-2 0 ${Math.ceil(wd.w + 4)} 100`),
  );
  // PNG renders, transparent
  await out(`logo/png/mark-${way}-1024w.png`, svg(MARK.w, MARK.h, m.svg), {
    w: 1024,
    h: Math.round((1024 * MARK.h) / MARK.w),
  });
  await out(`logo/png/lockup-horizontal-${way}-2000w.png`, svg(Math.ceil(hz.w), hz.h, hz.svg), {
    w: 2000,
    h: Math.round((2000 * hz.h) / Math.ceil(hz.w)),
  });
  await out(
    `logo/png/lockup-stacked-${way}-1200w.png`,
    svg(Math.ceil(st.w), Math.ceil(st.h), st.svg),
    {
      w: 1200,
      h: Math.round((1200 * Math.ceil(st.h)) / Math.ceil(st.w)),
    },
  );
}

// square tiles: profile pictures & app icons (day + night)
function squareTile(c, way, S, { text = false, pad = 0.2, radius = 0, simple = false } = {}) {
  let body = radius
    ? `<rect width="${S}" height="${S}" rx="${f(S * radius)}" fill="${c.bg}"/>`
    : `<rect width="${S}" height="${S}" fill="${c.bg}"/>`;
  const inner = S * (1 - 2 * pad);
  if (text) {
    const st = stacked(c, 134);
    body += fit(st, st.svg, S * pad, S * pad, inner, inner);
  } else {
    const ratio = (simple ? SIMPLE.w : MARK.w) / MARK.h;
    const w = inner,
      h = w / ratio;
    // optical centre: the V's tip pulls right, nudge left a touch
    body += markAt(S * pad - S * 0.02, (S - h) / 2, h, c, { simple }).svg;
  }
  return svg(S, S, body);
}
for (const way of ['day', 'night']) {
  const c = WAYS[way];
  // profile pictures: circle-safe padding (mark inside the inscribed circle)
  for (const size of [400, 1024]) {
    await out(`avatar/avatar-${way}-${size}.png`, squareTile(c, way, 1024, { pad: 0.2 }), {
      w: size,
      h: size,
    });
    await out(
      `avatar/avatar-${way}-text-${size}.png`,
      squareTile(c, way, 1024, { pad: 0.2, text: true }),
      { w: size, h: size },
    );
  }
  await out(`avatar/avatar-${way}.svg`, squareTile(c, way, 1024, { pad: 0.2 }));
  await out(`avatar/avatar-${way}-text.svg`, squareTile(c, way, 1024, { pad: 0.2, text: true }));
  // app icons: full-bleed (OS masks the corners), maskable keeps the 80% safe zone
  for (const size of [192, 512, 1024])
    await out(`app-icon/icon-${way}-${size}.png`, squareTile(c, way, 1024, { pad: 0.16 }), {
      w: size,
      h: size,
    });
  await out(`app-icon/icon-${way}-maskable-512.png`, squareTile(c, way, 1024, { pad: 0.24 }), {
    w: 512,
    h: 512,
  });
  await out(`app-icon/apple-touch-icon-${way}.png`, squareTile(c, way, 1024, { pad: 0.16 }), {
    w: 180,
    h: 180,
  });
  // favicons: simplified mark (no fletching / ring) on a rounded tile
  const fav = squareTile(c, way, 64, { pad: 0.1, radius: 0.18, simple: true });
  await out(`favicon/favicon-${way}.svg`, fav);
  for (const size of [16, 32, 48])
    await out(`favicon/favicon-${way}-${size}.png`, fav, { w: size, h: size });
}

// ICO (PNG-in-ICO) for the day favicon
{
  const sizes = [16, 32, 48];
  const pngs = await Promise.all(
    sizes.map((s) =>
      sharp(Buffer.from(squareTile(WAYS.day, 'day', 64, { pad: 0.1, radius: 0.18, simple: true })))
        .resize(s, s)
        .png()
        .toBuffer(),
    ),
  );
  const head = Buffer.alloc(6 + 16 * sizes.length);
  head.writeUInt16LE(0, 0);
  head.writeUInt16LE(1, 2);
  head.writeUInt16LE(sizes.length, 4);
  let off = head.length;
  sizes.forEach((s, i) => {
    const e = 6 + i * 16;
    head.writeUInt8(s, e);
    head.writeUInt8(s, e + 1);
    head.writeUInt16LE(1, e + 4);
    head.writeUInt16LE(32, e + 6);
    head.writeUInt32LE(pngs[i].length, e + 8);
    head.writeUInt32LE(off, e + 12);
    off += pngs[i].length;
  });
  ensure(join(OUT, 'favicon'));
  writeFileSync(join(OUT, 'favicon/favicon.ico'), Buffer.concat([head, ...pngs]));
  files.push('favicon/favicon.ico');
}

// social formats: [name, W, H, safe box (fraction of W,H)]
const SOCIAL = [
  ['og-image', 1200, 630, [0.72, 0.5]], // link previews (Open Graph / X card)
  ['x-header', 1500, 500, [0.6, 0.46]], // profile picture overlaps bottom-left
  ['linkedin-banner', 1584, 396, [0.56, 0.5]],
  ['youtube-banner', 2560, 1440, [0.56, 0.26]], // 1546x423 safe area on all devices
  ['discord-banner', 960, 540, [0.7, 0.46]],
  ['instagram-post', 1080, 1080, [0.6, 0.6]],
  ['instagram-portrait', 1080, 1350, [0.6, 0.5]],
  ['story', 1080, 1920, [0.74, 0.36]], // 9:16, keep clear of top/bottom UI
];
for (const [name, W, H, [sw, sh]] of SOCIAL) {
  for (const way of ['day', 'night']) {
    const c = WAYS[way];
    for (const text of [true, false]) {
      const bw = W * sw,
        bh = H * sh;
      const lock = text
        ? W / H >= 1.3
          ? horizontal(c, 134)
          : stacked(c, 134)
        : markAt(0, 0, 134, c);
      const box = { w: lock.w, h: lock.h ?? 134 };
      const body = ground(W, H, c, way) + fit(box, lock.svg, (W - bw) / 2, (H - bh) / 2, bw, bh);
      await out(`social/${name}-${way}${text ? '-text' : ''}.png`, svg(W, H, body), { w: W, h: H });
    }
  }
}

// app public files
if (PUB) {
  ensure(PUB);
  for (const way of ['day', 'night']) {
    const fav = squareTile(WAYS[way], way, 64, { pad: 0.1, radius: 0.18, simple: true });
    writeFileSync(join(PUB, way === 'day' ? 'favicon.svg' : 'favicon-night.svg'), fav);
  }
  const fav = squareTile(WAYS.day, 'day', 64, { pad: 0.1, radius: 0.18, simple: true });
  await sharp(Buffer.from(fav)).resize(32, 32).png().toFile(join(PUB, 'favicon-32.png'));
  await sharp(Buffer.from(squareTile(WAYS.day, 'day', 1024, { pad: 0.16 })))
    .resize(180, 180)
    .png()
    .toFile(join(PUB, 'apple-touch-icon.png'));
  for (const s of [192, 512])
    await sharp(Buffer.from(squareTile(WAYS.day, 'day', 1024, { pad: 0.16 })))
      .resize(s, s)
      .png()
      .toFile(join(PUB, `icon-${s}.png`));
  await sharp(Buffer.from(squareTile(WAYS.day, 'day', 1024, { pad: 0.24 })))
    .resize(512, 512)
    .png()
    .toFile(join(PUB, 'icon-maskable-512.png'));
  await sharp(
    Buffer.from(
      svg(
        1200,
        630,
        ground(1200, 630, WAYS.day, 'day') +
          fit(horizontal(WAYS.day, 134), horizontal(WAYS.day, 134).svg, 228, 157, 744, 315),
      ),
    ),
  )
    .png()
    .toFile(join(PUB, 'og-image.png'));
}

// mark markup for the React component (CSS-variable colours)
writeFileSync(
  join(process.cwd(), 'mark-inner.txt'),
  markInner({ m1: 'var(--brand-m1)', m2: 'var(--brand-m2)', m3: 'var(--brand-m3)' }),
);
console.log(files.length, 'files');
