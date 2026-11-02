import {
  hasResources,
  RESOURCES,
  type ArmyView,
  type GameView,
  type MapData,
  type Vec2,
} from '@vectoria/shared';
import {
  Application,
  Container,
  Graphics,
  Sprite,
  Text,
  type PointData,
  type Ticker,
} from 'pixi.js';
import { loadMapArt, type ArtTexture, type MapArt } from '../art/textures';
import { useGameStore, type Selection } from '../state/store';
import { Camera } from './Camera';
import { formatResources, playerColor } from './format';
import { dashedCircle, dashedPolyline, drawBanner, drawCastle } from './glyphs';
import { CARGO_GOLD, INK, NEUTRAL_COLOR, PARCHMENT, SEA, SERIF } from './palette';
import { buildTerrain, type Clearing, type Terrain } from './terrain';

/** Time constant for easing armies toward their latest server position. */
const UNIT_SMOOTHING_MS = 150;
/** Clicks within this many tiles of a site or army select it. */
const PICK_RADIUS_TILES = 0.9;
/** Selection ring rotation, radians per second. */
const SELECTION_SPIN = 0.6;
const FORTIFY_BLUE = 0x3b6ea5;
/** Screen space the HUD covers (Hud.tsx: top bar, w-80 ticker, w-80 right column + gaps). */
const HUD_INSETS = { top: 52, left: 336, right: 336 };

/** Sprite of map art, `width` world px wide, anchored at its ground point. */
function artSprite(art: ArtTexture, width: number): Sprite {
  const sprite = new Sprite(art.texture);
  sprite.anchor.set(art.anchor.x / art.width, art.anchor.y / art.height);
  sprite.scale.set(width / art.width);
  return sprite;
}

interface ArmySprite {
  container: Container;
  /** Holds the banner art (or the vector fallback for colours without a texture). */
  figure: Container;
  plate: Graphics;
  label: Text;
  /** Halo + resource icon + amount, shown while the army carries resources. */
  cargo: Container;
  target: PointData;
  /** Colour + status the banner was last drawn with, so it is only redrawn on change. */
  look: string;
  /** Cargo the marker was last drawn for. */
  cargoKey: string;
}

/** Owns the Pixi application and draws store state. Created and destroyed by <GameCanvas>. */
export class GameRenderer {
  private readonly app: Application;
  private readonly art: MapArt;
  private readonly camera: Camera;
  private readonly world = new Container();
  private readonly terrain = new Container();
  private readonly routes = new Graphics();
  private readonly siteLayer = new Container();
  private readonly selectionRing = new Graphics();
  private readonly armyLayer = new Container();
  private readonly armies = new Map<string, ArmySprite>();
  private readonly unsubscribe: () => void;
  private map: MapData | null = null;
  private built: Terrain | null = null;
  /** Castle and spot positions the terrain was last built around. */
  private clearingsKey = '';
  private view: GameView | null = null;
  /** Fingerprint of the last drawn sites, so labels aren't re-rasterised every tick. */
  private sitesKey = '';

  static async create(host: HTMLElement): Promise<GameRenderer> {
    const app = new Application();
    const [art] = await Promise.all([
      loadMapArt(),
      app.init({
        resizeTo: host,
        background: SEA,
        antialias: true,
        autoDensity: true,
        resolution: window.devicePixelRatio || 1,
      }),
    ]);
    host.appendChild(app.canvas);
    return new GameRenderer(app, art);
  }

