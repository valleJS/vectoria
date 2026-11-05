import type { ResourceType } from '@vectoria/shared';
import * as T from '../theme/tokens';

/** Pixi colours: the design tokens (theme/tokens.ts) as 0xrrggbb numbers. */
export const INK = T.hex(T.INK);
export const INK_SOFT = T.hex(T.INK_SOFT);
export const PARCHMENT = T.hex(T.PARCHMENT);
/** Alarm red for attacks (the HUD's `seal` token). */
export const SEAL = T.hex(T.SEAL);
export const FORTIFY_BLUE = T.hex(T.FORTIFY);
export const SERIF = T.SERIF;

/** Open sea, also the canvas background (index.css `--color-sea`). */
export const SEA = T.hex(T.SEA);

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
  wood: T.hex(T.RESOURCE.wood),
  stone: T.hex(T.RESOURCE.stone),
  gold: T.hex(T.RESOURCE.gold),
};

/** Unowned outposts. */
export const NEUTRAL_COLOR = T.hex(T.NEUTRAL_COLOR);
/** Treasure accent: the focus ring on a chest. */
export const CARGO_GOLD = T.hex(T.CARGO_GOLD);
/** Heraldic player colours, handed out in join order (format.ts `playerHeraldry`). */
export const PLAYER_PALETTE = T.HERALDRY.map(T.hex);
