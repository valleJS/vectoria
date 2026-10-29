import {
  inBounds,
  TileType,
  type EntityState,
  type MapData,
  type PlayerState,
  type TileCoord,
  type Vec2,
} from '@vectoria/shared';
import { generateMap } from './mapgen';
import { createRandom } from './random';

const SCOUT_COUNT = 6;
const SCOUT_SPEED = 1.5; // tiles per second

interface Unit extends EntityState {
  target: Vec2;
}

/** Authoritative, in-memory world state. Mutated only by the game loop and validated commands. */
export class GameState {
  readonly map: MapData;
  tick = 0;

  private readonly players = new Map<string, PlayerState>();
  private readonly units = new Map<string, Unit>();
  private readonly random: () => number;

  constructor(options: { width: number; height: number; seed: number }) {
    this.map = generateMap(options.width, options.height, options.seed);
    this.random = createRandom(options.seed ^ 0x9e3779b9);

    for (let i = 0; i < SCOUT_COUNT; i++) {
      const position = this.randomLandTile();
      this.units.set(`scout-${i}`, {
        id: `scout-${i}`,
        kind: 'scout',
        ownerId: null,
        position,
        target: this.randomLandTile(),
      });
    }
  }

  get playerCount(): number {
    return this.players.size;
  }

  addPlayer(id: string): PlayerState {
    const player: PlayerState = { id, selectedTile: null };
    this.players.set(id, player);
    return player;
  }

  removePlayer(id: string): void {
    this.players.delete(id);
  }

  /** Returns false if the tile is outside the map. */
  selectTile(playerId: string, tile: TileCoord): boolean {
    const player = this.players.get(playerId);
    if (!player || !inBounds(this.map, tile.x, tile.y)) return false;
    player.selectedTile = { x: tile.x, y: tile.y };
    return true;
  }

  /** Advances the simulation by one tick. */
  update(dtSeconds: number): void {
    this.tick++;
    const step = SCOUT_SPEED * dtSeconds;

    for (const unit of this.units.values()) {
      const dx = unit.target.x - unit.position.x;
      const dy = unit.target.y - unit.position.y;
      const distance = Math.hypot(dx, dy);
      if (distance <= step) {
        unit.position = unit.target;
        unit.target = this.randomLandTile();
      } else {
        unit.position = {
          x: unit.position.x + (dx / distance) * step,
          y: unit.position.y + (dy / distance) * step,
        };
      }
    }
  }

  snapshotEntities(): EntityState[] {
    return Array.from(this.units.values(), ({ id, kind, ownerId, position }) => ({
      id,
      kind,
      ownerId,
      position,
    }));
  }

  /** Centre of a random non-water tile. */
  private randomLandTile(): Vec2 {
    const { width, height, tiles } = this.map;
    for (let attempt = 0; attempt < 100; attempt++) {
      const x = Math.floor(this.random() * width);
      const y = Math.floor(this.random() * height);
      if (tiles[y * width + x] !== TileType.Water) return { x: x + 0.5, y: y + 0.5 };
    }
    return { x: width / 2, y: height / 2 };
  }
}
