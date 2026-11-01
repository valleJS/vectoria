import type { ResourceType } from '@vectoria/shared';

/** Cartography palette for the Pixi map. The HUD uses the same values as CSS tokens (index.css). */
export const INK = 0x3b2a18;
export const PARCHMENT = 0xf6eedb;
/** Alarm red for attacks (the HUD's `seal` token). */
export const SEAL = 0xa3311f;
export const SERIF = 'Georgia, "Palatino Linotype", "Book Antiqua", Palatino, serif';

/** Open sea, also the canvas background (index.css `--color-sea`). */
export const SEA = 0xb8a27a;

/**
 * The map backdrop is an old map in parchment and brown; only the pieces players act on (sites,
 * chests, armies, routes) are in colour. Decoration art is toned onto this ramp, dark to light.
 */
const SEPIA_DARK = [0x4e, 0x37, 0x20] as const;
const SEPIA_LIGHT = [0xf4, 0xe7, 0xc4] as const;
/** How much of the original hue survives the sepia toning. */
const SEPIA_HUE = 0.04;

/** Tones 0–255 channels onto the sepia ramp by their luminance. */
export function sepia(r: number, g: number, b: number): [number, number, number] {
  const l = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  const tone = (i: 0 | 1 | 2, c: number) => {
    const ramp = SEPIA_DARK[i] + (SEPIA_LIGHT[i] - SEPIA_DARK[i]) * l;
    return Math.round(ramp + (c - ramp) * SEPIA_HUE);
  };
  return [tone(0, r), tone(1, g), tone(2, b)];
}
export const RESOURCE_COLORS: Record<ResourceType, number> = {
  wood: 0xa0652e,
  stone: 0x9aa0aa,
  gold: 0xf4c430,
};

/** The viewer is always red; everyone else takes a heraldic colour in join order. */
export const SELF_COLOR = 0xd4472f;
/** Unowned outposts. */
export const NEUTRAL_COLOR = 0x8c8577;
/** Routes and halos of armies carrying resources. */
export const CARGO_GOLD = 0xe0a919;
export const PLAYER_PALETTE = [
  0x7a46b8, 0x1f8fa8, 0xd9a21b, 0x3f8f3a, 0x2f5fa8, 0xc0567f, 0xe07a2a, 0x8a5a2b, 0x4f6d7a,
  0xa33b8f, 0x8a9a2a,
];
