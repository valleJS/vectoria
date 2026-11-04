// Design tokens: the one colour source for the map art (svg.ts), the Pixi palette (palette.ts)
// and the HUD. `index.css` mirrors the UI subset as CSS variables; the design sheet (`/?design`)
// shows both side by side and flags any drift.

/** Neutral ramp: ink lines and text on parchment. */
export const INK = '#3b2a18';
export const INK_SOFT = '#6b5434';
export const INK_FAINT = '#9b8664';
export const PARCHMENT = '#f6eedb';
export const PARCHMENT_DARK = '#efe2bf';
export const PARCHMENT_DEEP = '#e3d2a4';

/** Accents with a fixed meaning. */
export const SEAL = '#a3311f'; // alarm, attack, primary action
export const SEAL_LIGHT = '#bf3d28';
export const MOSS = '#4f7a2a'; // online, success
export const FORTIFY = '#3b6ea5'; // walls / fortify card

/** Brass: treasure, coins, lock plates, finials. */
export const GOLD = '#f2c230';
export const GOLD_LIGHT = '#fff1b8';
export const GOLD_DEEP = '#c9951b';
export const GOLD_SHADE = '#946b12';

/** Materials shared by all illustrated pieces (lit face, base, shaded face). */
export const MASONRY = { light: '#ece3cf', base: '#d9cdb5', shade: '#b5a68a', mortar: '#ab9c7f' };
export const TIMBER = { light: '#c98a4b', base: '#a8662c', shade: '#7a4519', grain: '#5e3416' };
export const END_GRAIN = { base: '#eec58c', ring: '#c99256' };
export const GRANITE = { light: '#dfe2e6', base: '#aab1ba', shade: '#7d8590', crack: '#5f6670' };
export const IRON = { base: '#5b5a5e', light: '#8b8a90' };
export const SKIN = '#efc69b';
export const STEEL = '#dfe3e7';

/** Terrain fills (flat regions in old-map tones) and the sea, which is also the page backdrop. */
export const SEA = '#b8a27a';
export const SHALLOW = '#cbb68a';
export const SEA_LINE = '#8f7a55';
export const COAST = '#4a3826';
export const GRASS = '#ecdcae';
export const FOREST = '#dcc68e';
export const ROCK = '#e2d3ad';

/** Resource accent per type (HUD bars, cargo); art uses the material ramps above. */
export const RESOURCE = { wood: TIMBER.base, stone: GRANITE.base, gold: GOLD };

/**
 * Heraldry. The viewer is always red; everyone else takes a colour in join order, combined with
 * one of the castle styles so 36 players stay distinct (format.ts `playerHeraldry`).
 */
export const SELF_COLOR = '#d4472f';
export const NEUTRAL_COLOR = '#8c8577';
export const HERALDRY = [
  '#7a46b8', // violet
  '#1f8fa8', // teal
  '#d9a21b', // saffron
  '#3f8f3a', // green
  '#2f5fa8', // blue
  '#c0567f', // rose
  '#e07a2a', // orange
  '#8a5a2b', // umber
  '#4f6d7a', // slate
  '#a33b8f', // magenta
  '#8a9a2a', // olive
  '#45454f', // charcoal
] as const;

/** Routes and halos of armies carrying resources. */
export const CARGO_GOLD = '#e0a919';

export const SERIF = 'Georgia, "Palatino Linotype", "Book Antiqua", Palatino, serif';

/** `#rrggbb` → 0xrrggbb for Pixi. */
export const hex = (color: string): number => parseInt(color.slice(1), 16);

/** CSS variables the HUD theme (index.css) must carry with these exact values. */
export const CSS_TOKENS: Record<string, string> = {
  '--color-ink': INK,
  '--color-ink-soft': INK_SOFT,
  '--color-ink-faint': INK_FAINT,
  '--color-parchment': PARCHMENT,
  '--color-parchment-dark': PARCHMENT_DARK,
  '--color-parchment-deep': PARCHMENT_DEEP,
  '--color-seal': SEAL,
  '--color-seal-light': SEAL_LIGHT,
  '--color-moss': MOSS,
  '--color-fortify': FORTIFY,
  '--color-gold': GOLD,
  '--color-gold-deep': GOLD_DEEP,
  '--color-sea': SEA,
};
