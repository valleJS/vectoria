import {
  inBounds,
  TileType,
  type EntityState,
  type MapData,
  type TileCoord,
} from '@vectoria/shared';
import { Application, Container, Graphics, type PointData, type Ticker } from 'pixi.js';
import { useGameStore } from '../state/store';
import { Camera } from './Camera';

const TILE_COLORS: Record<TileType, number> = {
  [TileType.Grass]: 0x6a9f4b,
  [TileType.Water]: 0x2f6690,
  [TileType.Forest]: 0x2d5a27,
  [TileType.Mountain]: 0x8a8178,
};
/** Time constant for easing units toward their latest server position. */
const UNIT_SMOOTHING_MS = 100;

interface UnitSprite {
  graphics: Graphics;
  target: PointData;
}

export interface GameRendererOptions {
  onTileClick: (tile: TileCoord) => void;
}

/** Owns the Pixi application and draws store state. Created and destroyed by <GameCanvas>. */
export class GameRenderer {
  private readonly app: Application;
  private readonly camera: Camera;
  private readonly world = new Container();
  private readonly terrain = new Graphics();
  private readonly selection = new Graphics();
  private readonly unitLayer = new Container();
  private readonly units = new Map<string, UnitSprite>();
  private readonly unsubscribe: () => void;
  private map: MapData | null = null;

  static async create(host: HTMLElement, options: GameRendererOptions): Promise<GameRenderer> {
    const app = new Application();
    await app.init({
      resizeTo: host,
      background: 0x0b1020,
      antialias: true,
      autoDensity: true,
      resolution: window.devicePixelRatio || 1,
    });
    host.appendChild(app.canvas);
    return new GameRenderer(app, options);
  }

  private constructor(app: Application, options: GameRendererOptions) {
    this.app = app;
    this.world.addChild(this.terrain, this.selection, this.unitLayer);
    app.stage.addChild(this.world);

    this.camera = new Camera(app.canvas, this.world, {
      onClick: (point) => {
        const tile = this.worldToTile(point);
        if (tile) options.onTileClick(tile);
      },
      onZoomChange: (zoom) => useGameStore.getState().setZoom(zoom),
    });

    app.ticker.add(this.animateUnits);

    const initial = useGameStore.getState();
    this.setMap(initial.map);
    this.setEntities(initial.entities);
    this.drawSelection(initial.selectedTile);
    this.unsubscribe = useGameStore.subscribe((state, previous) => {
      if (state.map !== previous.map) this.setMap(state.map);
      if (state.entities !== previous.entities) this.setEntities(state.entities);
      if (state.selectedTile !== previous.selectedTile) this.drawSelection(state.selectedTile);
    });
  }

  destroy(): void {
    this.unsubscribe();
    this.camera.destroy();
    this.app.destroy({ removeView: true }, { children: true });
  }

  private worldToTile(point: PointData): TileCoord | null {
    if (!this.map) return null;
    const x = Math.floor(point.x / this.map.tileSize);
    const y = Math.floor(point.y / this.map.tileSize);
    return inBounds(this.map, x, y) ? { x, y } : null;
  }

  private setMap(map: MapData | null): void {
    this.map = map;
    this.terrain.clear();
    if (!map) return;

    const { width, height, tileSize, tiles } = map;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const type = tiles[y * width + x] ?? TileType.Water;
        // 1px gap reads as a subtle grid against the background.
        this.terrain
          .rect(x * tileSize, y * tileSize, tileSize - 1, tileSize - 1)
          .fill(TILE_COLORS[type]);
      }
    }
    this.camera.fit(
      width * tileSize,
      height * tileSize,
      this.app.screen.width,
      this.app.screen.height,
    );
  }

  private drawSelection(tile: TileCoord | null): void {
    this.selection.clear();
    if (!tile || !this.map) return;
    const size = this.map.tileSize;
    this.selection.rect(tile.x * size, tile.y * size, size - 1, size - 1).stroke({
      width: 2,
      color: 0xffffff,
    });
  }

  private setEntities(entities: EntityState[]): void {
    if (!this.map) return;
    const size = this.map.tileSize;
    const seen = new Set<string>();

    for (const entity of entities) {
      seen.add(entity.id);
      const target = { x: entity.position.x * size, y: entity.position.y * size };
      const existing = this.units.get(entity.id);
      if (existing) {
        existing.target = target;
        continue;
      }
      const graphics = new Graphics()
        .circle(0, 0, size * 0.3)
        .fill(0xf5d76e)
        .stroke({ width: 2, color: 0x1b1b1b });
      graphics.position.set(target.x, target.y);
      this.unitLayer.addChild(graphics);
      this.units.set(entity.id, { graphics, target });
    }

    for (const [id, unit] of this.units) {
      if (seen.has(id)) continue;
      unit.graphics.destroy();
      this.units.delete(id);
    }
  }

  private readonly animateUnits = (ticker: Ticker): void => {
    const t = 1 - Math.exp(-ticker.deltaMS / UNIT_SMOOTHING_MS);
    for (const { graphics, target } of this.units.values()) {
      graphics.x += (target.x - graphics.x) * t;
      graphics.y += (target.y - graphics.y) * t;
    }
  };
}
