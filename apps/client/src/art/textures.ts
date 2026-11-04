import { RESOURCES, type ResourceType } from '@vectoria/shared';
import { CanvasSource, Texture } from 'pixi.js';
import { INK, NEUTRAL_COLOR, PARCHMENT, PLAYER_PALETTE, SELF_COLOR, sepia } from '../game/palette';
import {
  alarm,
  armyShip,
  boat,
  boulder,
  broadleaf,
  campfire,
  castle,
  chest,
  conifer,
  dataUrl,
  deposit,
  flame,
  FOLIAGE,
  gatherShield,
  grassTuft,
  outpost,
  resourceIcon,
  rocks,
  ruin,
  ship,
  smokePuff,
  soldiers,
  sparkle,
  tent,
  type Art,
} from './svg';

/** Art pixels are rasterised at this multiple so sprites stay sharp when zoomed in. */
const RASTER_SCALE = 3;
/** Width of the parchment cut-out edge around outlined art, in art pixels. */
const OUTLINE = 2.6;

export interface ArtTexture {
  texture: Texture;
  /** Size and ground anchor in art pixels (before RASTER_SCALE), including `pad`. */
  width: number;
  height: number;
  anchor: { x: number; y: number };
  /** Y of the art's visual centre (art px, including `pad`). */
  centreY: number;
  /** Margin added on every side for the outline; the drawing itself is `width - 2 * pad` wide. */
  pad: number;
}

export interface RasterOptions {
  /** Tone onto the sepia ramp of the map backdrop (decoration). */
  sepia?: boolean;
  /** Parchment cut-out edge with a faint ink rim, lifting the art off the map (interactables). */
  outline?: boolean;
}

/** Coloured pieces, rasterised on first use per colour (and castle style). */
export interface PieceCache {
  castle(color: number, style: number): ArtTexture | null;
  outpost(color: number): ArtTexture | null;
  soldiers(color: number): ArtTexture | null;
  /** Night camp of an army. */
  tent(color: number): ArtTexture | null;
  /** An army at sea (Seeweg card). */
  ship(color: number): ArtTexture | null;
  /** Badge of troops loading at a deposit. */
  shield(color: number): ArtTexture | null;
  /** Called (once per batch) when textures asked for earlier have become ready. */
  onReady: (() => void) | null;
}

export interface MapArt {
  broadleaves: ArtTexture[];
  autumn: ArtTexture[];
  conifers: ArtTexture[];
  rocks: ArtTexture[];
  /** Small loose stones for the rim of rock areas and the meadows around them. */
  boulders: ArtTexture[];
  tuft: ArtTexture;
  ship: ArtTexture;
  /** Small boat for lakes and straits. */
  boat: ArtTexture;
  deposits: Record<ResourceType, ArtTexture>;
  /** Bare resource icons, for cargo carried by armies. */
  resources: Record<ResourceType, ArtTexture>;
  chest: ArtTexture;
  /** Glint that twinkles around chests. */
  sparkle: ArtTexture;
  /** Crossed-swords badge over a site under attack. */
  alarm: ArtTexture;
  /** Smoke puffs and a flame over a site that was attacked. */
  smoke: ArtTexture[];
  flame: ArtTexture;
  /** Unowned outpost. */
  ruin: ArtTexture;
  /** Stones and logs of a night campfire (the flame is `flame`). */
  campfire: ArtTexture;
  /** Soft round light, white in the middle and fading out; tinted and added at night. */
  glow: Texture;
  pieces: PieceCache;
}

const css = (color: number) => `#${color.toString(16).padStart(6, '0')}`;

