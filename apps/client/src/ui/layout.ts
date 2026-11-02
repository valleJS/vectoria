/**
 * Screen layout shared by the HUD (Hud.tsx) and the map fit (GameRenderer.ts). Below
 * `COMPACT_BELOW` px the HUD switches to the phone layout: top bar, map, bottom tab bar.
 */
export const COMPACT_BELOW = 900;

/** Screen px the HUD covers, for fitting the map into what stays visible. */
export const HUD_INSETS = {
  /** Wide: top bar, w-80 ticker on the left, w-80 column on the right (+ gaps). */
  wide: { top: 52, left: 336, right: 336, bottom: 0 },
  /** Compact: slim top bar and the bottom tab bar. */
  compact: { top: 44, left: 0, right: 0, bottom: 64 },
};

export const compactQuery = `(max-width: ${COMPACT_BELOW - 1}px)`;
