import { TileType, type ArmyView, type GameView, type MapData, type Vec2 } from '@vectoria/shared';
import { Application, Container, Graphics, Text, type PointData, type Ticker } from 'pixi.js';
import { useGameStore, type Selection } from '../state/store';
import { Camera } from './Camera';
import { playerColor } from './format';

const TILE_COLORS: Record<TileType, number> = {
  [TileType.Grass]: 0x6a9f4b,
  [TileType.Water]: 0x2f6690,
  [TileType.Forest]: 0x2d5a27,
  [TileType.Mountain]: 0x8a8178,
};
const SPOT_COLORS = { wood: 0x8b5a2b, stone: 0xb8b8c0, gold: 0xffd700 } as const;
const SPOT_LABELS = { wood: 'H', stone: 'S', gold: 'G' } as const;
/** Time constant for easing armies toward their latest server position. */
const UNIT_SMOOTHING_MS = 150;
/** Clicks within this many tiles of a site or army select it. */
const PICK_RADIUS_TILES = 0.9;

interface ArmySprite {
  container: Container;
  marker: Graphics;
  label: Text;
  target: PointData;
}

/** Owns the Pixi application and draws store state. Created and destroyed by <GameCanvas>. */
export class GameRenderer {
  private readonly app: Application;
  private readonly camera: Camera;
  private readonly world = new Container();
  private readonly terrain = new Graphics();
  private readonly routes = new Graphics();
  private readonly siteLayer = new Container();
  private readonly selectionRing = new Graphics();
  private readonly armyLayer = new Container();
  private readonly armies = new Map<string, ArmySprite>();
  private readonly unsubscribe: () => void;
  private map: MapData | null = null;
  private view: GameView | null = null;
  /** Fingerprint of the last drawn sites, so labels aren't re-rasterised every tick. */
  private sitesKey = '';

  static async create(host: HTMLElement): Promise<GameRenderer> {
    const app = new Application();
    await app.init({
      resizeTo: host,
      background: 0x0b1020,
      antialias: true,
      autoDensity: true,
      resolution: window.devicePixelRatio || 1,
    });
    host.appendChild(app.canvas);
    return new GameRenderer(app);
  }

  private constructor(app: Application) {
    this.app = app;
    this.world.addChild(
      this.terrain,
      this.routes,
      this.siteLayer,
      this.selectionRing,
      this.armyLayer,
    );
    app.stage.addChild(this.world);

    this.camera = new Camera(app.canvas, this.world, {
      onClick: (point) => useGameStore.getState().select(this.pick(point)),
      onZoomChange: (zoom) => useGameStore.getState().setZoom(zoom),
    });

    app.ticker.add(this.animateArmies);

    const initial = useGameStore.getState();
    this.setMap(initial.map);
    this.setView(initial.view, initial.playerId);
    this.drawSelection(initial.selection);
    this.unsubscribe = useGameStore.subscribe((state, previous) => {
      if (state.map !== previous.map) this.setMap(state.map);
      if (state.view !== previous.view) this.setView(state.view, state.playerId);
      if (state.view !== previous.view || state.selection !== previous.selection) {
        this.drawSelection(state.selection);
      }
    });
  }

  destroy(): void {
    this.unsubscribe();
    this.camera.destroy();
    this.app.destroy({ removeView: true }, { children: true });
  }

  private px(position: Vec2): PointData {
    const size = this.map?.tileSize ?? 32;
    return { x: position.x * size, y: position.y * size };
  }

  /** Nearest army or site to a world point, within the pick radius. */
  private pick(point: PointData): Selection | null {
    if (!this.map || !this.view) return null;
    const size = this.map.tileSize;
    const tile = { x: point.x / size, y: point.y / size };
    const candidates: { selection: Selection; position: Vec2 }[] = [
      ...this.view.armies.map((a) => ({
        selection: { kind: 'army' as const, id: a.id },
        position: a.position,
      })),
      ...this.view.players.flatMap((p) =>
        p.castle ? [{ selection: { kind: 'castle' as const, id: p.id }, position: p.castle }] : [],
      ),
      ...this.view.spots.map((s) => ({
        selection: { kind: 'spot' as const, id: s.id },
        position: s.position,
      })),
      ...this.view.chests.map((c) => ({
        selection: { kind: 'chest' as const, id: c.id },
        position: c.position,
      })),
    ];
    let best: Selection | null = null;
    let bestDistance = PICK_RADIUS_TILES;
    for (const { selection, position } of candidates) {
      const d = Math.hypot(position.x - tile.x, position.y - tile.y);
      if (d < bestDistance) {
        best = selection;
        bestDistance = d;
      }
    }
    return best;
  }