/** Fills the art's silhouette, grown by `radius` art px, into `ctx` (whose size it matches). */
function silhouette(
  ctx: CanvasRenderingContext2D,
  image: HTMLImageElement,
  pad: number,
  radius: number,
  color: string,
  alpha: number,
  scale: number,
): void {
  const layer = document.createElement('canvas');
  layer.width = ctx.canvas.width;
  layer.height = ctx.canvas.height;
  const l = layer.getContext('2d')!;
  const w = (ctx.canvas.width / scale - pad * 2) * scale;
  const h = (ctx.canvas.height / scale - pad * 2) * scale;
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * Math.PI * 2;
    const x = (pad + Math.cos(a) * radius) * scale;
    const y = (pad + Math.sin(a) * radius) * scale;
    l.drawImage(image, x, y, w, h);
  }
  l.globalCompositeOperation = 'source-in';
  l.fillStyle = color;
  l.fillRect(0, 0, layer.width, layer.height);
  ctx.globalAlpha = alpha;
  ctx.drawImage(layer, 0, 0);
  ctx.globalAlpha = 1;
}

/** Paints `art` into a canvas the way the map shows it (outline, sepia); `pad` is the margin. */
export async function artCanvas(
  art: Art,
  options: RasterOptions = {},
  scale = RASTER_SCALE,
): Promise<{ canvas: HTMLCanvasElement; pad: number }> {
  const image = new Image();
  image.src = dataUrl(art.svg);
  await image.decode();
  const pad = options.outline ? Math.ceil(OUTLINE + 1.5) : 0;
  const canvas = document.createElement('canvas');
  canvas.width = (art.width + pad * 2) * scale;
  canvas.height = (art.height + pad * 2) * scale;
  const ctx = canvas.getContext('2d')!;
  if (options.outline) {
    silhouette(ctx, image, pad, OUTLINE + 1.2, css(INK), 0.55, scale);
    silhouette(ctx, image, pad, OUTLINE, css(PARCHMENT), 1, scale);
  }
  ctx.drawImage(image, pad * scale, pad * scale, art.width * scale, art.height * scale);
  if (options.sepia) {
    const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const d = pixels.data;
    for (let i = 0; i < d.length; i += 4) {
      [d[i], d[i + 1], d[i + 2]] = sepia(d[i]!, d[i + 1]!, d[i + 2]!);
    }
    ctx.putImageData(pixels, 0, 0);
  }
  return { canvas, pad };
}

async function rasterise(art: Art, options: RasterOptions = {}): Promise<ArtTexture> {
  const { canvas, pad } = await artCanvas(art, options);
  const source = new CanvasSource({
    resource: canvas,
    resolution: RASTER_SCALE,
    autoGenerateMipmaps: true,
  });
  return {
    texture: new Texture({ source }),
    width: art.width + pad * 2,
    height: art.height + pad * 2,
    anchor: { x: art.anchor.x + pad, y: art.anchor.y + pad },
    centreY: (art.centreY ?? art.anchor.y) + pad,
    pad,
  };
}

/** Lazily rasterised outlined pieces keyed by kind + colour (+ style). */
function pieceCache(): PieceCache {
  const ready = new Map<string, ArtTexture>();
  const pending = new Set<string>();
  let notify = false;
  const cache: PieceCache = {
    onReady: null,
    castle: (color, style) => get(`castle:${style}:${color}`, () => castle(css(color), style)),
    outpost: (color) => get(`outpost:${color}`, () => outpost(css(color))),
    soldiers: (color) => get(`soldiers:${color}`, () => soldiers(css(color))),
    tent: (color) => get(`tent:${color}`, () => tent(css(color))),
    ship: (color) => get(`ship:${color}`, () => armyShip(css(color))),
    shield: (color) => get(`shield:${color}`, () => gatherShield(css(color))),
  };
  function get(key: string, make: () => Art): ArtTexture | null {
    const hit = ready.get(key);
    if (hit) return hit;
    if (!pending.has(key)) {
      pending.add(key);
      void rasterise(make(), { outline: true }).then((texture) => {
        ready.set(key, texture);
        pending.delete(key);
        // One callback per batch of textures finishing in the same task.
        if (!notify) {
          notify = true;
          queueMicrotask(() => {
            notify = false;
            cache.onReady?.();
          });
        }
      });
    }
    return null;
  }
  return cache;
}

