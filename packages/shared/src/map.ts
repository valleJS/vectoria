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

// The map wraps around at every edge (a torus): walking off one side enters the opposite one, so
// the world has no border. Positions in game state stay inside the map (`wrapPoint`), but a route
// may run past an edge so its waypoints stay continuous; distances always take the short way round.

/** `value` folded into `[0, size)`. */
export function wrapCoord(value: number, size: number): number {
  const folded = value - size * Math.floor(value / size);
  // `-1e-17 + size` rounds up to `size`; that is the same place as 0.
  return folded >= size ? 0 : folded;
}

/** The shortest signed offset that equals `delta` round a wrapped axis of length `size`. */
export function wrapDelta(delta: number, size: number): number {
  return delta - size * Math.round(delta / size);
}

/** `point` moved into the map. */
export function wrapPoint<P extends TileCoord>(
  map: Pick<MapData, 'width' | 'height'>,
  point: P,
): P {
  return { ...point, x: wrapCoord(point.x, map.width), y: wrapCoord(point.y, map.height) };
}

/** The copy of `to` closest to `from`: where a straight line from `from` to `to` ends. */
export function nearestImage(
  map: Pick<MapData, 'width' | 'height'>,
  from: TileCoord,
  to: TileCoord,
): TileCoord {
  return {
    x: from.x + wrapDelta(to.x - from.x, map.width),
    y: from.y + wrapDelta(to.y - from.y, map.height),
  };
}

/** Straight-line distance between two points, the short way round the wrapped map. */
export function mapDistance(
  map: Pick<MapData, 'width' | 'height'>,
  a: TileCoord,
  b: TileCoord,
): number {
  return Math.hypot(wrapDelta(a.x - b.x, map.width), wrapDelta(a.y - b.y, map.height));
}
