import type { ResourceType } from '@vectoria/shared';

/** Cartography palette for the Pixi map. The HUD uses the same values as CSS tokens (index.css). */
export const INK = 0x3b2a18;
export const PARCHMENT = 0xf6eedb;
export const SEA = 0x5d9fb5;
export const SERIF = 'Georgia, "Palatino Linotype", "Book Antiqua", Palatino, serif';

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
