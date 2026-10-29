import type { TileCoord } from './map';

/** Position in tile units; (x + 0.5, y + 0.5) is the centre of tile (x, y). */
export interface Vec2 {
  x: number;
  y: number;
}

export type EntityKind = 'scout' | 'settlement';

export interface EntityState {
  id: string;
  kind: EntityKind;
  ownerId: string | null;
  position: Vec2;
}

export interface PlayerState {
  id: string;
  selectedTile: TileCoord | null;
}
