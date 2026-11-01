import { RESOURCES, type ResourceType } from '@vectoria/shared';
import { CanvasSource, Texture } from 'pixi.js';
import { INK, NEUTRAL_COLOR, PARCHMENT, PLAYER_PALETTE, SELF_COLOR, sepia } from '../game/palette';
import {
  alarm,
  broadleaf,
  castle,
  chest,
  conifer,
  dataUrl,
  flowers,
  FOLIAGE,
  grassTuft,
  mountain,
  resourceIcon,
  ship,
  soldiers,
  sparkle,
  spotMedallion,
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
  /** Margin added on every side for the outline; the drawing itself is `width - 2 * pad` wide. */
  pad: number;
}

interface RasterOptions {
  /** Tone onto the sepia ramp of the map backdrop (decoration). */
  sepia?: boolean;
  /** Parchment cut-out edge with a faint ink rim, lifting the art off the map (interactables). */
  outline?: boolean;
}

export interface MapArt {
  broadleaves: ArtTexture[];
  autumn: ArtTexture[];
  conifers: ArtTexture[];
  mountains: ArtTexture[];
  snowyMountains: ArtTexture[];
  tuft: ArtTexture;
  flowers: ArtTexture[];
  ship: ArtTexture;
  spots: Record<ResourceType, ArtTexture>;
  /** Bare resource icons, for cargo carried by armies. */
  resources: Record<ResourceType, ArtTexture>;
  chest: ArtTexture;
  /** Glint that twinkles around chests. */
  sparkle: ArtTexture;
  /** Crossed-swords badge over a site under attack. */
  alarm: ArtTexture;
  /** Castles keyed by owner colour (0xrrggbb): self colour, palette, and neutral grey. */
  castles: Map<number, ArtTexture>;
  /** Army soldier groups keyed like `castles`. */
  soldiers: Map<number, ArtTexture>;
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
): void {
  const layer = document.createElement('canvas');
  layer.width = ctx.canvas.width;
  layer.height = ctx.canvas.height;
  const l = layer.getContext('2d')!;
  const w = (ctx.canvas.width / RASTER_SCALE - pad * 2) * RASTER_SCALE;
  const h = (ctx.canvas.height / RASTER_SCALE - pad * 2) * RASTER_SCALE;
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * Math.PI * 2;
    const x = (pad + Math.cos(a) * radius) * RASTER_SCALE;
    const y = (pad + Math.sin(a) * radius) * RASTER_SCALE;
    l.drawImage(image, x, y, w, h);
  }
  l.globalCompositeOperation = 'source-in';
  l.fillStyle = color;
  l.fillRect(0, 0, layer.width, layer.height);
  ctx.globalAlpha = alpha;
  ctx.drawImage(layer, 0, 0);
  ctx.globalAlpha = 1;
}

async function rasterise(art: Art, options: RasterOptions = {}): Promise<ArtTexture> {
  const image = new Image();
  image.src = dataUrl(art.svg);
  await image.decode();
  const pad = options.outline ? Math.ceil(OUTLINE + 1.5) : 0;
  const canvas = document.createElement('canvas');
  canvas.width = (art.width + pad * 2) * RASTER_SCALE;
  canvas.height = (art.height + pad * 2) * RASTER_SCALE;
  const ctx = canvas.getContext('2d')!;
  if (options.outline) {
    silhouette(ctx, image, pad, OUTLINE + 1.2, css(INK), 0.55);
    silhouette(ctx, image, pad, OUTLINE, css(PARCHMENT), 1);
  }
  ctx.drawImage(
    image,
    pad * RASTER_SCALE,
    pad * RASTER_SCALE,
    art.width * RASTER_SCALE,
    art.height * RASTER_SCALE,
  );
  if (options.sepia) {
    const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const d = pixels.data;
    for (let i = 0; i < d.length; i += 4) {
      [d[i], d[i + 1], d[i + 2]] = sepia(d[i]!, d[i + 1]!, d[i + 2]!);
    }
    ctx.putImageData(pixels, 0, 0);
  }
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
    pad,
  };
}

/** One outlined texture per heraldic colour (self colour, palette, neutral). */
async function byColour(make: (color: string) => Art): Promise<Map<number, ArtTexture>> {
  const colours = [SELF_COLOR, ...PLAYER_PALETTE, NEUTRAL_COLOR];
  const textures = await Promise.all(
    colours.map((c) => rasterise(make(css(c)), { outline: true })),
  );
  return new Map(colours.map((c, i) => [c, textures[i]!]));
}

let loading: Promise<MapArt> | null = null;

/** Rasterises all map art once; later calls share the result. */
export function loadMapArt(): Promise<MapArt> {
  loading ??= (async () => {
    const all = <T>(items: Art[], options?: RasterOptions) =>
      Promise.all(items.map((art) => rasterise(art, options))) as Promise<T>;
    const decor = { sepia: true };
    const [broadleaves, autumn, conifers, mountains, snowyMountains, flowerArt, spots, icons] =
      await Promise.all([
        all<ArtTexture[]>(FOLIAGE.slice(0, 3).map(broadleaf), decor),
        all<ArtTexture[]>(FOLIAGE.slice(3).map(broadleaf), decor),
        all<ArtTexture[]>([conifer(false), conifer(true)], decor),
        all<ArtTexture[]>(
          [0, 1, 2, 3].map((v) => mountain(v, false)),
          decor,
        ),
        all<ArtTexture[]>(
          [0, 1, 2].map((v) => mountain(v, true)),
          decor,
        ),
        all<ArtTexture[]>(['#fbf6e6', '#ecd98a', '#c9aedb', '#a9c8e2'].map(flowers), decor),
        all<ArtTexture[]>(RESOURCES.map(spotMedallion), { outline: true }),
        all<ArtTexture[]>(
          RESOURCES.map((r) => ({
            svg: resourceIcon(r),
            width: 64,
            height: 64,
            anchor: { x: 32, y: 32 },
          })),
        ),
      ]);
    return {
      broadleaves,
      autumn,
      conifers,
      mountains,
      snowyMountains,
      tuft: await rasterise(grassTuft(), decor),
      flowers: flowerArt,
      ship: await rasterise(ship(), decor),
      chest: await rasterise(chest(), { outline: true }),
      sparkle: await rasterise(sparkle()),
      alarm: await rasterise(alarm(), { outline: true }),
      castles: await byColour(castle),
      soldiers: await byColour(soldiers),
      spots: Object.fromEntries(RESOURCES.map((r, i) => [r, spots[i]!])) as Record<
        ResourceType,
        ArtTexture
      >,
      resources: Object.fromEntries(RESOURCES.map((r, i) => [r, icons[i]!])) as Record<
        ResourceType,
        ArtTexture
      >,
    };
  })();
  return loading;
}
