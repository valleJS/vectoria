import {
  hasResources,
  HOUR_MS,
  pointAlong,
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
import { COMPACT_BELOW, HUD_INSETS } from '../ui/layout';
import { Camera } from './Camera';
import { formatResources, outpostLabel, playerColor, playerHeraldry } from './format';
import { dashedCircle, dashedPolyline } from './glyphs';
import {
  CARGO_GOLD,
  FORTIFY_BLUE,
  INK,
  NEUTRAL_COLOR,
  PARCHMENT,
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
/** Selection ring rotation, radians per second. */
const SELECTION_SPIN = 0.6;
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
 * A gathering army plants its claim flag at the deposit's right front (glyph units from the spot
 * centre); further gatherers at the same spot stand a step to the right.
 */
const GATHER_FLAG_X = 15;
const GATHER_FLAG_Y = 10;
const GATHER_FLAG_STEP = 10;
/** Armies closer than this (tiles) are fanned out side by side so each stays readable. */
const STACK_RADIUS_TILES = 0.7;
/** Horizontal spacing (glyph units) of fanned-out armies. */
const STACK_STEP = 27;
/** Selection ring: ink by day, pale moonlight at night. */
const RING_DAY = INK;
const RING_NIGHT = 0xf3e6c4;
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

interface ArmySprite {
  container: Container;
  /** Holds the soldiers, or the claim flag while gathering. */
  figure: Container;
  /** Troop count nameplate, rebuilt when `text` changes. */
  plate: Container;
  text: string;
  /**
   * Gold halo + tag with resource icon and amount while the army carries resources; a small chest
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
  /** Marching (not loading at a spot): the soldiers bob as they walk. */
  marching: boolean;
  /** Offsets the walking bob so armies don't step in unison. */
  stride: number;
  /** Display offset (world px at piece scale 1) the container eases toward: fan-out or flag slot. */
  offset: PointData;
  /** At night: the campfire's flame and light, flickered in `animate`. */
  fire: { flame: Sprite; light: Sprite; scale: number } | null;
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
    this.world.addChild(
      this.terrain,
      this.night.darkness,
      this.night.stars,
      this.routes,
      this.routeMarks,
      this.alertUnderLayer,
      this.night.glowUnder,
      this.siteLayer,
      this.night.glowOver,
      this.alertLayer,
      this.selectionRing,
      this.armyLayer,
      this.night.fireflies,
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
   * Where an army is clicked: where it is drawn (fanned out of a stack), and its flag for a
   * gathering army (the deposit itself selects the spot).
   */
  private armyPickPosition(army: ArmyView): Vec2 {
    const sprite = this.armies.get(army.id);
    if (!sprite || !this.map) return army.position;
    const { container } = sprite;
    const size = this.map.tileSize;
    const lift = army.status === 'gathering' ? -14 * this.unit : -10 * this.unit;
    return {
      x: army.position.x - (container.pivot.x * container.scale.x) / size,
      y: army.position.y + ((lift - container.pivot.y) * container.scale.y) / size,
    };
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
      piece.addChild(artSprite(this.art.deposits[spot.resource], 44 * u, true));
      this.siteLayer.addChild(piece);
    }

    for (const chest of view.chests) {
      const piece = new Container();
      piece.position.copyFrom(this.px(chest.position));
      piece.addChild(artSprite(this.art.chest, 34 * u));
      piece.addChild(
        this.nameplate(`ab ${chest.troopsNeeded} Truppen`, null, u, { top: 16 * u, size: 10 * u }),
      );
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
      // Unowned outposts are ruins until someone takes them; owned ones a watchtower.
      const art = outpost.ownerId ? this.art.pieces.outpost(color) : this.art.ruin;
      if (art) site.addChild(artSprite(art, 40 * u, true));
      const plate = this.nameplate(`${outpostLabel(view, outpost)} · ${outpost.troops}`, color, u, {
        top: 17 * u,
      });
      site.addChild(plate);
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
      const { color, style } = playerHeraldry(view, player.id);
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
      castle.addChild(rings);
      // Centre the castle body, not its ground line, on the castle tile.
      const art = this.art.pieces.castle(color, style);
      if (art) castle.addChild(artSprite(art, 58 * u, true));
      castle.addChild(this.nameplate(`${player.name} · ${player.homeTroops}`, color, u));
      if (!player.online) castle.alpha = 0.85;
      this.siteLayer.addChild(castle);
    }

    // Lamp light for the night: castles and held outposts glow, chests shimmer.
    const lights: NightLight[] = [
      ...view.players.flatMap((p) =>
        p.castle ? [{ ...this.px(p.castle), radius: 30 * u, kind: 'castle' as const }] : [],
      ),
      ...view.outposts
        .filter((o) => o.ownerId)
        .map((o) => ({ ...this.px(o.position), radius: 20 * u, kind: 'outpost' as const })),
      ...view.chests.map((c) => ({
        ...this.px(c.position),
        radius: 14 * u,
        kind: 'chest' as const,
      })),
    ];
    this.night.setLights(lights);
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
    const offsets = this.armyOffsets(view.armies, u);

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
        const offset = offsets.get(army.id) ?? { x: 0, y: 0 };
        container.pivot.set(-offset.x, -offset.y);
        this.armyLayer.addChild(container);
        sprite = {
          container,
          figure,
          plate,
          text: '',
          cargo,
          target,
          motion: null,
          look: '',
          cargoKey: '',
          marching: false,
          stride: Math.random() * Math.PI * 2,
          offset,
          fire: null,
        };
        this.armies.set(army.id, sprite);
      }
      sprite.target = target;
      // At night marching armies pitch camp: a tent with a campfire instead of soldiers.
      const camp = this.night.night && !gathering;
      sprite.marching = !gathering && !camp;
      sprite.offset = offsets.get(army.id) ?? { x: 0, y: 0 };
      sprite.motion =
        !gathering && army.route && army.route.length > 1 && army.arriveClock > view.clock.clock
          ? {
              route: army.route.map((p) => this.px(p)),
              from: view.clock.clock,
              to: army.arriveClock,
            }
          : null;
      const look = `${color}:${gathering}:${camp}:${this.night.night}`;
      if (look !== sprite.look) {
        // At a deposit the resource stays in view: the army is shown as its planted claim flag.
        const art = camp
          ? this.art.pieces.tent(color)
          : gathering
            ? this.art.pieces.flag(color)
            : this.art.pieces.soldiers(color);
        sprite.look = art ? look : '';
        for (const child of sprite.figure.removeChildren()) child.destroy({ children: true });
        sprite.fire = null;
        if (art && camp) {
          sprite.fire = this.campfire(sprite.figure, u, { x: 12 * u, y: 2 * u }, 0.9);
          sprite.figure.addChildAt(artSprite(art, 28 * u), 1);
        } else if (art) {
          // A lantern-like glow keeps gatherers visible at night, too.
          if (this.night.night)
            sprite.fire = this.campfire(sprite.figure, u, { x: 7 * u, y: 1 * u }, 0.6);
          sprite.figure.addChild(artSprite(art, gathering ? 17 * u : 38 * u));
        }
        // The plate's position depends on the look.
        sprite.text = '';
      }
      sprite.container.alpha = faded ? 0.75 : 1;
      const cargoKey = JSON.stringify([army.cargo, army.chest, gathering]);
      if (cargoKey !== sprite.cargoKey) {
        sprite.cargoKey = cargoKey;
        this.drawCargo(sprite, army, u);
      }
      const troops = army.troops === null ? '?' : String(army.troops);
      const text = `${gathering}:${troops}`;
      if (text !== sprite.text) {
        sprite.text = text;
        for (const child of sprite.plate.removeChildren()) child.destroy({ children: true });
        const plate = gathering
          ? this.nameplate(troops, color, u, { top: -33 * u, size: 9 * u })
          : this.nameplate(troops, color, u, { top: 2 * u, size: 11 * u });
        if (gathering) plate.x = 1.5 * u;
        sprite.plate.addChild(plate);
      }
    }

    for (const [id, sprite] of this.armies) {
      if (seen.has(id)) continue;
      sprite.container.destroy({ children: true });
      this.armies.delete(id);
    }
  }

  /**
   * Display offsets (world px at piece scale 1) so stacked armies stay apart: gathering armies
   * plant their flags in a row at the deposit's right front; other armies standing within
   * STACK_RADIUS_TILES of each other fan out side by side (two rows past four), ordered by id so
   * nobody swaps places between updates.
   */
  private armyOffsets(armies: readonly ArmyView[], u: number): Map<string, PointData> {
    const offsets = new Map<string, PointData>();
    const flagSlots = new Map<string, number>();
    const loose: ArmyView[] = [];
    for (const army of [...armies].sort((a, b) => (a.id < b.id ? -1 : 1))) {
      if (army.status === 'gathering' && army.target) {
        const slot = flagSlots.get(army.target.id) ?? 0;
        flagSlots.set(army.target.id, slot + 1);
        offsets.set(army.id, {
          x: (GATHER_FLAG_X + slot * GATHER_FLAG_STEP) * u,
          y: (GATHER_FLAG_Y - (slot % 2) * 3) * u,
        });
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
      ring.visible = site.incoming;
      swords.visible = site.incoming;
      wave.visible = burnt;
      under.addChild(ring, wave);
      over.addChild(...flames.map((f) => f.sprite), ...smoke.map((p) => p.sprite), swords);
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
        flames,
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
   * A parchment tag with the main resource's icon and the total load (beside the soldiers, or
   * the claim flag while gathering); a small chest while the army brings one home.
   */
  private drawCargo(sprite: ArmySprite, army: ArmyView, u: number): void {
    for (const child of sprite.cargo.removeChildren()) child.destroy({ children: true });
    const gathering = army.status === 'gathering';
    if (army.chest) {
      const chest = artSprite(this.art.chest, 20 * u);
      chest.position.set(16 * u, -24 * u);
      sprite.cargo.addChild(chest);
    }
    if (!hasResources(army.cargo)) return;
    const main = RESOURCES.reduce((a, b) => (army.cargo[b] > army.cargo[a] ? b : a));
    const total = RESOURCES.reduce((sum, r) => sum + army.cargo[r], 0);
    const amount = this.label(`+${total}`, 10 * u, INK, true);
    const icon = artSprite(this.art.resources[main], 15 * u);
    const w = amount.width + 22 * u;
    const h = 14 * u;
    const tag = new Container();
    if (gathering) tag.position.set(13 * u, -9 * u);
    else tag.position.set(15 * u, -26 * u);
    const plate = new Graphics()
      .roundRect(0, -h / 2, w, h, h / 2)
      .fill(PARCHMENT)
      .stroke({ width: 0.8 * u, color: INK });
    icon.position.set(8 * u, 0);
    amount.anchor.set(0, 0.5);
    amount.position.set(16 * u, 0);
    tag.addChild(plate, icon, amount);
    sprite.cargo.addChild(tag);
  }

  private drawSelection(selection: Selection | null): void {
    this.selectionRing.clear();
    if (!selection || !this.view || !this.map) return;
    const position = this.selectionPosition(selection, this.view);
    if (!position) return;
    this.selectionRing.position.copyFrom(this.px(position));
    const radius = selection.kind === 'castle' ? 38 : selection.kind === 'outpost' ? 30 : 22;
    const scaled = radius * this.unit;
    // Drawn white and tinted in `animate`: ink by day, moonlight at night.
    dashedCircle(this.selectionRing, scaled, 14).stroke({
      width: 2.5 * this.unit,
      color: 0xffffff,
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
    const clock = this.clock;
    for (const sprite of this.armies.values()) {
      const { container, figure, marching, stride, motion, offset } = sprite;
      // Walk on along the known route by the game clock; the server corrects once a second.
      const target = motion
        ? pointAlong(motion.route, (clock - motion.from) / (motion.to - motion.from))
        : sprite.target;
      container.x += (target.x - container.x) * t;
      container.y += (target.y - container.y) * t;
      // Fanned-out stacks and flag slots slide into place instead of jumping.
      container.pivot.x += (-offset.x - container.pivot.x) * t;
      container.pivot.y += (-offset.y - container.pivot.y) * t;
      container.scale.set(k);
      figure.y = marching ? -Math.abs(Math.sin(seconds * 7 + stride)) * 1.8 * u : 0;
    }
    for (const piece of this.siteLayer.children) piece.scale.set(k);
    for (const alert of this.alerts) {
      alert.under.scale.set(k);
      alert.over.scale.set(k);
    }
    this.selectionRing.scale.set(k);
    // Night: moonlit pieces, flickering campfires, ring in moonlight.
    this.siteLayer.tint = this.night.update(ticker.deltaMS, seconds, k);
    this.selectionRing.tint = mix(RING_DAY, RING_NIGHT, this.night.amount);
    for (const { fire } of this.armies.values()) {
      if (!fire) continue;
      const flicker =
        0.85 + 0.15 * Math.sin(seconds * 13 + fire.scale * 7) * Math.sin(seconds * 7.3);
      fire.flame.scale.set(fire.scale * (2 - flicker), fire.scale * flicker * 1.1);
      fire.light.alpha = 0.35 + 0.4 * flicker;
    }
    for (const { sprite, phase, size } of this.sparkles) {
      const twinkle = Math.max(0, Math.sin(seconds * 2.2 + phase));
      sprite.alpha = twinkle;
      sprite.scale.set(((0.4 + 0.6 * twinkle) * size) / this.art.sparkle.width);
      sprite.rotation = seconds * 0.8 + phase;
    }
    // Eases with the dusk/dawn fade instead of jumping.
    const flow = ROUTE_FLOW * (1 - (1 - ROUTE_FLOW_NIGHT) * this.night.amount);
    this.routePhase += (flow * u * ticker.deltaMS) / 1000;
    this.drawRoutes();
    this.animateAlerts(seconds);
    this.selectionRing.rotation += (SELECTION_SPIN * ticker.deltaMS) / 1000;
    // A selected army moves; keep the ring on it.
    const selection = useGameStore.getState().selection;
    if (selection?.kind === 'army') {
      const sprite = this.armies.get(selection.id);
      if (sprite) {
        const { position, pivot, scale } = sprite.container;
        this.selectionRing.position.set(
          position.x - pivot.x * scale.x,
          position.y - (pivot.y + 10 * u) * scale.y,
        );
      }
    }
  };
}

/** Blends two 0xrrggbb colours, `t` = 0 → a, 1 → b. */
function mix(a: number, b: number, t: number): number {
  const ch = (shift: number) => {
    const x = (a >> shift) & 255;
    const y = (b >> shift) & 255;
    return Math.round(x + (y - x) * t) << shift;
  };
  return ch(16) | ch(8) | ch(0);
}