  private constructor(app: Application, art: MapArt) {
    this.app = app;
    this.art = art;
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

    app.ticker.add(this.animate);

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

  /** World pixels per glyph unit (glyphs are authored on a 24-unit tile). */
  private get unit(): number {
    return (this.map?.tileSize ?? 32) / 24;
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
      ...this.view.outposts.map((o) => ({
        selection: { kind: 'outpost' as const, id: o.id },
        position: o.position,
      })),
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
    for (const child of this.terrain.removeChildren()) child.destroy({ children: true });
    this.built = null;
    this.clearingsKey = '';
    if (!map) return;
    this.buildGround(this.view);
    const { width, height } = this.app.screen;
    // Fit the map into the area the HUD leaves free (top bar, side panels) when there is room.
    const wide = width >= 900;
    this.camera.fit(map.width * map.tileSize, map.height * map.tileSize, width, height, 24, {
      top: HUD_INSETS.top,
      left: wide ? HUD_INSETS.left : 0,
      right: wide ? HUD_INSETS.right : 0,
      bottom: 0,
    });
  }

  /** (Re)draws the terrain; castles and spots get open ground, so it waits for their positions. */
  private buildGround(view: GameView | null): void {
    if (!this.map) return;
    const clearings: Clearing[] = view
      ? [
          ...view.players.flatMap((p) =>
            p.castle ? [{ ...p.castle, radius: 1.4, open: true }] : [],
          ),
          ...view.outposts.map((o) => ({ ...o.position, radius: 1.1, open: true })),
          ...view.spots.map((s) => ({ ...s.position, radius: 0.75, open: false })),
        ]
      : [];
    const key = JSON.stringify(clearings);
    if (this.built && key === this.clearingsKey) return;
    this.clearingsKey = key;
    for (const child of this.terrain.removeChildren()) child.destroy({ children: true });
    this.built = buildTerrain(this.map, this.art, clearings);
    this.terrain.addChild(this.built.root);
  }

  private setView(view: GameView | null, selfId: string | null): void {
    this.view = view;
    this.drawSites(view, selfId);
    this.drawArmies(view);
  }

  /** Castles, spots and chests change rarely; redraw them wholesale when anything differs. */
  private drawSites(view: GameView | null, selfId: string | null): void {
    const key = view
      ? JSON.stringify([
          selfId,
          view.players,
          view.outposts,
          view.spots.length,
          view.chests,
          this.map?.width,
        ])
      : '';
    if (key === this.sitesKey) return;
    this.sitesKey = key;
    for (const child of this.siteLayer.removeChildren()) child.destroy({ children: true });
    if (!view || !this.map) return;
    this.buildGround(view);
    const u = this.unit;
    // Keep castles, spots and chests readable: no trees or peaks on top of them.
    this.built?.clearAround([
      ...view.players.flatMap((p) => (p.castle ? [{ ...this.px(p.castle), radius: 36 * u }] : [])),
      ...view.outposts.map((o) => ({ ...this.px(o.position), radius: 28 * u })),
      ...view.spots.map((s) => ({ ...this.px(s.position), radius: 18 * u })),
      ...view.chests.map((c) => ({ ...this.px(c.position), radius: 18 * u })),
    ]);

    for (const spot of view.spots) {
      const sprite = artSprite(this.art.spots[spot.resource], 40 * u);
      sprite.position.copyFrom(this.px(spot.position));
      this.siteLayer.addChild(sprite);
    }

    for (const chest of view.chests) {
      const sprite = artSprite(this.art.chest, 30 * u);
      sprite.position.copyFrom(this.px(chest.position));
      this.siteLayer.addChild(sprite);
    }

    for (const outpost of view.outposts) {
      const color = outpost.ownerId ? playerColor(view, outpost.ownerId) : NEUTRAL_COLOR;
      const site = new Container();
      site.position.copyFrom(this.px(outpost.position));
      const art = this.art.castles.get(color);
      let building: Container;
      if (art) {
        building = artSprite(art, 40 * u);
        (building as Sprite).anchor.y = 0.6;
      } else {
        building = drawCastle(new Graphics(), color, u * 0.7);
      }
      if (!outpost.ownerId) building.alpha = 0.8;
      const plate = this.nameplate(`${outpost.name} · ${outpost.troops}`, color, u, 17 * u);
      site.addChild(building, plate);
      if (hasResources(outpost.resources)) {
        const stock = this.label(`Lager: ${formatResources(outpost.resources)}`, 10 * u, INK, true);
        stock.position.set(0, 46 * u);
        site.addChild(stock);
      }
      this.siteLayer.addChild(site);
    }

    for (const player of view.players) {
      if (!player.castle) continue;
      const color = playerColor(view, player.id);
      const castle = new Container();
      castle.position.copyFrom(this.px(player.castle));
      const rings = new Graphics();
      if (player.id === view.self.id) {
        dashedCircle(rings, 34 * u, 20).stroke({ width: 2 * u, color });
      }
      if (player.fortified) {
        rings
          .circle(0, 0, 30 * u)
          .stroke({ width: 3 * u, color: FORTIFY_BLUE, alpha: 0.85 })
          .circle(0, 0, 26.5 * u)
          .stroke({ width: u, color: FORTIFY_BLUE, alpha: 0.85 });
      }
      const art = this.art.castles.get(color);
      let building: Container;
      if (art) {
        building = artSprite(art, 58 * u);
        // Centre the castle body, not its ground line, on the castle tile.
        (building as Sprite).anchor.y = 0.6;
      } else {
        building = drawCastle(new Graphics(), color, u);
      }
      castle.addChild(rings, building);
      castle.addChild(this.nameplate(`${player.name} · ${player.homeTroops}`, color, u));
      if (!player.online) castle.alpha = 0.85;
      this.siteLayer.addChild(castle);
    }
  }

  /** Parchment label with ribbon tails in the owner's colour, below a castle. */
  private nameplate(text: string, color: number, u: number, top = 23 * u): Container {
    const label = this.label(text, 13 * u, INK, true);
    const w = label.width + 14 * u;
    const h = 17 * u;
    const plate = new Graphics();
    for (const side of [-1, 1]) {
      const edge = (side * w) / 2;
      plate
        .poly([
          edge,
          top + 2 * u,
          edge + side * 7 * u,
          top + 2 * u,
          edge + side * 3 * u,
          top + 2 * u + h / 2,
          edge + side * 7 * u,
          top + 2 * u + h,
          edge,
          top + 2 * u + h,
        ])
        .fill(color)
        .stroke({ width: 0.8 * u, color: INK });
    }
    plate
      .rect(-w / 2, top, w, h)
      .fill(PARCHMENT)
      .stroke({ width: 0.9 * u, color: INK });
    label.position.set(0, top + h / 2);
    const container = new Container();
    container.addChild(plate, label);
    return container;
  }

  private drawArmies(view: GameView | null): void {
    if (!this.map || !view) return;
    const u = this.unit;
    const seen = new Set<string>();
    this.routes.clear();

    for (const army of view.armies) {
      seen.add(army.id);
      const color = playerColor(view, army.ownerId);
      const carrying = hasResources(army.cargo);
      const target = this.px(army.position);
      if (army.route && army.status !== 'gathering') {
        const route = army.route.map((p) => this.px(p));
        const to = route[route.length - 1]!;
        const alpha = army.status === 'returning' && !carrying ? 0.5 : 1;
        dashedPolyline(this.routes, route, 7 * u, 5 * u).stroke({
          width: 4 * u,
          color: INK,
          alpha: alpha * 0.8,
          cap: 'round',
        });
        dashedPolyline(this.routes, route, 7 * u, 5 * u).stroke({
          width: 2.4 * u,
          color: carrying ? CARGO_GOLD : color,
          alpha,
          cap: 'round',
        });
        if (army.target?.kind === 'army') {
          // Raid: crossed strokes where the ambush is planned.
          const r = 8 * u;
          this.routes
            .moveTo(to.x - r, to.y - r)
            .lineTo(to.x + r, to.y + r)
            .moveTo(to.x + r, to.y - r)
            .lineTo(to.x - r, to.y + r)
            .stroke({ width: 3.2 * u, color: INK, cap: 'round' })
            .moveTo(to.x - r, to.y - r)
            .lineTo(to.x + r, to.y + r)
            .moveTo(to.x + r, to.y - r)
            .lineTo(to.x - r, to.y + r)
            .stroke({ width: 1.8 * u, color, cap: 'round' });
        } else if (army.status === 'outbound') {
          this.routes.circle(to.x, to.y, 14 * u).stroke({ width: 1.6 * u, color, alpha: 0.9 });
        }
      }

      let sprite = this.armies.get(army.id);
      if (!sprite) {
        const container = new Container();
        const figure = new Container();
        const plate = new Graphics();
        const label = this.label('', 11 * u, INK);
        const cargo = new Container();
        label.position.set(0, 9 * u);
        container.addChild(cargo, figure, plate, label);
        container.position.copyFrom(target);
        this.armyLayer.addChild(container);
        sprite = { container, figure, plate, label, cargo, target, look: '', cargoKey: '' };
        this.armies.set(army.id, sprite);
      }
      sprite.target = target;
      const look = `${color}:${army.status}`;
      if (look !== sprite.look) {
        sprite.look = look;
        for (const child of sprite.figure.removeChildren()) child.destroy();
        const art = this.art.banners.get(color);
        sprite.figure.addChild(art ? artSprite(art, 32 * u) : drawBanner(new Graphics(), color, u));
        sprite.container.alpha = army.status === 'returning' && !carrying ? 0.75 : 1;
      }
      const cargoKey = JSON.stringify(army.cargo);
      if (cargoKey !== sprite.cargoKey) {
        sprite.cargoKey = cargoKey;
        this.drawCargo(sprite, army, u);
        sprite.container.alpha = army.status === 'returning' && !carrying ? 0.75 : 1;
      }
      const text =
        (army.troops === null ? '?' : String(army.troops)) +
        (army.status === 'gathering' ? ' · sammelt' : '');
      if (text !== sprite.label.text) {
        sprite.label.text = text;
        const w = sprite.label.width + 8 * u;
        sprite.plate
          .clear()
          .roundRect(-w / 2, 2.5 * u, w, 13 * u, 2 * u)
          .fill(PARCHMENT)
          .stroke({ width: u, color: INK });
      }
    }

    for (const [id, sprite] of this.armies) {
      if (seen.has(id)) continue;
      sprite.container.destroy({ children: true });
      this.armies.delete(id);
    }
  }

  /** Gold halo, the main resource's icon and the total load, so convoys stand out. */
  private drawCargo(sprite: ArmySprite, army: ArmyView, u: number): void {
    for (const child of sprite.cargo.removeChildren()) child.destroy();
    if (!hasResources(army.cargo)) return;
    const main = RESOURCES.reduce((a, b) => (army.cargo[b] > army.cargo[a] ? b : a));
    const total = RESOURCES.reduce((sum, r) => sum + army.cargo[r], 0);
    const halo = new Graphics()
      .ellipse(0, 10 * u, 17 * u, 6 * u)
      .fill({ color: CARGO_GOLD, alpha: 0.35 })
      .stroke({ width: 1.6 * u, color: CARGO_GOLD });
    const icon = artSprite(this.art.resources[main], 18 * u);
    icon.position.set(14 * u, -12 * u);
    const amount = this.label(`+${total}`, 10 * u, INK);
    amount.position.set(14 * u, -1 * u);
    sprite.cargo.addChild(halo, icon, amount);
  }

  private drawSelection(selection: Selection | null): void {
    this.selectionRing.clear();
    if (!selection || !this.view || !this.map) return;
    const position = this.selectionPosition(selection, this.view);
    if (!position) return;
    this.selectionRing.position.copyFrom(this.px(position));
    const radius = selection.kind === 'castle' ? 38 : selection.kind === 'outpost' ? 30 : 22;
    const scaled = radius * this.unit;
    dashedCircle(this.selectionRing, scaled, 14).stroke({
      width: 2.5 * this.unit,
      color: INK,
      cap: 'round',
    });
  }

  private selectionPosition(selection: Selection, view: GameView): Vec2 | null {
    switch (selection.kind) {
      case 'army':
        return view.armies.find((a) => a.id === selection.id)?.position ?? null;
      case 'castle':
        return view.players.find((p) => p.id === selection.id)?.castle ?? null;
      case 'outpost':
        return view.outposts.find((o) => o.id === selection.id)?.position ?? null;
      case 'spot':
        return view.spots.find((s) => s.id === selection.id)?.position ?? null;
      case 'chest':
        return view.chests.find((c) => c.id === selection.id)?.position ?? null;
    }
  }

  private label(text: string, fontSize: number, fill: number, italic = false): Text {
    const label = new Text({
      text,
      style: {
        fontFamily: SERIF,
        fontSize,
        fontStyle: italic ? 'italic' : 'normal',
        fontWeight: italic ? 'normal' : 'bold',
        fill,
      },
      resolution: 3,
    });
    label.anchor.set(0.5);
    return label;
  }

  private readonly animate = (ticker: Ticker): void => {
    const t = 1 - Math.exp(-ticker.deltaMS / UNIT_SMOOTHING_MS);
    for (const { container, target } of this.armies.values()) {
      container.x += (target.x - container.x) * t;
      container.y += (target.y - container.y) * t;
    }
    this.selectionRing.rotation += (SELECTION_SPIN * ticker.deltaMS) / 1000;
    // A selected army moves; keep the ring on it.
    const selection = useGameStore.getState().selection;
    if (selection?.kind === 'army') {
      const sprite = this.armies.get(selection.id);
      if (sprite) this.selectionRing.position.copyFrom(sprite.container.position);
    }
  };
}
