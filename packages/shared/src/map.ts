export const TileType = {
  Grass: 0,
  Water: 1,
  Forest: 2,
  Mountain: 3,
} as const;
export type TileType = (typeof TileType)[keyof typeof TileType];

export const TILE_TYPE_NAMES: Record<TileType, string> = {
  [TileType.Grass]: 'Grass',
  [TileType.Water]: 'Water',
  [TileType.Forest]: 'Forest',
  [TileType.Mountain]: 'Mountain',
};

export interface TileCoord {
  x: number;
  y: number;
}

/** Map data sent once on connect. `tiles` is row-major: index = y * width + x. */
export interface MapData {
  width: number;
  height: number;
  /** Size of one tile in world (pixel) units at zoom 1. */
  tileSize: number;
  tiles: TileType[];
}

export function inBounds(map: Pick<MapData, 'width' | 'height'>, x: number, y: number): boolean {
  return (
    Number.isInteger(x) &&
    Number.isInteger(y) &&
    x >= 0 &&
    y >= 0 &&
    x < map.width &&
    y < map.height
  );
}

export function getTile(map: MapData, x: number, y: number): TileType | undefined {
  return inBounds(map, x, y) ? map.tiles[y * map.width + x] : undefined;
}