/** Waits until the given pieces are ready (used to preload the common colours). */
async function preload(pieces: PieceCache): Promise<void> {
  const colours = [SELF_COLOR, ...PLAYER_PALETTE, NEUTRAL_COLOR];
  const asks = () =>
    colours.flatMap((c) => [
      pieces.castle(c, 0),
      pieces.castle(c, 1),
      pieces.castle(c, 2),
      pieces.outpost(c),
      pieces.soldiers(c),
      pieces.tent(c),
      pieces.ship(c),
      pieces.shield(c),
    ]);
  asks();
  await new Promise<void>((resolve) => {
    const check = () => (asks().every(Boolean) ? resolve() : undefined);
    pieces.onReady = check;
    check();
  });
  pieces.onReady = null;
}

/** A 128 px radial light: opaque white centre, smooth falloff to transparent at the rim. */
function glowTexture(): Texture {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  gradient.addColorStop(0, 'rgba(255,255,255,1)');
  gradient.addColorStop(0.35, 'rgba(255,255,255,0.55)');
  gradient.addColorStop(0.7, 'rgba(255,255,255,0.15)');
  gradient.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);
  return new Texture({ source: new CanvasSource({ resource: canvas }) });
}

let loading: Promise<MapArt> | null = null;

/** Rasterises all map art once; later calls share the result. */
export function loadMapArt(): Promise<MapArt> {
  loading ??= (async () => {
    const all = (items: Art[], options?: RasterOptions) =>
      Promise.all(items.map((art) => rasterise(art, options)));
    const decor = { sepia: true };
    const pieces = pieceCache();
    const [
      broadleaves,
      autumn,
      conifers,
      rockArt,
      boulderArt,
      deposits,
      icons,
      smoke,
      [tuft, shipArt, boatArt, chestArt, sparkleArt, alarmArt, flameArt, ruinArt, campfireArt],
    ] = await Promise.all([
      all(
        FOLIAGE.slice(0, 3).map((f, i) => broadleaf(f, i * 0.7)),
        decor,
      ),
      all(
        FOLIAGE.slice(3).map((f, i) => broadleaf(f, i * 1.3 + 0.4)),
        decor,
      ),
      all([conifer(false), conifer(true)], decor),
      all([0, 1, 2, 3].map(rocks), decor),
      all([0, 1, 2].map(boulder), decor),
      all(RESOURCES.map(deposit), { outline: true }),
      all(
        RESOURCES.map((r) => ({
          svg: resourceIcon(r),
          width: 64,
          height: 64,
          anchor: { x: 32, y: 32 },
        })),
      ),
      all([0, 1.3, 2.6].map(smokePuff)),
      Promise.all([
        rasterise(grassTuft(), decor),
        rasterise(ship(), decor),
        rasterise(boat(), decor),
        rasterise(chest(), { outline: true }),
        rasterise(sparkle()),
        rasterise(alarm(), { outline: true }),
        rasterise(flame()),
        rasterise(ruin(), { outline: true }),
        rasterise(campfire(), { outline: true }),
      ]),
      preload(pieces),
    ]);
    const byResource = (list: ArtTexture[]) =>
      Object.fromEntries(RESOURCES.map((r, i) => [r, list[i]!])) as Record<
        ResourceType,
        ArtTexture
      >;
    return {
      broadleaves,
      autumn,
      conifers,
      rocks: rockArt,
      boulders: boulderArt,
      tuft,
      ship: shipArt,
      boat: boatArt,
      chest: chestArt,
      sparkle: sparkleArt,
      alarm: alarmArt,
      smoke,
      flame: flameArt,
      ruin: ruinArt,
      campfire: campfireArt,
      glow: glowTexture(),
      deposits: byResource(deposits),
      resources: byResource(icons),
      pieces,
    };
  })();
  return loading;
}
