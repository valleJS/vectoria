import {
  hasResources,
  HOUR_MS,
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
import { CARGO_GOLD, INK, NEUTRAL_COLOR, PARCHMENT, SEA, SEAL, SERIF } from './palette';
import { buildTerrain, type Clearing, type Terrain } from './terrain';

/** Time constant for easing armies toward their latest server position. */
const UNIT_SMOOTHING_MS = 150;
/** Clicks within this many tiles of a site or army select it. */
const PICK_RADIUS_TILES = 0.9;
/** Selection ring rotation, radians per second. */
const SELECTION_SPIN = 0.6;
const FORTIFY_BLUE = 0x3b6ea5;
/** Route dashes march toward the target at this many glyph units per second. */
const ROUTE_FLOW = 14;
/** A castle or outpost smokes for this long (game clock) after an assault. */
const RECENT_ATTACK_MS = HOUR_MS;
/** Castle art: y of the body centre, which sits on the castle tile (the ground line is lower). */
const CASTLE_CENTRE_Y = 66;
/**
 * Sites and armies never shrink below their size at this zoom: zoomed out, the pieces grow
 * (up to PIECE_MAX_SCALE) so the live parts of the map stay readable over the terrain.
 */
const PIECE_ZOOM = 0.9;
const PIECE_MAX_SCALE = 1.7;
/** Screen space the HUD covers (Hud.tsx: top bar, w-80 ticker, w-80 right column + gaps). */
const HUD_INSETS = { top: 52, left: 336, right: 336 };

/**
 * Sprite of map art whose drawing is `width` world px wide (outline padding not counted),
 * anchored at its ground point or at `anchorY` (art px of the unpadded drawing).
 */
function artSprite(art: ArtTexture, width: number, anchorY?: number): Sprite {
  const sprite = new Sprite(art.texture);
  const y = anchorY === undefined ? art.anchor.y : anchorY + art.pad;
  sprite.anchor.set(art.anchor.x / art.width, y / art.height);
  sprite.scale.set(width / (art.width - art.pad * 2));
  return sprite;
}

interface ArmySprite {
  container: Container;
  /** Holds the soldiers (or the vector fallback for colours without a texture). */
  figure: Container;
  /** Troop count nameplate, rebuilt when `text` changes. */
  plate: Container;
  text: string;
  /** Gold halo + tag with resource icon and amount, shown while the army carries resources. */
  cargo: Container;
  target: PointData;
  /** Colour + status the soldiers were last drawn with, so they are only redrawn on change. */
  look: string;
  /** Cargo the marker was last drawn for. */
  cargoKey: string;
  /** Marching (not loading at a spot): the soldiers bob as they walk. */
  marching: boolean;
  /** Offsets the walking bob so armies don't step in unison. */
  stride: number;
}

/** A route drawn with marching dashes; redrawn every frame. */
interface RouteLine {
  points: PointData[];
  color: number;
  alpha: number;
}

/** Animated marks on a castle or outpost that is under attack or was attacked recently. */
interface SiteAlert {
  /** Below the site: pulsing ring for an incoming attack, shock waves after one. */
  under: Container;
  /** Above the site: swords badge and smoke. */
  over: Container;
  ring: Graphics;
  wave: Graphics;
  swords: Sprite;
  swordsScale: number;
  smoke: Graphics[];
  /** Ring radius and badge height, world px. */
  radius: number;
  incoming: boolean;
  attackedAt: number | null;
}

/** Owns the Pixi application and draws store state. Created and destroyed by <GameCanvas>. */
export class GameRenderer {
  private readonly app: Application;
  private readonly art: MapArt;
  private readonly camera: Camera;
  private readonly world = new Container();
  private readonly terrain = new Container();
  /** Marching route dashes (redrawn every frame) and their static target marks. */
  private readonly routes = new Graphics();
  private readonly routeMarks = new Graphics();
  private routeLines: RouteLine[] = [];
  private routePhase = 0;
  private readonly alertUnderLayer = new Container();
  private readonly siteLayer = new Container();
  private readonly alertLayer = new Container();
  private alerts: SiteAlert[] = [];
  private alertsKey = '';
  /** Glints twinkling around chests, each with its own phase. */
  private sparkles: { sprite: Sprite; phase: number; size: number }[] = [];
  /** Scale of sites and armies at the current zoom (see PIECE_ZOOM). */
  private pieceScale = 1;
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
  /** Game clock of the last view and when it arrived, to run the clock on between updates. */
  private clockSync = { clock: 0, at: 0, rate: 0 };

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
      this.routeMarks,
      this.alertUnderLayer,
      this.siteLayer,
      this.alertLayer,
      this.selectionRing,
      this.armyLayer,
    );
    app.stage.addChild(this.world);

    this.camera = new Camera(app.canvas, this.world, {
      onClick: (point) => useGameStore.getState().select(this.pick(point)),
      onZoomChange: (zoom) => {
        this.pieceScale = Math.min(PIECE_MAX_SCALE, Math.max(1, PIECE_ZOOM / zoom));
        useGameStore.getState().setZoom(zoom);
      },
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
    if (view) {
      const { clock, running, timeScale } = view.clock;
      this.clockSync = { clock, at: performance.now(), rate: running ? timeScale : 0 };
    }
    this.drawSites(view, selfId);
    this.drawArmies(view);
    this.drawAlerts(view);
  }

  /** Game clock now, run on from the last view. */
  private get clock(): number {
    const { clock, at, rate } = this.clockSync;
    return clock + (performance.now() - at) * rate;
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
    this.sparkles = [];
    if (!view || !this.map) return;
    this.buildGround(view);
    const u = this.unit;
    // Keep castles, spots and chests readable: no trees or peaks on top of them.
    this.built?.clearAround([
      ...view.players.flatMap((p) => (p.castle ? [{ ...this.px(p.castle), radius: 36 * u }] : [])),
      ...view.outposts.map((o) => ({ ...this.px(o.position), radius: 28 * u })),
      ...view.spots.map((s) => ({ ...this.px(s.position), radius: 18 * u })),
      ...view.chests.map((c) => ({ ...this.px(c.position), radius: 22 * u })),
    ]);

    // Every piece is its own container at its map position, so `animate` can scale it.
    for (const spot of view.spots) {
      const piece = new Container();
      piece.position.copyFrom(this.px(spot.position));
      piece.addChild(artSprite(this.art.spots[spot.resource], 40 * u));
      this.siteLayer.addChild(piece);
    }

    for (const chest of view.chests) {
      const piece = new Container();
      piece.position.copyFrom(this.px(chest.position));
      // Gold ground halo, like a convoy carrying resources: treasure to be had.
      const halo = new Graphics()
        .ellipse(0, 9 * u, 20 * u, 6.5 * u)
        .fill({ color: CARGO_GOLD, alpha: 0.3 })
        .stroke({ width: 1.4 * u, color: CARGO_GOLD });
      piece.addChild(halo, artSprite(this.art.chest, 34 * u));
      for (const [x, y, size] of [
        [-15, -14, 9],
        [16, -9, 7],
        [6, -21, 6],
      ] as const) {
        const glint = artSprite(this.art.sparkle, size * u);
        glint.position.set(x * u, y * u);
        piece.addChild(glint);
        this.sparkles.push({ sprite: glint, phase: Math.random() * Math.PI * 2, size: size * u });
      }
      this.siteLayer.addChild(piece);
    }

    for (const outpost of view.outposts) {
      const color = outpost.ownerId ? playerColor(view, outpost.ownerId) : NEUTRAL_COLOR;
      const site = new Container();
      site.position.copyFrom(this.px(outpost.position));
      const art = this.art.castles.get(color);
      let building: Container;
      if (art) {
        building = artSprite(art, 40 * u, CASTLE_CENTRE_Y);
      } else {
        building = drawCastle(new Graphics(), color, u * 0.7);
      }
      if (!outpost.ownerId) building.alpha = 0.85;
      const plate = this.nameplate(`${outpost.name} · ${outpost.troops}`, color, u, {
        top: 17 * u,
      });
      site.addChild(building, plate);
      if (hasResources(outpost.resources)) {
        const stock = this.nameplate(`Lager: ${formatResources(outpost.resources)}`, null, u, {
          top: 37 * u,
          size: 10 * u,
        });
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
        // Centre the castle body, not its ground line, on the castle tile.
        building = artSprite(art, 58 * u, CASTLE_CENTRE_Y);
      } else {
        building = drawCastle(new Graphics(), color, u);
      }
      castle.addChild(rings, building);
      castle.addChild(this.nameplate(`${player.name} · ${player.homeTroops}`, color, u));
      if (!player.online) castle.alpha = 0.85;
      this.siteLayer.addChild(castle);
    }
  }

  /**
   * The one label style on the map: italic ink on a parchment plate, with ribbon tails in the
   * owner's colour (none for `null`). `top` is the plate's top edge, `size` the font size; all
   * proportions follow the font size, so castle, outpost and army plates match.
   */
  private nameplate(
    text: string,
    color: number | null,
    u: number,
    { top = 23 * u, size = 13 * u }: { top?: number; size?: number } = {},
  ): Container {
    const label = this.label(text, size, INK, true);
    const w = label.width + size * 1.1;
    const h = size * 1.3;
    const line = Math.max(0.7 * u, size * 0.07);
    const plate = new Graphics();
    if (color !== null) {
      const tail = size * 0.54;
      const drop = size * 0.15;
      for (const side of [-1, 1]) {
        const edge = (side * w) / 2;
        plate
          .poly([
            edge,
            top + drop,
            edge + side * tail,
            top + drop,
            edge + side * tail * 0.43,
            top + drop + h / 2,
            edge + side * tail,
            top + drop + h,
            edge,
            top + drop + h,
          ])
          .fill(color)
          .stroke({ width: line, color: INK });
      }
    }
    plate
      .rect(-w / 2, top, w, h)
      .fill(PARCHMENT)
      .stroke({ width: line, color: INK });
    label.position.set(0, top + h / 2);
    const container = new Container();
    container.addChild(plate, label);
    return container;
  }

  private drawArmies(view: GameView | null): void {
    if (!this.map || !view) return;
    const u = this.unit;
    const seen = new Set<string>();
    this.routeLines = [];
    this.routeMarks.clear();

    for (const army of view.armies) {
      seen.add(army.id);
      const color = playerColor(view, army.ownerId);
      const carrying = hasResources(army.cargo);
      const target = this.px(army.position);
      if (army.route && army.status !== 'gathering') {
        const route = army.route.map((p) => this.px(p));
        const to = route[route.length - 1]!;
        const alpha = army.status === 'returning' && !carrying ? 0.5 : 1;
        this.routeLines.push({ points: route, color: carrying ? CARGO_GOLD : color, alpha });
        if (army.target?.kind === 'army') {
          // Raid: crossed strokes where the ambush is planned.
          const r = 8 * u;
          this.routeMarks
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
          this.routeMarks.circle(to.x, to.y, 14 * u).stroke({ width: 1.6 * u, color, alpha: 0.9 });
        }
      }

      let sprite = this.armies.get(army.id);
      if (!sprite) {
        const container = new Container();
        const figure = new Container();
        const plate = new Container();
        const cargo = new Container();
        container.addChild(cargo, figure, plate);
        container.position.copyFrom(target);
        this.armyLayer.addChild(container);
        sprite = {
          container,
          figure,
          plate,
          text: '',
          cargo,
          target,
          look: '',
          cargoKey: '',
          marching: false,
          stride: Math.random() * Math.PI * 2,
        };
        this.armies.set(army.id, sprite);
      }
      sprite.target = target;
      sprite.marching = army.status !== 'gathering';
      const look = `${color}:${army.status}`;
      if (look !== sprite.look) {
        sprite.look = look;
        for (const child of sprite.figure.removeChildren()) child.destroy();
        const art = this.art.soldiers.get(color);
        sprite.figure.addChild(art ? artSprite(art, 38 * u) : drawBanner(new Graphics(), color, u));
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
      if (text !== sprite.text) {
        sprite.text = text;
        for (const child of sprite.plate.removeChildren()) child.destroy({ children: true });
        sprite.plate.addChild(this.nameplate(text, color, u, { top: 2 * u, size: 11 * u }));
      }
    }

    for (const [id, sprite] of this.armies) {
      if (seen.has(id)) continue;
      sprite.container.destroy({ children: true });
      this.armies.delete(id);
    }
  }

  /** Route dashes, shifted by `routePhase` so they march toward the target. */
  private drawRoutes(): void {
    const u = this.unit;
    this.routes.clear();
    for (const { points, color, alpha } of this.routeLines) {
      dashedPolyline(this.routes, points, 7 * u, 5 * u, this.routePhase).stroke({
        width: 4 * u,
        color: INK,
        alpha: alpha * 0.8,
        cap: 'round',
      });
      dashedPolyline(this.routes, points, 7 * u, 5 * u, this.routePhase).stroke({
        width: 2.4 * u,
        color,
        alpha,
        cap: 'round',
      });
    }
  }

  /**
   * Alarm marks on castles and outposts: swords and a pulsing ring while an enemy army marches
   * on them, smoke and shock waves for a while after an assault. Animated in `animate`.
   */
  private drawAlerts(view: GameView | null): void {
    const sites: {
      id: string;
      position: Vec2;
      radius: number;
      incoming: boolean;
      attackedAt: number | null;
    }[] = [];
    if (view && this.map) {
      const incoming = (kind: 'castle' | 'outpost', id: string, ownerId: string | null) =>
        view.armies.some(
          (a) =>
            a.status === 'outbound' &&
            a.ownerId !== ownerId &&
            a.target?.kind === kind &&
            a.target.id === id,
        );
      const recent = (at: number | null | undefined) =>
        at != null && view.clock.clock - at < RECENT_ATTACK_MS ? at : null;
      for (const p of view.players) {
        if (!p.castle) continue;
        sites.push({
          id: p.id,
          position: p.castle,
          radius: 36,
          incoming: incoming('castle', p.id, p.id),
          attackedAt: recent(p.attackedAt),
        });
      }
      for (const o of view.outposts) {
        sites.push({
          id: o.id,
          position: o.position,
          radius: 27,
          incoming: incoming('outpost', o.id, o.ownerId),
          attackedAt: recent(o.attackedAt),
        });
      }
    }
    const active = sites.filter((s) => s.incoming || s.attackedAt !== null);
    const key = JSON.stringify([active, this.map?.tileSize]);
    if (key === this.alertsKey) return;
    this.alertsKey = key;
    for (const child of this.alertUnderLayer.removeChildren()) child.destroy({ children: true });
    for (const child of this.alertLayer.removeChildren()) child.destroy({ children: true });
    this.alerts = [];
    const u = this.unit;
    for (const site of active) {
      const at = this.px(site.position);
      const radius = site.radius * u;
      const under = new Container();
      const over = new Container();
      under.position.copyFrom(at);
      over.position.copyFrom(at);
      const ring = new Graphics()
        .circle(0, 0, radius)
        .stroke({ width: 3.2 * u, color: SEAL })
        .circle(0, 0, radius)
        .fill({ color: SEAL, alpha: 0.12 });
      const wave = new Graphics().circle(0, 0, radius).stroke({ width: 2.6 * u, color: SEAL });
      const swords = artSprite(this.art.alarm, 24 * u);
      const smoke = [0, 1, 2, 3, 4, 5].map(() =>
        new Graphics()
          .circle(0, 0, 6 * u)
          .fill({ color: 0x847d74 })
          .stroke({ width: 0.9 * u, color: INK, alpha: 0.35 }),
      );
      ring.visible = site.incoming;
      swords.visible = site.incoming;
      wave.visible = site.attackedAt !== null;
      for (const puff of smoke) puff.visible = site.attackedAt !== null;
      under.addChild(ring, wave);
      over.addChild(...smoke, swords);
      this.alertUnderLayer.addChild(under);
      this.alertLayer.addChild(over);
      this.alerts.push({
        under,
        over,
        ring,
        wave,
        swords,
        swordsScale: swords.scale.x,
        smoke,
        radius,
        incoming: site.incoming,
        attackedAt: site.attackedAt,
      });
    }
  }

  private animateAlerts(seconds: number): void {
    const u = this.unit;
    const clock = this.clock;
    for (const alert of this.alerts) {
      if (alert.incoming) {
        const pulse = 0.5 + 0.5 * Math.sin(seconds * 6);
        alert.ring.scale.set(1 + 0.07 * pulse);
        alert.ring.alpha = 0.45 + 0.55 * pulse;
        alert.swords.y = -alert.radius * 1.35 - Math.abs(Math.sin(seconds * 3)) * 4 * u;
        alert.swords.scale.set(alert.swordsScale * (1 + 0.08 * pulse));
      }
      if (alert.attackedAt !== null) {
        // Fades out over RECENT_ATTACK_MS; the alert is rebuilt once the server view moves on.
        const fresh = Math.max(0, 1 - (clock - alert.attackedAt) / RECENT_ATTACK_MS);
        const strength = 0.35 + 0.65 * fresh;
        const p = (seconds / 1.6) % 1;
        alert.wave.scale.set(0.55 + 0.75 * p);
        alert.wave.alpha = (1 - p) * 0.9 * strength;
        // Two columns of smoke, rising from the towers.
        alert.smoke.forEach((puff, i) => {
          const q = (seconds * 0.45 + i / alert.smoke.length) % 1;
          const side = i % 2 ? 1 : -1;
          puff.position.set(
            side * alert.radius * 0.55 + Math.sin(q * 5 + i) * 4 * u + q * 8 * u,
            -alert.radius * 0.45 - q * 40 * u,
          );
          puff.scale.set(0.45 + q * 1.4);
          puff.alpha = Math.min(1, Math.sin(q * Math.PI) * 1.4) * 0.85 * strength;
        });
      }
    }
  }

  /** Gold halo and a parchment tag with the main resource's icon and the total load. */
  private drawCargo(sprite: ArmySprite, army: ArmyView, u: number): void {
    for (const child of sprite.cargo.removeChildren()) child.destroy({ children: true });
    if (!hasResources(army.cargo)) return;
    const main = RESOURCES.reduce((a, b) => (army.cargo[b] > army.cargo[a] ? b : a));
    const total = RESOURCES.reduce((sum, r) => sum + army.cargo[r], 0);
    const halo = new Graphics()
      .ellipse(0, 0, 20 * u, 6.5 * u)
      .fill({ color: CARGO_GOLD, alpha: 0.3 })
      .stroke({ width: 1.4 * u, color: CARGO_GOLD });
    const amount = this.label(`+${total}`, 10 * u, INK, true);
    const icon = artSprite(this.art.resources[main], 15 * u);
    const w = amount.width + 22 * u;
    const h = 14 * u;
    const tag = new Container();
    tag.position.set(15 * u, -26 * u);
    const plate = new Graphics()
      .roundRect(0, -h / 2, w, h, h / 2)
      .fill(PARCHMENT)
      .stroke({ width: 0.8 * u, color: INK });
    icon.position.set(8 * u, 0);
    amount.anchor.set(0, 0.5);
    amount.position.set(16 * u, 0);
    tag.addChild(plate, icon, amount);
    sprite.cargo.addChild(halo, tag);
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
    const seconds = performance.now() / 1000;
    const u = this.unit;
    const k = this.pieceScale;
    for (const { container, figure, target, marching, stride } of this.armies.values()) {
      container.x += (target.x - container.x) * t;
      container.y += (target.y - container.y) * t;
      container.scale.set(k);
      figure.y = marching ? -Math.abs(Math.sin(seconds * 7 + stride)) * 1.8 * u : 0;
    }
    for (const piece of this.siteLayer.children) piece.scale.set(k);
    for (const alert of this.alerts) {
      alert.under.scale.set(k);
      alert.over.scale.set(k);
    }
    this.selectionRing.scale.set(k);
    for (const { sprite, phase, size } of this.sparkles) {
      const twinkle = Math.max(0, Math.sin(seconds * 2.2 + phase));
      sprite.alpha = twinkle;
      sprite.scale.set(((0.4 + 0.6 * twinkle) * size) / this.art.sparkle.width);
      sprite.rotation = seconds * 0.8 + phase;
    }
    this.routePhase += (ROUTE_FLOW * u * ticker.deltaMS) / 1000;
    this.drawRoutes();
    this.animateAlerts(seconds);
    this.selectionRing.rotation += (SELECTION_SPIN * ticker.deltaMS) / 1000;
    // A selected army moves; keep the ring on it.
    const selection = useGameStore.getState().selection;
    if (selection?.kind === 'army') {
      const sprite = this.armies.get(selection.id);
      if (sprite) this.selectionRing.position.copyFrom(sprite.container.position);
    }
  };
}
