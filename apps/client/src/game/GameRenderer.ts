import {
  findPath,
  getTile,
  hasResources,
  HOUR_MS,
  pointAlong,
  RESOURCES,
  TileType,
  type ArmyView,
  type GameView,
  type Resources,
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
import {
  CARAVAN_LANTERN,
  CASTLE_WINDOWS,
  GOLD_MINE_GLINTS,
  OUTPOST_WINDOWS,
  type LitWindow,
} from '../art/svg';
import { useGameStore, type Selection } from '../state/store';
import { COMPACT_BELOW, HUD_INSETS } from '../ui/layout';
import { Camera } from './Camera';
import { formatResources, playerColor, playerHeraldry, playerName } from './format';
import { pointedDashes } from './glyphs';
import {
  CARGO_GOLD,
  FORTIFY_BLUE,
  INK,
  NEUTRAL_COLOR,
  PARCHMENT,
  RESOURCE_COLORS,
  SPOT_COLORS,
  SEA,
  SEAL,
  SERIF,
} from './palette';
import { FIRELIGHT, NightScene, isNightRest, type NightLight } from './night';
import { buildTerrain, type Clearing, type Terrain } from './terrain';

/** Time constant for easing armies toward their latest server position. */
const UNIT_SMOOTHING_MS = 150;
/** Clicks within this many tiles of a site or army select it. */
const PICK_RADIUS_TILES = 0.9;
/** A click this close to the previous one (tiles) cycles to the next thing stacked there. */
const REPICK_RADIUS_TILES = 0.5;
/** Focus ring: studs orbit at this many radians per second; the ring locks on over LOCK_MS. */
const SELECTION_SPIN = 0.35;
const LOCK_MS = 260;
/** Route dashes march toward the target at this many glyph units per second. */
const ROUTE_FLOW = 14;
/** At night the armies rest in camp, so their route dashes creep at this share of ROUTE_FLOW. */
const ROUTE_FLOW_NIGHT = 0.4;
/** A castle or outpost smokes for this long (game clock) after an assault. */
const RECENT_ATTACK_MS = HOUR_MS;
/**
 * Sites and armies never shrink below their size at this zoom: zoomed out, the pieces grow
 * (up to PIECE_MAX_SCALE) so the live parts of the map stay readable over the terrain.
 */
const PIECE_ZOOM = 0.9;
const PIECE_MAX_SCALE = 1.7;
/**
 * A gathering army is a heraldic shield in its owner's colour with the troop count, on a ring
 * around the deposit (glyph units from the spot centre); gatherers at one spot line up clockwise
 * from the top right, a wider ring takes the rest once one is full. GATHER_BADGE is the shield's
 * half width.
 */
const GATHER_RING = 28;
const GATHER_RING_STEP = 20;
const GATHER_BADGE = 9;
const GATHER_START_ANGLE = -Math.PI / 3;
/** Diameter (glyph units) of the cargo roundel on an army or wagon carrying resources home. */
const CARGO_SIZE = 15;
/** Foam rings behind a ship: one every WAKE_EVERY_S, fading over WAKE_LIFE_S. */
const WAKE_EVERY_S = 0.3;
const WAKE_LIFE_S = 1.8;
const FOAM = 0xf4e7c4;
/** A Seeweg army boards / lands once it has been past the coastline this long (seconds). */
const SHORE_S = 0.25;
/**
 * Serif with lining figures for counts centred in a badge: Georgia's old-style figures rise and
 * dip (a 5 hangs below the line), so they never sit in the middle.
 */
const LINING_SERIF = '"Times New Roman", Times, serif';
/** Armies closer than this (tiles) are fanned out side by side so each stays readable. */
const STACK_RADIUS_TILES = 0.7;
/** Horizontal spacing (glyph units) of fanned-out armies. */
const STACK_STEP = 27;
/** On load the camera starts this much closer than the whole-map fit, framed on the own castle. */
const START_ZOOM_IN = 1.6;

/**
 * Sprite of map art whose drawing is `width` world px wide (outline padding not counted),
 * anchored at its ground point, or at its visual centre when `centred` (sites on their tile).
 */
function artSprite(art: ArtTexture, width: number, centred = false): Sprite {
  const sprite = new Sprite(art.texture);
  const y = centred ? art.centreY : art.anchor.y;
  sprite.anchor.set(art.anchor.x / art.width, y / art.height);
  sprite.scale.set(width / (art.width - art.pad * 2));
  return sprite;
}

/**
 * Night lights in the windows of a site drawn with `artSprite(art, width, true)` at `at`; none
 * until the coloured art is rasterised (`onReady` redraws then).
 */
function windowLights(
  at: PointData,
  art: ArtTexture | null,
  width: number,
  windows: readonly LitWindow[],
): NightLight[] {
  if (!art) return [];
  const k = width / (art.width - art.pad * 2);
  return windows.map((w) => ({
    x: at.x,
    y: at.y,
    dx: (w.x + art.pad - art.anchor.x) * k,
    dy: (w.y + art.pad - art.centreY) * k,
    radius: (w.size / 2) * k,
    kind: 'window' as const,
  }));
}

/**
 * How an army is drawn: a shield badge while loading at a deposit, soldiers on the march, a tent
 * at night, a ship while a Seeweg leg crosses water.
 */
type FigureMode = 'badge' | 'soldiers' | 'tent' | 'ship';

/**
 * Per figure, glyph units: offset of its visual centre from the ground point (x, then y as a
 * lift) and focus ring radius. The tent's centre sits right of its pole, between the tent and
 * its campfire.
 */
const FIGURE_FOCUS: Record<FigureMode, readonly [number, number, number]> = {
  badge: [0, 0, 13],
  soldiers: [0, -12, 22],
  tent: [2.5, -9, 19],
  ship: [0, -15, 27],
};

interface ArmySprite {
  container: Container;
  /** The latest server state of the army. */
  army: ArmyView;
  color: number;
  /** A duo army: the other partner's colour, for the right ribbon tail of its plate. */
  partnerColor: number | null;
  /** Night camp (marching armies pitch tents). */
  camp: boolean;
  mode: FigureMode;
  /** Holds the soldiers, tent, ship or badge. */
  figure: Container;
  /** Troop count nameplate, rebuilt when `text` changes. */
  plate: Container;
  text: string;
  /**
   * Small token with resource icon and amount while the army carries resources; a small chest
   * while it brings a chest home.
   */
  cargo: Container;
  target: PointData;
  /**
   * Remaining route (world px) with the game clock at its start and at arrival, so the army walks
   * on smoothly between state updates. Null when the route is hidden (stealth) or not walking.
   */
  motion: { route: PointData[]; from: number; to: number } | null;
  /** Colour + status the soldiers were last drawn with, so they are only redrawn on change. */
  look: string;
  /** Cargo the marker was last drawn for. */
  cargoKey: string;
  /** Offsets the walking bob (and the ship's roll) so armies don't move in unison. */
  stride: number;
  /** Travel direction along x (1 = right), so a ship sails bow first; taken from the route. */
  heading: number;
  /**
   * On a Seeweg leg: currently drawn as a ship. Flips only once the drawn position has been on
   * the other side of the coastline for SHORE_S (`shoreAt` = since when), so easing and server
   * corrections at the water's edge never make the figure flicker.
   */
  afloat: boolean;
  shoreAt: number;
  /** Seconds timestamp of the last foam ring left behind a ship. */
  wakeAt: number;
  /** Display offset (world px at piece scale 1) the container eases toward: fan-out or gather ring slot. */
  offset: PointData;
  /** At night: the campfire's flame and light, flickered in `animate`. */
  fire: { flame: Sprite; light: Sprite; scale: number } | null;
}

/** Drawn width of a night caravan wagon, world px at piece scale 1. */
const CARAVAN_WIDTH = 48;

/**
 * A wagon of the own night caravan, rolling from its outpost to the home castle by real time
 * (the game clock stands still at night).
 */
interface CaravanSprite {
  container: Container;
  figure: Container;
  /** Land route, world px; the wagon stands at `pointAlong(route, progress)`. */
  route: PointData[];
  /** Lantern light at the front hoop, brighter the darker it is. */
  light: Sprite;
  /** Cargo roundel over the canvas; follows the canvas when the wagon turns. */
  tag: Container;
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
  /**
   * Below the site: the warning ring for an incoming attack (redrawn every frame, with an
   * arrowhead toward each attacker), shock waves after one.
   */
  under: Container;
  /** The site, world px. */
  at: PointData;
  /** Armies marching on the site. */
  attackers: string[];
  /** Above the site: swords badge and smoke. */
  over: Container;
  ring: Graphics;
  wave: Graphics;
  swords: Sprite;
  swordsScale: number;
  smoke: { sprite: Sprite; size: number; spin: number }[];
  flames: { sprite: Sprite; size: number }[];
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
  private routeLines: RouteLine[] = [];
  /** Crossed strokes where a raid plans its ambush (world px, raider's colour). */
  private raidMarks: { x: number; y: number; color: number }[] = [];
  private routePhase = 0;
  private readonly alertUnderLayer = new Container();
  /** Foam rings left behind ships at sea. */
  private readonly wakes = new Graphics();
  private wakeRings: { x: number; y: number; born: number; scale: number }[] = [];
  /**
   * Castles, outposts, chests and deposits, painted back to front by their map y, so a piece
   * further down always stands in front of the one behind it.
   */
  private readonly siteLayer = new Container({ sortableChildren: true });
  /**
   * Resource deposits, above castles, outposts and chests so no site hides one (a deposit next to
   * a castle stays in view), but under the labels and the armies that walk to and work at them.
   */
  private readonly spotLayer = new Container({ sortableChildren: true });
  /** Site nameplates, above every site so no piece hides a label; armies walk in front. */
  private readonly labelLayer = new Container({ sortableChildren: true });
  private readonly alertLayer = new Container();
  private alerts: SiteAlert[] = [];
  private alertsKey = '';
  /**
   * Glints twinkling on chests and gold mines, each with its own phase; chest glints also turn,
   * gold mine glints only blink.
   */
  private sparkles: {
    sprite: Sprite;
    phase: number;
    size: number;
    speed: number;
    spin: boolean;
  }[] = [];
  /** Warm shine pulsing under gold mines. */
  private shines: { sprite: Sprite; phase: number }[] = [];
  /** Scale of sites and armies at the current zoom (see PIECE_ZOOM). */
  private pieceScale = 1;
  /**
   * Focus ring around the selection: a soft disc on the ground under the piece, and over
   * everything else on the map the parchment band with orbiting studs and four arrowheads that
   * point at it, so no site, label or army ever hides it.
   */
  private readonly focusGround = new Graphics();
  private readonly focusTop = new Graphics();
  private focus: { key: string; radius: number; color: number; since: number } | null = null;
  /** Armies, painted back to front; gather badges always on top. */
  private readonly armyLayer = new Container({ sortableChildren: true });
  private readonly armies = new Map<string, ArmySprite>();
  /** Wagons of the own night caravan, with the trip they were built for. */
  private caravans: CaravanSprite[] = [];
  private caravanKey = '';
  private caravanTrip: { departedAt: number; arrivesAt: number } | null = null;
  /** Night rest: darkness, lights, fireflies, stars (see night.ts). */
  private readonly night: NightScene;
  private readonly unsubscribe: () => void;
  private map: MapData | null = null;
  private built: Terrain | null = null;
  /** Tile of the previous map click, to tell a repeated click on the same spot. */
  private lastPick: Vec2 | null = null;
  /** The camera has been framed on the own castle for the current map. */
  private framed = false;
  /** Castle and spot positions the terrain was last built around. */
  private clearingsKey = '';
  private view: GameView | null = null;
  /** Fingerprint of the last drawn sites, so labels aren't re-rasterised every tick. */
  private sitesKey = '';
  /** Night lights of the sites (windows, chests) and of deposits someone is loading at. */
  private siteLights: NightLight[] = [];
  private gatherLights: NightLight[] = [];
  /** Spots with gatherers, so their lights are rebuilt only when that changes. */
  private gatherKey = '';
  /** Game clock of the last view and when it arrived, to run the clock on between updates. */
  private clockSync = { clock: 0, at: 0, rate: 0 };
  private selfId: string | null = null;

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
    this.night = new NightScene(art);
    // Bottom to top: ground (terrain, night, marks on the ground, routes, wakes, focus disc),
    // sites and their lamp light, deposits, labels, alarms, armies, fireflies, the focus ring.
    this.world.addChild(
      this.terrain,
      this.night.darkness,
      this.night.stars,
      this.alertUnderLayer,
      this.routes,
      this.wakes,
      this.focusGround,
      this.night.glowUnder,
      this.siteLayer,
      this.night.glowOver,
      this.spotLayer,
      this.labelLayer,
      this.alertLayer,
      this.armyLayer,
      this.night.fireflies,
      this.focusTop,
    );
    app.stage.addChild(this.world);

    this.camera = new Camera(app.canvas, this.world, {
      onClick: (point) => {
        const store = useGameStore.getState();
        store.select(this.pick(point, store.selection));
      },
      onZoomChange: (zoom) => {
        this.pieceScale = Math.min(PIECE_MAX_SCALE, Math.max(1, PIECE_ZOOM / zoom));
        useGameStore.getState().setZoom(zoom);
      },
    });

    app.ticker.add(this.animate);
    // Pieces in a colour seen for the first time are rasterised on demand; redraw once ready.
    art.pieces.onReady = () => {
      this.sitesKey = '';
      for (const sprite of this.armies.values()) sprite.look = '';
      this.setView(this.view, this.selfId);
    };

    const initial = useGameStore.getState();
    this.setMap(initial.map);
    this.setView(initial.view, initial.playerId);
    this.unsubscribe = useGameStore.subscribe((state, previous) => {
      if (state.map !== previous.map) this.setMap(state.map);
      if (state.view !== previous.view) this.setView(state.view, state.playerId);
    });
  }

  destroy(): void {
    this.art.pieces.onReady = null;
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
  private pick(point: PointData, current: Selection | null): Selection | null {
    if (!this.map || !this.view) return null;
    const size = this.map.tileSize;
    const tile = { x: point.x / size, y: point.y / size };
    const candidates: { selection: Selection; position: Vec2 }[] = [
      ...this.view.armies.map((a) => ({
        selection: { kind: 'army' as const, id: a.id },
        position: this.armyPickPosition(a),
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
      ...this.caravans.map((wagon, i) => {
        const { x, y } = this.caravanFocus(wagon);
        return {
          selection: { kind: 'caravan' as const, id: String(i) },
          position: { x: x / size, y: y / size },
        };
      }),
    ];
    const hits = candidates
      .map(({ selection, position }) => ({
        selection,
        d: Math.hypot(position.x - tile.x, position.y - tile.y),
      }))
      .filter((hit) => hit.d < PICK_RADIUS_TILES)
      .sort((a, b) => a.d - b.d)
      .map((hit) => hit.selection);
    // Clicking the same spot again steps through everything stacked there (nearest first).
    const last = this.lastPick;
    this.lastPick = tile;
    const again = last && Math.hypot(last.x - tile.x, last.y - tile.y) < REPICK_RADIUS_TILES;
    const index = again
      ? hits.findIndex((h) => h.kind === current?.kind && h.id === current.id)
      : -1;
    return hits[(index + 1) % hits.length] ?? null;
  }

  /**
   * Where an army is clicked: where it is drawn (fanned out of a stack), and its badge for a
   * gathering army (the deposit itself selects the spot).
   */
  private armyPickPosition(army: ArmyView): Vec2 {
    const sprite = this.armies.get(army.id);
    if (!sprite || !this.map) return army.position;
    const { x, y } = this.armyFocus(sprite);
    return { x: x / this.map.tileSize, y: y / this.map.tileSize };
  }

  /**
   * Centre and radius (world px, at the current piece scale) of an army as it is drawn right now:
   * fanned out of a stack, as a badge on the ring around a deposit, or the body of its soldiers,
   * tent or ship.
   */
  private armyFocus(sprite: ArmySprite): { x: number; y: number; radius: number } {
    const { position, pivot, scale } = sprite.container;
    const u = this.unit;
    const [dx, lift, radius] = FIGURE_FOCUS[sprite.mode];
    return {
      x: position.x + (dx * u - pivot.x) * scale.x,
      y: position.y + (lift * u - pivot.y) * scale.y,
      radius: radius * u * scale.x,
    };
  }

  /** Centre and radius (world px, at the current piece scale) of a caravan wagon as drawn. */
  private caravanFocus(wagon: CaravanSprite): { x: number; y: number; radius: number } {
    const { position, scale } = wagon.container;
    const u = this.unit;
    return {
      x: position.x + u * scale.x,
      y: position.y - 12 * u * scale.y,
      radius: 27 * u * scale.x,
    };
  }

  /** Whether a world point lies on water as drawn (off the map counts as sea). */
  private isWater(point: PointData): boolean {
    if (this.built) return this.built.isWater(point.x, point.y);
    if (!this.map) return false;
    const size = this.map.tileSize;
    const tile = getTile(this.map, Math.floor(point.x / size), Math.floor(point.y / size));
    return tile === undefined || tile === TileType.Water;
  }

  private setMap(map: MapData | null): void {
    this.map = map;
    this.framed = false;
    this.sitesKey = '';
    for (const child of this.terrain.removeChildren()) child.destroy({ children: true });
    this.built = null;
    this.clearingsKey = '';
    this.night.setMap(map);
    if (!map) return;
    this.buildGround(this.view);
    this.frame(null);
  }

  /**
   * Fits the map into the area the HUD leaves free (side panels, or the phone's tab bar). Given
   * the own castle, starts a bit closer and framed on it, without looking past the map's edge.
   */
  private frame(castle: Vec2 | null): void {
    if (!this.map) return;
    const { width, height } = this.app.screen;
    const wide = width >= COMPACT_BELOW;
    this.camera.fit(
      this.map.width * this.map.tileSize,
      this.map.height * this.map.tileSize,
      width,
      height,
      wide ? 24 : 8,
      wide ? HUD_INSETS.wide : HUD_INSETS.compact,
      castle ? { point: this.px(castle), zoomIn: START_ZOOM_IN } : undefined,
    );
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
    this.selfId = selfId;
    // Once per map: when the own castle is first known, move the camera onto it.
    const castle = view?.players.find((p) => p.id === selfId)?.castle;
    if (!this.framed && this.map && castle) {
      this.framed = true;
      this.frame(castle);
    }
    if (view) {
      const { clock, running, timeScale } = view.clock;
      this.clockSync = { clock, at: performance.now(), rate: running ? timeScale : 0 };
    }
    // Only once a view is there, so a game opened at night starts dark instead of fading in.
    if (view) this.night.setNight(isNightRest(view));
    this.drawSites(view, selfId);
    this.drawArmies(view);
    this.drawCaravan(view, selfId);
    this.drawAlerts(view);
  }

  /**
   * The own night caravan: one wagon per outpost it set out from, on the land route to the home
   * castle, with its load beside it (`cargoPile`). Rebuilt only when the trip (or the colour) changes.
   */
  private drawCaravan(view: GameView | null, selfId: string | null): void {
    const trip = view?.self.caravanTrip ?? null;
    const castle = view?.players.find((p) => p.id === selfId)?.castle ?? null;
    const color = view && selfId ? playerColor(view, selfId) : 0;
    const art = trip && castle ? this.art.pieces.caravan(color) : null;
    const key = trip && castle && art ? JSON.stringify([trip, castle, color, this.unit]) : '';
    if (key === this.caravanKey) return;
    this.caravanKey = key;
    for (const wagon of this.caravans) wagon.container.destroy({ children: true });
    this.caravans = [];
    this.caravanTrip =
      trip && art ? { departedAt: trip.departedAt, arrivesAt: trip.arrivesAt } : null;
    if (!trip || !castle || !art || !this.map) return;
    const u = this.unit;
    for (const wagon of trip.wagons) {
      const path = findPath(this.map, wagon.from, castle) ?? [wagon.from, castle];
      const container = new Container();
      const figure = new Container();
      const light = new Sprite(this.art.glow);
      light.anchor.set(0.5);
      light.tint = FIRELIGHT;
      light.blendMode = 'add';
      light.scale.set((40 * u) / this.art.glow.width);
      const sprite = artSprite(art, CARAVAN_WIDTH * u);
      const k = (CARAVAN_WIDTH * u) / (art.width - art.pad * 2);
      light.position.set(
        (CARAVAN_LANTERN.x + art.pad - art.anchor.x) * k,
        (CARAVAN_LANTERN.y + art.pad - art.anchor.y) * k,
      );
      figure.addChild(light, sprite);
      const tag = this.cargoPile(wagon.load, u);
      tag.position.set(-9 * u, -24 * u);
      container.addChild(figure, tag);
      this.armyLayer.addChild(container);
      this.caravans.push({
        container,
        figure,
        route: path.map((p) => this.px(p)),
        light,
        tag,
        stride: Math.random() * Math.PI * 2,
      });
    }
  }

  /** Night caravan wagons roll on by real time between departure and arrival. */
  private animateCaravan(seconds: number, k: number): void {
    const trip = this.caravanTrip;
    if (!trip) return;
    const span = Math.max(1, trip.arrivesAt - trip.departedAt);
    const p = Math.min(1, Math.max(0, (Date.now() - trip.departedAt) / span));
    const u = this.unit;
    for (const wagon of this.caravans) {
      const at = pointAlong(wagon.route, p);
      const ahead = pointAlong(wagon.route, Math.min(1, p + 0.01));
      wagon.container.position.copyFrom(at);
      wagon.container.scale.set(k);
      wagon.container.zIndex = at.y;
      // The art faces right; it turns where the road heads left. Near-vertical legs keep it.
      if (Math.abs(ahead.x - at.x) > 0.25 * Math.abs(ahead.y - at.y)) {
        wagon.figure.scale.x = ahead.x < at.x ? -1 : 1;
      }
      wagon.tag.x = -9 * u * wagon.figure.scale.x;
      // Rocks gently on the road; the lantern sways and glows only in the dark.
      wagon.figure.y = -Math.abs(Math.sin(seconds * 3 + wagon.stride)) * 0.8 * u;
      wagon.light.alpha = this.night.amount * (0.55 + 0.25 * Math.sin(seconds * 5 + wagon.stride));
    }
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
    for (const layer of [this.siteLayer, this.spotLayer, this.labelLayer]) {
      for (const child of layer.removeChildren()) child.destroy({ children: true });
    }
    this.sparkles = [];
    this.shines = [];
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

    // Every piece is its own container at its map position, so `animate` can scale it, and its
    // labels another one at the same spot in the label layer. Both sort by map y.
    const place = (at: Vec2, labels: Container[] = [], layer = this.siteLayer): Container => {
      const point = this.px(at);
      const piece = new Container();
      piece.position.copyFrom(point);
      piece.zIndex = point.y;
      layer.addChild(piece);
      if (labels.length > 0) {
        const plate = new Container();
        plate.position.copyFrom(point);
        plate.zIndex = point.y;
        plate.addChild(...labels);
        this.labelLayer.addChild(plate);
      }
      return piece;
    };

    for (const spot of view.spots) {
      const piece = place(spot.position, [], this.spotLayer);
      const art = this.art.deposits[spot.resource];
      const width = 44 * u;
      if (spot.resource === 'gold') {
        // The mine shines: a warm glow breathing under it and glints twinkling on the gold.
        const shine = new Sprite(this.art.glow);
        shine.anchor.set(0.5);
        shine.tint = RESOURCE_COLORS.gold;
        shine.blendMode = 'add';
        shine.scale.set((62 * u) / this.art.glow.width);
        shine.position.set(0, 4 * u);
        piece.addChild(shine);
        this.shines.push({ sprite: shine, phase: Math.random() * Math.PI * 2 });
      }
      piece.addChild(artSprite(art, width, true));
      if (spot.resource === 'gold') {
        const k = width / (art.width - art.pad * 2);
        for (const g of GOLD_MINE_GLINTS) {
          const glint = artSprite(this.art.sparkle, g.size * k);
          glint.position.set((g.x + art.pad - art.anchor.x) * k, (g.y + art.pad - art.centreY) * k);
          piece.addChild(glint);
          this.sparkles.push({
            sprite: glint,
            phase: Math.random() * Math.PI * 2,
            size: g.size * k,
            speed: 2.6 + Math.random() * 1.6,
            spin: false,
          });
        }
      }
    }

    for (const chest of view.chests) {
      const piece = place(chest.position, [
        this.nameplate(`ab ${chest.troopsNeeded} Truppen`, null, u, { top: 16 * u, size: 10 * u }),
      ]);
      piece.addChild(artSprite(this.art.chest, 34 * u));
      for (const [x, y, size] of [
        [-15, -14, 9],
        [16, -9, 7],
        [6, -21, 6],
      ] as const) {
        const glint = artSprite(this.art.sparkle, size * u);
        glint.position.set(x * u, y * u);
        piece.addChild(glint);
        this.sparkles.push({
          sprite: glint,
          phase: Math.random() * Math.PI * 2,
          size: size * u,
          speed: 2.2,
          spin: true,
        });
      }
    }

    for (const outpost of view.outposts) {
      const color = outpost.ownerId ? playerColor(view, outpost.ownerId) : NEUTRAL_COLOR;
      // The watchtower already says "Stützpunkt": the plate names only the owner (or the ruin).
      const name = outpost.ownerId ? playerName(view, outpost.ownerId) : 'Ruine';
      const labels = [
        this.nameplate(`${name} · ${outpost.troops}`, color, u, { top: 17 * u, size: 10 * u }),
      ];
      if (hasResources(outpost.resources)) {
        labels.push(
          this.nameplate(`Lager: ${formatResources(outpost.resources)}`, null, u, {
            top: 31 * u,
            size: 8.5 * u,
          }),
        );
      }
      const site = place(outpost.position, labels);
      // Unowned outposts are ruins until someone takes them; owned ones a watchtower.
      const art = outpost.ownerId ? this.art.pieces.outpost(color) : this.art.ruin;
      if (art) site.addChild(artSprite(art, 40 * u, true));
    }

    for (const player of view.players) {
      if (!player.castle) continue;
      const { color, style } = playerHeraldry(view, player.id);
      const home = player.id === view.self.id;
      const castle = place(player.castle, [
        this.nameplate(`${player.name} · ${player.homeTroops}`, color, u, { home }),
      ]);
      const art = this.art.pieces.castle(color, style);
      const rings = new Graphics();
      if (home && art) {
        // The own castle stands on a base in its colour, like a game piece on the board, in a
        // soft glow of the same colour: a wide ellipse at its ground line, rimmed in ink with a
        // parchment inlay, reaching past the walls on both sides.
        const glow = new Sprite(this.art.glow);
        glow.anchor.set(0.5);
        glow.tint = color;
        glow.alpha = 0.32;
        glow.scale.set((120 * u) / this.art.glow.width, (84 * u) / this.art.glow.width);
        glow.position.set(0, 4 * u);
        castle.addChild(glow);
        const k = (58 * u) / (art.width - art.pad * 2);
        const y = (art.anchor.y - art.centreY) * k;
        rings
          .ellipse(0, y, 45 * u, 16 * u)
          .fill({ color, alpha: 0.32 })
          .stroke({ width: 4 * u, color: INK, alpha: 0.8 })
          .ellipse(0, y, 45 * u, 16 * u)
          .stroke({ width: 2.4 * u, color })
          .ellipse(0, y, 39.5 * u, 12.6 * u)
          .stroke({ width: 1.2 * u, color: PARCHMENT, alpha: 0.9 });
      }
      if (player.fortified) {
        rings
          .circle(0, 0, 30 * u)
          .stroke({ width: 3 * u, color: FORTIFY_BLUE, alpha: 0.85 })
          .circle(0, 0, 26.5 * u)
          .stroke({ width: u, color: FORTIFY_BLUE, alpha: 0.85 });
      }
      castle.addChild(rings);
      // Centre the castle body, not its ground line, on the castle tile.
      if (art) castle.addChild(artSprite(art, 58 * u, true));
      if (!player.online) castle.alpha = 0.85;
    }

    // Lamp light for the night: castles and held outposts glow from their windows, chests shimmer.
    const lights: NightLight[] = [
      ...view.players.flatMap((p) => {
        if (!p.castle) return [];
        const { color, style } = playerHeraldry(view, p.id);
        const art = this.art.pieces.castle(color, style);
        return windowLights(this.px(p.castle), art, 58 * u, CASTLE_WINDOWS[style] ?? []);
      }),
      ...view.outposts.flatMap((o) => {
        if (!o.ownerId) return [];
        const art = this.art.pieces.outpost(playerColor(view, o.ownerId));
        return windowLights(this.px(o.position), art, 40 * u, OUTPOST_WINDOWS);
      }),
      ...view.chests.map((c) => ({
        ...this.px(c.position),
        radius: 14 * u,
        kind: 'chest' as const,
      })),
    ];
    this.siteLights = lights;
    this.night.setLights([...this.siteLights, ...this.gatherLights]);
  }

  /**
   * The one label style on the map: italic ink on a parchment plate, with ribbon tails in the
   * owner's colour (none for `null`). `top` is the plate's top edge, `size` the font size; all
   * proportions follow the font size, so castle, outpost and army plates match. `home` puts a
   * gold star before the text (the viewer's own castle); `right` gives the right tail its own
   * colour (a duo army: one tail per partner).
   */
  private nameplate(
    text: string,
    color: number | null,
    u: number,
    {
      top = 23 * u,
      size = 13 * u,
      home = false,
      right,
    }: { top?: number; size?: number; home?: boolean; right?: number } = {},
  ): Container {
    const label = this.label(text, size, INK, true);
    const star = home ? size * 1.05 : 0;
    const w = label.width + size * 1.1 + star;
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
          .fill(side === 1 && right !== undefined ? right : color)
          .stroke({ width: line, color: INK });
      }
    }
    plate
      .rect(-w / 2, top, w, h)
      .fill(PARCHMENT)
      .stroke({ width: line, color: INK });
    if (home) {
      const cx = -w / 2 + size * 0.95;
      const cy = top + h / 2;
      const points: number[] = [];
      for (let i = 0; i < 10; i++) {
        const a = -Math.PI / 2 + (i * Math.PI) / 5;
        const r = (i % 2 ? 0.2 : 0.47) * size;
        points.push(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
      }
      plate
        .poly(points)
        .fill(RESOURCE_COLORS.gold)
        .stroke({ width: line, color: INK, join: 'round' });
    }
    label.position.set(star / 2, top + h / 2);
    const container = new Container();
    container.addChild(plate, label);
    return container;
  }

  private drawArmies(view: GameView | null): void {
    if (!this.map || !view) return;
    const u = this.unit;
    const seen = new Set<string>();
    this.routeLines = [];
    this.raidMarks = [];
    const offsets = this.armyOffsets(view.armies, u);

    // A deposit someone is loading at glows at night: lanterns of the working troops.
    const worked = [
      ...new Set(
        view.armies.flatMap((a) => (a.status === 'gathering' && a.target ? [a.target.id] : [])),
      ),
    ].sort();
    const gatherKey = `${u}:${worked.join(',')}`;
    if (gatherKey !== this.gatherKey) {
      this.gatherKey = gatherKey;
      this.gatherLights = view.spots
        .filter((s) => worked.includes(s.id))
        .map((s) => ({ ...this.px(s.position), radius: 22 * u, kind: 'lantern' as const }));
      this.night.setLights([...this.siteLights, ...this.gatherLights]);
    }

    for (const army of view.armies) {
      seen.add(army.id);
      const color = playerColor(view, army.ownerId);
      const carrying = hasResources(army.cargo);
      const gathering = army.status === 'gathering';
      // Empty-handed armies heading home fade; convoys and chest bearers stay bold.
      const faded = army.status === 'returning' && !carrying && !army.chest;
      const target = this.px(army.position);
      if (army.route && !gathering) {
        const route = army.route.map((p) => this.px(p));
        const to = route[route.length - 1]!;
        const alpha = faded ? 0.5 : 1;
        this.routeLines.push({ points: route, color, alpha });
        // The route itself ends at the destination; only a planned ambush gets a mark.
        if (army.target?.kind === 'army') this.raidMarks.push({ ...to, color });
      }

      let sprite = this.armies.get(army.id);
      if (!sprite) {
        const container = new Container();
        const figure = new Container();
        const plate = new Container();
        const cargo = new Container();
        container.addChild(figure, cargo, plate);
        container.position.copyFrom(target);
        const offset = offsets.get(army.id) ?? { x: 0, y: 0 };
        container.pivot.set(-offset.x, -offset.y);
        this.armyLayer.addChild(container);
        sprite = {
          container,
          army,
          color,
          partnerColor: null,
          camp: false,
          mode: 'soldiers',
          figure,
          plate,
          text: '',
          cargo,
          target,
          motion: null,
          look: '',
          cargoKey: '',
          stride: Math.random() * Math.PI * 2,
          heading: 1,
          afloat: army.sea && army.status !== 'gathering' && this.isWater(target),
          shoreAt: 0,
          wakeAt: 0,
          offset,
          fire: null,
        };
        this.armies.set(army.id, sprite);
      }
      sprite.army = army;
      sprite.color = color;
      sprite.partnerColor = army.duoWith ? playerColor(view, army.duoWith) : null;
      sprite.target = target;
      // At night marching armies pitch camp: a tent with a campfire instead of soldiers.
      sprite.camp = this.night.night && !gathering;
      sprite.offset = offsets.get(army.id) ?? { x: 0, y: 0 };
      sprite.motion =
        !gathering && army.route && army.route.length > 1 && army.arriveClock > view.clock.clock
          ? {
              route: army.route.map((p) => this.px(p)),
              from: view.clock.clock,
              to: army.arriveClock,
            }
          : null;
      sprite.container.alpha = faded ? 0.75 : 1;
      this.drawFigure(sprite);
    }

    for (const [id, sprite] of this.armies) {
      if (seen.has(id)) continue;
      sprite.container.destroy({ children: true });
      this.armies.delete(id);
    }
  }

  /** What an army looks like right now; a Seeweg leg sails where it crosses water. */
  private figureMode(sprite: ArmySprite): FigureMode {
    const { army } = sprite;
    if (army.status === 'gathering') return 'badge';
    if (army.sea && sprite.afloat) return 'ship';
    return sprite.camp ? 'tent' : 'soldiers';
  }

  /**
   * Brings an army's figure, troop plate and cargo up to date with its state; each part is only
   * rebuilt when what it shows has changed. Runs on every server update and, for armies on a
   * Seeweg leg, every frame (they board and land as they cross the coast).
   */
  private drawFigure(sprite: ArmySprite): void {
    const u = this.unit;
    const { army, color } = sprite;
    const mode = this.figureMode(sprite);
    const look = `${color}:${mode}`;
    if (look !== sprite.look) {
      for (const child of sprite.figure.removeChildren()) child.destroy({ children: true });
      sprite.fire = null;
      sprite.mode = mode;
      sprite.figure.rotation = 0;
      sprite.figure.scale.set(1);
      const art =
        mode === 'badge'
          ? this.art.pieces.shield(color)
          : mode === 'ship'
            ? this.art.pieces.ship(color)
            : mode === 'tent'
              ? this.art.pieces.tent(color)
              : this.art.pieces.soldiers(color);
      // Not rasterised yet in this colour: try again once it is (`onReady`).
      sprite.look = art ? look : '';
      if (art && mode === 'badge') {
        // At a deposit the resource stays in view: the army is a shield on the ring around it.
        sprite.figure.addChild(artSprite(art, GATHER_BADGE * 2 * u, true));
      } else if (art && mode === 'tent') {
        sprite.fire = this.campfire(sprite.figure, u, { x: 12 * u, y: 2 * u }, 0.9);
        sprite.figure.addChildAt(artSprite(art, 28 * u), 1);
      } else if (art && mode === 'ship') {
        sprite.figure.addChild(artSprite(art, 46 * u));
      } else if (art) {
        sprite.figure.addChild(artSprite(art, 38 * u));
      }
    }
    const cargoKey = JSON.stringify([army.cargo, army.chest, mode]);
    if (cargoKey !== sprite.cargoKey) {
      sprite.cargoKey = cargoKey;
      this.drawCargo(sprite, army, u, mode);
    }
    const count = army.troops === null ? '?' : String(army.troops);
    const troops = count;
    const text = `${mode === 'badge'}:${troops}:${sprite.partnerColor}`;
    if (text !== sprite.text) {
      sprite.text = text;
      for (const child of sprite.plate.removeChildren()) child.destroy({ children: true });
      if (mode === 'badge') {
        const count = this.label(
          troops,
          (troops.length > 2 ? 7 : 8.5) * u,
          PARCHMENT,
          false,
          LINING_SERIF,
        );
        count.style.stroke = { color: INK, width: 1.6 * u, join: 'round' };
        count.position.set(0, 0.6 * u);
        sprite.plate.addChild(count);
      } else {
        // A duo army's plate flies both partners' colours: owner left, partner right.
        sprite.plate.addChild(
          this.nameplate(troops, color, u, {
            top: 2 * u,
            size: 11 * u,
            right: sprite.partnerColor ?? undefined,
          }),
        );
      }
    }
  }

  /**
   * Display offsets (world px at piece scale 1) so stacked armies stay apart: gathering armies
   * sit as bubbles on a ring around their deposit; other armies standing within
   * STACK_RADIUS_TILES of each other fan out side by side (two rows past four), ordered by id so
   * nobody swaps places between updates.
   */
  private armyOffsets(armies: readonly ArmyView[], u: number): Map<string, PointData> {
    const offsets = new Map<string, PointData>();
    const gatherSlots = new Map<string, number>();
    const loose: ArmyView[] = [];
    for (const army of [...armies].sort((a, b) => (a.id < b.id ? -1 : 1))) {
      if (army.status === 'gathering' && army.target) {
        let slot = gatherSlots.get(army.target.id) ?? 0;
        gatherSlots.set(army.target.id, slot + 1);
        // Fill ring after ring, bubbles just apart on each.
        let radius = GATHER_RING;
        for (;;) {
          const fits = Math.floor((2 * Math.PI * radius) / (2 * GATHER_BADGE + 3));
          if (slot < fits) {
            const angle = GATHER_START_ANGLE + (slot * 2 * Math.PI) / Math.max(fits, 1);
            offsets.set(army.id, {
              x: Math.cos(angle) * radius * u,
              y: Math.sin(angle) * radius * u,
            });
            break;
          }
          slot -= fits;
          radius += GATHER_RING_STEP;
        }
      } else {
        loose.push(army);
      }
    }
    const clustered = new Set<string>();
    for (const army of loose) {
      if (clustered.has(army.id)) continue;
      const group = loose.filter(
        (other) =>
          !clustered.has(other.id) &&
          Math.hypot(other.position.x - army.position.x, other.position.y - army.position.y) <
            STACK_RADIUS_TILES,
      );
      for (const member of group) clustered.add(member.id);
      const perRow = group.length > 4 ? Math.ceil(group.length / 2) : group.length;
      group.forEach((member, i) => {
        const row = Math.floor(i / perRow);
        const inRow = Math.min(perRow, group.length - row * perRow);
        const col = i % perRow;
        offsets.set(member.id, {
          x: (col - (inRow - 1) / 2) * STACK_STEP * u + row * 6 * u,
          y: (row * 20 - (group.length > 1 ? (col % 2) * 4 : 0)) * u,
        });
      });
    }
    return offsets;
  }

  /**
   * A campfire at `at` in `figure`: a warm light pool behind everything, stones and logs, and a
   * flame that `animate` flickers. Returns the parts to animate.
   */
  private campfire(
    figure: Container,
    u: number,
    at: PointData,
    size: number,
  ): { flame: Sprite; light: Sprite; scale: number } {
    const light = new Sprite(this.art.glow);
    light.anchor.set(0.5);
    light.tint = FIRELIGHT;
    light.blendMode = 'add';
    light.scale.set((52 * u * size) / this.art.glow.width);
    light.position.set(at.x, at.y - 5 * u * size);
    const base = artSprite(this.art.campfire, 13 * u * size);
    base.position.set(at.x, at.y);
    const flame = artSprite(this.art.flame, 8 * u * size);
    flame.position.set(at.x, at.y - 1.5 * u * size);
    figure.addChild(light, base, flame);
    return { flame, light, scale: flame.scale.x };
  }

  /**
   * Route dashes in the owner's colour, shifted by `routePhase` so they march toward the target;
   * each dash comes to a point at its leading end, so a standing route still shows its direction.
   */
  private drawRoutes(): void {
    const u = this.unit;
    const g = this.routes.clear();
    for (const { points, color, alpha } of this.routeLines) {
      pointedDashes(g, points, 8 * u, 4 * u, 1.3 * u, 2.6 * u, this.routePhase)
        .fill({ color, alpha })
        .stroke({ width: 1 * u, color: INK, alpha: alpha * 0.8, join: 'round' });
    }
    // Raid crosses grow with the pieces, like everything players act on.
    const s = u * this.pieceScale;
    for (const mark of this.raidMarks) {
      const r = 8 * s;
      for (const [width, color] of [
        [3.2, INK],
        [1.8, mark.color],
      ] as const) {
        g.moveTo(mark.x - r, mark.y - r)
          .lineTo(mark.x + r, mark.y + r)
          .moveTo(mark.x + r, mark.y - r)
          .lineTo(mark.x - r, mark.y + r)
          .stroke({ width: width * s, color, cap: 'round' });
      }
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
      attackers: string[];
      attackedAt: number | null;
    }[] = [];
    if (view && this.map) {
      const incoming = (kind: 'castle' | 'outpost', id: string, ownerId: string | null) =>
        view.armies
          .filter(
            (a) =>
              a.status === 'outbound' &&
              a.ownerId !== ownerId &&
              a.target?.kind === kind &&
              a.target.id === id,
          )
          .map((a) => a.id);
      const recent = (at: number | null | undefined) =>
        at != null && view.clock.clock - at < RECENT_ATTACK_MS ? at : null;
      for (const p of view.players) {
        if (!p.castle) continue;
        sites.push({
          id: p.id,
          position: p.castle,
          radius: 40,
          attackers: incoming('castle', p.id, p.id),
          attackedAt: recent(p.attackedAt),
        });
      }
      for (const o of view.outposts) {
        sites.push({
          id: o.id,
          position: o.position,
          radius: 29,
          attackers: incoming('outpost', o.id, o.ownerId),
          attackedAt: recent(o.attackedAt),
        });
      }
    }
    const active = sites.filter((s) => s.attackers.length > 0 || s.attackedAt !== null);
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
      const incoming = site.attackers.length > 0;
      const ring = new Graphics();
      const wave = new Graphics().circle(0, 0, radius).stroke({ width: 2.6 * u, color: SEAL });
      const swords = artSprite(this.art.alarm, 24 * u);
      const burnt = site.attackedAt !== null;
      const smoke = [0, 1, 2, 3, 4, 5, 6, 7].map((i) => {
        const size = (14 + (i % 3) * 3) * u;
        const sprite = artSprite(this.art.smoke[i % this.art.smoke.length]!, size, true);
        sprite.visible = burnt;
        return { sprite, size, spin: (i % 2 ? 1 : -1) * (0.2 + (i % 3) * 0.1) };
      });
      const flames = [-1, 1].map((side) => {
        const size = 9 * u;
        const sprite = artSprite(this.art.flame, size);
        sprite.position.set(side * site.radius * 0.42 * u, -site.radius * 0.28 * u);
        sprite.visible = burnt;
        return { sprite, size };
      });
      ring.visible = incoming;
      swords.visible = incoming;
      wave.visible = burnt;
      under.addChild(ring, wave);
      over.addChild(...flames.map((f) => f.sprite), ...smoke.map((p) => p.sprite), swords);
      this.alertUnderLayer.addChild(under);
      this.alertLayer.addChild(over);
      this.alerts.push({
        under,
        at,
        attackers: site.attackers,
        over,
        ring,
        wave,
        swords,
        swordsScale: swords.scale.x,
        smoke,
        flames,
        radius,
        incoming,
        attackedAt: site.attackedAt,
      });
    }
  }

  /**
   * Warning ring of a site under threat, in the focus ring's style but in alarm red: a red band
   * edged in ink on a faint red ground, alarm ripples rolling outward from it, and outside it an
   * arrowhead toward each attacker (from where it is drawn right now), thrusting at the site.
   */
  private drawWarning(alert: SiteAlert, seconds: number): void {
    const u = this.unit;
    const r = alert.radius;
    const g = alert.ring.clear();
    const beat = 0.5 + 0.5 * Math.sin(seconds * 4.5);
    g.circle(0, 0, r).fill({ color: SEAL, alpha: 0.08 + 0.07 * beat });
    for (let i = 0; i < 2; i++) {
      const q = (seconds / 1.5 + i / 2) % 1;
      g.circle(0, 0, r * (1 + 0.5 * q)).stroke({
        width: (2.4 - 1.6 * q) * u,
        color: SEAL,
        alpha: 0.7 * (1 - q),
      });
    }
    g.circle(0, 0, r)
      .stroke({ width: 5.4 * u, color: INK, alpha: 0.85 })
      .circle(0, 0, r)
      .stroke({ width: 3.4 * u, color: SEAL })
      .circle(0, 0, r)
      .stroke({ width: 0.9 * u, color: PARCHMENT, alpha: 0.55 + 0.35 * beat });
    const thrust = Math.abs(Math.sin(seconds * 3)) * 3 * u;
    for (const id of alert.attackers) {
      const sprite = this.armies.get(id);
      if (!sprite) continue;
      const from = this.armyFocus(sprite);
      const angle = Math.atan2(from.y - alert.at.y, from.x - alert.at.x);
      const cos = Math.cos(angle);
      const sin = Math.sin(angle);
      const tip = r + 4 * u + thrust;
      const back = tip + 10 * u;
      const half = 6 * u;
      const points = [
        cos * tip,
        sin * tip,
        cos * back - sin * half,
        sin * back + cos * half,
        cos * (back - 3 * u),
        sin * (back - 3 * u),
        cos * back + sin * half,
        sin * back - cos * half,
      ];
      g.poly(points)
        .stroke({ width: 4.4 * u, color: PARCHMENT, join: 'round' })
        .poly(points)
        .fill(SEAL)
        .stroke({ width: 1.4 * u, color: INK, join: 'round' });
    }
  }

  private animateAlerts(seconds: number): void {
    const u = this.unit;
    const clock = this.clock;
    for (const alert of this.alerts) {
      if (alert.incoming) {
        this.drawWarning(alert, seconds);
        const pulse = 0.5 + 0.5 * Math.sin(seconds * 4.5);
        alert.swords.y = -alert.radius * 1.3 - Math.abs(Math.sin(seconds * 2.25)) * 3 * u;
        alert.swords.scale.set(alert.swordsScale * (1 + 0.06 * pulse));
      }
      if (alert.attackedAt !== null) {
        // Fades out over RECENT_ATTACK_MS; the alert is rebuilt once the server view moves on.
        const fresh = Math.max(0, 1 - (clock - alert.attackedAt) / RECENT_ATTACK_MS);
        const strength = 0.35 + 0.65 * fresh;
        const p = (seconds / 1.6) % 1;
        alert.wave.scale.set(0.55 + 0.75 * p);
        alert.wave.alpha = (1 - p) * 0.9 * strength;
        // Two columns of billowing smoke rising from the towers, drifting with the wind; flames
        // lick at the walls while the assault is fresh.
        alert.smoke.forEach(({ sprite, size, spin }, i) => {
          const q = (seconds * 0.32 + i / alert.smoke.length) % 1;
          const side = i % 2 ? 1 : -1;
          sprite.position.set(
            side * alert.radius * 0.42 + Math.sin(q * 4 + i) * 3 * u + q * q * 16 * u,
            -alert.radius * 0.35 - q * 46 * u,
          );
          const grow = 0.55 + q * 1.1;
          sprite.scale.set((grow * size) / (this.art.smoke[0]!.width - this.art.smoke[0]!.pad * 2));
          sprite.rotation = q * spin * 3;
          const fade = q < 0.15 ? q / 0.15 : 1 - (q - 0.15) / 0.85;
          sprite.alpha = fade * 0.92 * strength;
        });
        alert.flames.forEach(({ sprite, size }, i) => {
          const flicker = 0.85 + 0.15 * Math.sin(seconds * 13 + i * 2.1);
          const base = size / (this.art.flame.width - this.art.flame.pad * 2);
          sprite.scale.set(base * (2 - flicker), base * flicker * 1.1);
          sprite.alpha = Math.max(0, fresh * 1.6 - 0.4);
        });
      }
    }
  }

  /**
   * The load beside the soldiers, the tent, the ship or the badge while gathering (`cargoPile`);
   * a small chest while the army brings one home.
   */
  private drawCargo(sprite: ArmySprite, army: ArmyView, u: number, mode: FigureMode): void {
    for (const child of sprite.cargo.removeChildren()) child.destroy({ children: true });
    if (army.chest) {
      const chest = artSprite(this.art.chest, 20 * u);
      chest.position.set(16 * u, -24 * u);
      sprite.cargo.addChild(chest);
    }
    if (!hasResources(army.cargo)) return;
    const tag = this.cargoPile(army.cargo, u);
    // In front of the figure at its upper right shoulder, like a badge: beside the soldiers, at
    // the tent's right slope, over the ship's stern, or beside a gather shield.
    if (mode === 'badge') tag.position.set(11 * u, -8 * u);
    else if (mode === 'tent') tag.position.set(15 * u, -15 * u);
    else if (mode === 'ship') tag.position.set(21 * u, -24 * u);
    else tag.position.set(17 * u, -22 * u);
    sprite.cargo.addChild(tag);
  }

  /**
   * What a convoy carries, as a roundel in the nameplate style (parchment disc, ink rim, a thin
   * inner ring) centred at (0, 0), holding one icon per resource it has: one centred, two side by
   * side, three in a triangle. No amounts: the selection panel lists them.
   */
  private cargoPile(cargo: Resources, u: number): Container {
    const r = (CARGO_SIZE / 2) * u;
    const carried = RESOURCES.filter((res) => cargo[res] > 0);
    const roundel = new Container();
    roundel.addChild(
      new Graphics()
        .circle(0, 0, r)
        .fill(PARCHMENT)
        .stroke({ width: 1.3 * u, color: INK })
        .circle(0, 0, r - 1.7 * u)
        .stroke({ width: 0.5 * u, color: INK, alpha: 0.45 }),
    );
    const layouts: Record<number, { size: number; at: [number, number][] }> = {
      1: { size: 1.25, at: [[0, 0]] },
      2: {
        size: 0.95,
        at: [
          [-0.4, 0.04],
          [0.4, -0.04],
        ],
      },
      3: {
        size: 0.78,
        at: [
          [0, -0.38],
          [-0.4, 0.3],
          [0.4, 0.3],
        ],
      },
    };
    const layout = layouts[carried.length];
    if (layout) {
      carried.forEach((res, i) => {
        const [x, y] = layout.at[i]!;
        const icon = artSprite(this.art.cargo[res], layout.size * r, true);
        icon.position.set(x * r, y * r);
        roundel.addChild(icon);
      });
    }
    return roundel;
  }

  /**
   * Where the focus ring goes this frame: the selected piece as it is drawn (so it follows
   * fanned-out, gathering, sailing and walking armies exactly), its radius and accent colour.
   */
  private focusTarget(
    selection: Selection,
    view: GameView,
  ): { x: number; y: number; radius: number; color: number } | null {
    const k = this.unit * this.pieceScale;
    const site = (at: Vec2 | null | undefined, radius: number, color: number) =>
      at ? { ...this.px(at), radius: radius * k, color } : null;
    switch (selection.kind) {
      case 'army': {
        const sprite = this.armies.get(selection.id);
        return sprite ? { ...this.armyFocus(sprite), color: sprite.color } : null;
      }
      case 'castle': {
        const castle = view.players.find((p) => p.id === selection.id)?.castle;
        return site(castle, 41, playerColor(view, selection.id));
      }
      case 'outpost': {
        const outpost = view.outposts.find((o) => o.id === selection.id);
        const color = outpost?.ownerId ? playerColor(view, outpost.ownerId) : NEUTRAL_COLOR;
        return site(outpost?.position, 28, color);
      }
      case 'spot': {
        const spot = view.spots.find((s) => s.id === selection.id);
        return site(spot?.position, 26, spot ? SPOT_COLORS[spot.resource] : INK);
      }
      case 'chest':
        return site(view.chests.find((c) => c.id === selection.id)?.position, 22, CARGO_GOLD);
      case 'caravan': {
        const wagon = this.caravans[Number(selection.id)];
        return wagon
          ? { ...this.caravanFocus(wagon), color: playerColor(view, view.self.id) }
          : null;
      }
    }
  }

  /**
   * Focus ring, redrawn every frame: on the ground a soft disc; on top of the map a parchment
   * band edged in ink with a thread and four orbiting studs in the accent colour, and four
   * arrowheads on the diagonals that breathe toward the piece. A new selection locks on: the ring
   * shrinks onto it from a little wider while fading in.
   */
  private drawFocus(seconds: number, now: number, tint: number): void {
    const ground = this.focusGround.clear();
    const top = this.focusTop.clear();
    const selection = useGameStore.getState().selection;
    const target = selection && this.view ? this.focusTarget(selection, this.view) : null;
    if (!selection || !target) {
      this.focus = null;
      return;
    }
    const key = `${selection.kind}:${selection.id}`;
    if (this.focus?.key !== key) {
      this.focus = { key, radius: target.radius, color: target.color, since: now };
    }
    const lock = 1 - Math.pow(1 - Math.min(1, (now - this.focus.since) / LOCK_MS), 3);
    const s = this.unit * this.pieceScale;
    const r = target.radius * (1 + 0.4 * (1 - lock));
    const { color } = target;
    for (const g of [ground, top]) {
      g.position.set(target.x, target.y);
      g.alpha = lock;
      g.tint = tint;
    }

    ground.circle(0, 0, r).fill({ color, alpha: 0.14 });
    top
      .circle(0, 0, r)
      .stroke({ width: 5.4 * s, color: INK, alpha: 0.85 })
      .circle(0, 0, r)
      .stroke({ width: 3.4 * s, color: PARCHMENT })
      .circle(0, 0, r)
      .stroke({ width: 1.1 * s, color });
    const spin = seconds * SELECTION_SPIN;
    for (let i = 0; i < 4; i++) {
      const a = spin + (i * Math.PI) / 2;
      const x = Math.cos(a) * r;
      const y = Math.sin(a) * r;
      const d = 3.6 * s;
      const along = { x: Math.cos(a) * d, y: Math.sin(a) * d };
      const across = { x: -Math.sin(a) * d * 0.7, y: Math.cos(a) * d * 0.7 };
      top
        .poly([
          x + along.x,
          y + along.y,
          x + across.x,
          y + across.y,
          x - along.x,
          y - along.y,
          x - across.x,
          y - across.y,
        ])
        .fill(color)
        .stroke({ width: 1.1 * s, color: INK, join: 'round' });
    }

    // Small targets (a gather badge) get smaller arrows.
    const a = s * Math.min(1, Math.max(0.6, target.radius / (28 * s)));
    const breathe = (0.5 + 0.5 * Math.sin(seconds * 4)) * 2.4 * a;
    for (let i = 0; i < 4; i++) {
      const angle = Math.PI / 4 + (i * Math.PI) / 2;
      const cos = Math.cos(angle);
      const sin = Math.sin(angle);
      const tip = r + 4 * a + breathe;
      const back = tip + 8 * a;
      const half = 5 * a;
      const points = [
        cos * tip,
        sin * tip,
        cos * back - sin * half,
        sin * back + cos * half,
        cos * (back - 2.4 * a),
        sin * (back - 2.4 * a),
        cos * back + sin * half,
        sin * back - cos * half,
      ];
      top
        .poly(points)
        .stroke({ width: 4.2 * a, color: PARCHMENT, join: 'round' })
        .poly(points)
        .fill(color)
        .stroke({ width: 1.3 * a, color: INK, join: 'round' });
    }
  }

  /** Foam rings spreading and fading behind ships. */
  private drawWakes(seconds: number, tint: number): void {
    const s = this.unit;
    this.wakeRings = this.wakeRings.filter((w) => seconds - w.born < WAKE_LIFE_S);
    const g = this.wakes.clear();
    g.tint = tint;
    for (const w of this.wakeRings) {
      const age = (seconds - w.born) / WAKE_LIFE_S;
      if (age < 0) continue;
      const r = (3 + 13 * age) * s * w.scale;
      g.ellipse(w.x, w.y, r, r * 0.38).stroke({
        width: 1.3 * s * w.scale,
        color: FOAM,
        alpha: 0.85 * (1 - age),
      });
    }
  }

  private label(
    text: string,
    fontSize: number,
    fill: number,
    italic = false,
    fontFamily = SERIF,
  ): Text {
    const label = new Text({
      text,
      style: {
        fontFamily,
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
    const now = performance.now();
    const seconds = now / 1000;
    const u = this.unit;
    const k = this.pieceScale;
    const clock = this.clock;
    for (const sprite of this.armies.values()) {
      const { container, figure, stride, motion, offset } = sprite;
      // Walk on along the known route by the game clock; the server corrects once a second.
      const target = motion
        ? pointAlong(motion.route, (clock - motion.from) / (motion.to - motion.from))
        : sprite.target;
      container.x += (target.x - container.x) * t;
      container.y += (target.y - container.y) * t;
      if (motion) {
        // Bow toward where the route goes, not where the easing nudges: a server correction that
        // pulls the army back a little must not turn the ship around. Near-vertical legs keep it.
        const p = (clock - motion.from) / (motion.to - motion.from);
        const a = pointAlong(motion.route, p);
        const b = pointAlong(motion.route, Math.min(1, p + 0.02));
        if (Math.abs(b.x - a.x) > 0.25 * Math.abs(b.y - a.y)) sprite.heading = Math.sign(b.x - a.x);
      }
      // Fanned-out stacks and gather ring slots slide into place instead of jumping.
      container.pivot.x += (-offset.x - container.pivot.x) * t;
      container.pivot.y += (-offset.y - container.pivot.y) * t;
      container.scale.set(k);
      // Badges on top, the rest back to front.
      container.zIndex = container.y + (sprite.mode === 'badge' ? 1e7 : 0);
      // A Seeweg army boards at the coast and lands on the far side, with a splash.
      if (sprite.army.sea && sprite.army.status !== 'gathering') {
        const ground = {
          x: container.x - container.pivot.x * k,
          y: container.y - container.pivot.y * k,
        };
        const wet = this.isWater(ground);
        if (wet === sprite.afloat) sprite.shoreAt = 0;
        else if (sprite.shoreAt === 0) sprite.shoreAt = seconds;
        else if (seconds - sprite.shoreAt > SHORE_S) {
          sprite.afloat = wet;
          sprite.shoreAt = 0;
          for (const [delay, size] of [
            [0, 1.3],
            [0.25, 1.7],
          ] as const) {
            this.wakeRings.push({ ...ground, born: seconds + delay, scale: k * size });
          }
          this.drawFigure(sprite);
        }
      }
      if (sprite.mode === 'ship') {
        // Rolls on the swell, sails bow first and leaves foam behind.
        figure.y = Math.sin(seconds * 2.1 + stride) * 1.3 * u;
        figure.rotation = Math.sin(seconds * 1.4 + stride) * 0.06;
        figure.scale.x = sprite.heading > 0 ? -1 : 1;
        if (motion && seconds - sprite.wakeAt > WAKE_EVERY_S) {
          sprite.wakeAt = seconds;
          const { x, y } = this.armyFocus(sprite);
          this.wakeRings.push({
            x: x - sprite.heading * 18 * u * k,
            y: y + 15 * u * k,
            born: seconds,
            scale: k,
          });
        }
      } else {
        figure.rotation = 0;
        figure.y =
          sprite.mode === 'soldiers' ? -Math.abs(Math.sin(seconds * 7 + stride)) * 1.8 * u : 0;
      }
    }
    this.animateCaravan(seconds, k);
    for (const layer of [this.siteLayer, this.spotLayer, this.labelLayer]) {
      for (const piece of layer.children) piece.scale.set(k);
    }
    for (const alert of this.alerts) {
      alert.under.scale.set(k);
      alert.over.scale.set(k);
    }
    // Night: moonlit pieces and labels, flickering campfires.
    const tint = this.night.update(ticker.deltaMS, seconds, k);
    this.siteLayer.tint = tint;
    this.spotLayer.tint = tint;
    this.labelLayer.tint = tint;
    for (const { fire } of this.armies.values()) {
      if (!fire) continue;
      const flicker =
        0.85 + 0.15 * Math.sin(seconds * 13 + fire.scale * 7) * Math.sin(seconds * 7.3);
      fire.flame.scale.set(fire.scale * (2 - flicker), fire.scale * flicker * 1.1);
      fire.light.alpha = 0.35 + 0.4 * flicker;
    }
    for (const { sprite, phase, size, speed, spin } of this.sparkles) {
      const twinkle = Math.max(0, Math.sin(seconds * speed + phase));
      sprite.alpha = twinkle;
      sprite.scale.set(((0.4 + 0.6 * twinkle) * size) / this.art.sparkle.width);
      if (spin) sprite.rotation = seconds * 0.8 + phase;
    }
    for (const { sprite, phase } of this.shines) {
      // Brighter in the dark, where the gold catches the moon.
      sprite.alpha = (0.22 + 0.14 * Math.sin(seconds * 1.6 + phase)) * (1 + this.night.amount);
    }
    // Eases with the dusk/dawn fade instead of jumping.
    const flow = ROUTE_FLOW * (1 - (1 - ROUTE_FLOW_NIGHT) * this.night.amount);
    this.routePhase += (flow * u * ticker.deltaMS) / 1000;
    this.drawRoutes();
    this.drawWakes(seconds, tint);
    this.animateAlerts(seconds);
    this.drawFocus(seconds, now, tint);
  };
}