  private setMap(map: MapData | null): void {
    this.map = map;
    this.sitesKey = '';
    this.terrain.clear();
    if (!map) return;

    const { width, height, tileSize, tiles } = map;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const type = tiles[y * width + x] ?? TileType.Water;
        this.terrain.rect(x * tileSize, y * tileSize, tileSize, tileSize).fill(TILE_COLORS[type]);
      }
    }
    this.camera.fit(
      width * tileSize,
      height * tileSize,
      this.app.screen.width,
      this.app.screen.height,
    );
  }

  private setView(view: GameView | null, selfId: string | null): void {
    this.view = view;
    this.drawSites(view, selfId);
    this.drawArmies(view?.armies ?? [], selfId);
  }

  /** Castles, spots and chests change rarely; redraw them wholesale when anything differs. */
  private drawSites(view: GameView | null, selfId: string | null): void {
    const key = view
      ? JSON.stringify([selfId, view.players, view.spots.length, view.chests, this.map?.width])
      : '';
    if (key === this.sitesKey) return;
    this.sitesKey = key;
    for (const child of this.siteLayer.removeChildren()) child.destroy({ children: true });
    if (!view || !this.map) return;
    const size = this.map.tileSize;

    for (const spot of view.spots) {
      const { x, y } = this.px(spot.position);
      const g = new Graphics()
        .poly([x, y - size * 0.45, x + size * 0.4, y + size * 0.3, x - size * 0.4, y + size * 0.3])
        .fill(SPOT_COLORS[spot.resource])
        .stroke({ width: 2, color: 0x1b1b1b });
      const label = this.label(SPOT_LABELS[spot.resource], size * 0.35, 0x1b1b1b);
      label.position.set(x, y + size * 0.02);
      this.siteLayer.addChild(g, label);
    }

    for (const chest of view.chests) {
      const { x, y } = this.px(chest.position);
      const g = new Graphics()
        .roundRect(x - size * 0.3, y - size * 0.22, size * 0.6, size * 0.44, 3)
        .fill(0x9c6b30)
        .stroke({ width: 2, color: 0xf5c542 });
      this.siteLayer.addChild(g);
    }

    for (const player of view.players) {
      if (!player.castle) continue;
      const { x, y } = this.px(player.castle);
      const color = playerColor(player.id, selfId);
      const g = new Graphics()
        .rect(x - size * 0.5, y - size * 0.5, size, size)
        .fill(color)
        .stroke({ width: player.fortified ? 4 : 2, color: player.fortified ? 0xffffff : 0x1b1b1b });
      const name = this.label(`${player.name} · ${player.homeTroops}`, size * 0.4, 0xffffff);
      name.position.set(x, y - size * 0.95);
      this.siteLayer.addChild(g, name);
    }
  }

  private drawArmies(armies: ArmyView[], selfId: string | null): void {
    if (!this.map) return;
    const size = this.map.tileSize;
    const seen = new Set<string>();
    this.routes.clear();

    for (const army of armies) {
      seen.add(army.id);
      const color = playerColor(army.ownerId, selfId);
      const target = this.px(army.position);
      if (army.to && army.status !== 'stationed') {
        const to = this.px(army.to);
        this.routes
          .moveTo(target.x, target.y)
          .lineTo(to.x, to.y)
          .stroke({ width: 2, color, alpha: army.status === 'returning' ? 0.35 : 0.7 });
      }

      let sprite = this.armies.get(army.id);
      if (!sprite) {
        const container = new Container();
        const marker = new Graphics();
        const label = this.label('', size * 0.38, 0xffffff);
        label.position.set(0, size * 0.55);
        container.addChild(marker, label);
        container.position.set(target.x, target.y);
        this.armyLayer.addChild(container);
        sprite = { container, marker, label, target };
        this.armies.set(army.id, sprite);
      }
      sprite.target = target;
      sprite.marker
        .clear()
        .circle(0, 0, size * 0.28)
        .fill(color)
        .stroke({ width: 2, color: army.status === 'stationed' ? 0xffffff : 0x1b1b1b });
      sprite.label.text = army.troops === null ? '?' : String(army.troops);
    }

    for (const [id, sprite] of this.armies) {
      if (seen.has(id)) continue;
      sprite.container.destroy({ children: true });
      this.armies.delete(id);
    }
  }

  private drawSelection(selection: Selection | null): void {
    this.selectionRing.clear();
    if (!selection || !this.view || !this.map) return;
    const position = this.selectionPosition(selection, this.view);
    if (!position) return;
    const { x, y } = this.px(position);
    this.selectionRing
      .circle(x, y, this.map.tileSize * 0.8)
      .stroke({ width: 2, color: 0xffffff, alpha: 0.9 });
  }

  private selectionPosition(selection: Selection, view: GameView): Vec2 | null {
    switch (selection.kind) {
      case 'army':
        return view.armies.find((a) => a.id === selection.id)?.position ?? null;
      case 'castle':
        return view.players.find((p) => p.id === selection.id)?.castle ?? null;
      case 'spot':
        return view.spots.find((s) => s.id === selection.id)?.position ?? null;
      case 'chest':
        return view.chests.find((c) => c.id === selection.id)?.position ?? null;
    }
  }

  private label(text: string, fontSize: number, fill: number): Text {
    const label = new Text({
      text,
      style: {
        fontFamily: 'system-ui, sans-serif',
        fontSize,
        fontWeight: '600',
        fill,
        stroke: { color: 0x000000, width: fill === 0xffffff ? 3 : 0 },
      },
      resolution: 2,
    });
    label.anchor.set(0.5);
    return label;
  }

  private readonly animateArmies = (ticker: Ticker): void => {
    const t = 1 - Math.exp(-ticker.deltaMS / UNIT_SMOOTHING_MS);
    for (const { container, target } of this.armies.values()) {
      container.x += (target.x - container.x) * t;
      container.y += (target.y - container.y) * t;
    }
  };
}
