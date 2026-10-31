import { RESOURCES, type ResourceType } from '@vectoria/shared';
import { CanvasSource, Texture } from 'pixi.js';
import { PLAYER_PALETTE, SELF_COLOR } from '../game/palette';
import {
  banner,
  broadleaf,
  castle,
  chest,
  conifer,
  dataUrl,
  flowers,
  FOLIAGE,
  grassTuft,
  mountain,
  ship,
  spotMedallion,
  type Art,
} from './svg';

/** Art pixels are rasterised at this multiple so sprites stay sharp when zoomed in. */
const RASTER_SCALE = 3;

export interface ArtTexture {
  texture: Texture;
  /** Size and ground anchor in art pixels (before RASTER_SCALE). */
  width: number;
  height: number;
  anchor: { x: number; y: number };
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
  chest: ArtTexture;
  /** Castles keyed by owner colour (0xrrggbb), for the self colour and the palette. */
  castles: Map<number, ArtTexture>;
  /** Army banners keyed like `castles`. */
  banners: Map<number, ArtTexture>;
}

async function rasterise(art: Art): Promise<ArtTexture> {
  const image = new Image();
  image.src = dataUrl(art.svg);
  await image.decode();
  const canvas = document.createElement('canvas');
  canvas.width = art.width * RASTER_SCALE;
  canvas.height = art.height * RASTER_SCALE;
  canvas.getContext('2d')!.drawImage(image, 0, 0, canvas.width, canvas.height);
  const source = new CanvasSource({
    resource: canvas,
    resolution: RASTER_SCALE,
    autoGenerateMipmaps: true,
  });
  return {
    texture: new Texture({ source }),
    width: art.width,
    height: art.height,
    anchor: art.anchor,
  };
}

/** One texture per heraldic colour (self colour and palette). */
async function byColour(make: (color: string) => Art): Promise<Map<number, ArtTexture>> {
  const colours = [SELF_COLOR, ...PLAYER_PALETTE];
  const textures = await Promise.all(
    colours.map((c) => rasterise(make(`#${c.toString(16).padStart(6, '0')}`))),
  );
  return new Map(colours.map((c, i) => [c, textures[i]!]));
}

let loading: Promise<MapArt> | null = null;

/** Rasterises all map art once; later calls share the result. */
export function loadMapArt(): Promise<MapArt> {
  loading ??= (async () => {
    const all = <T>(items: Art[]) => Promise.all(items.map(rasterise)) as Promise<T>;
    const [broadleaves, autumn, conifers, mountains, snowyMountains, flowerArt, spots] =
      await Promise.all([
        all<ArtTexture[]>(FOLIAGE.slice(0, 3).map(broadleaf)),
        all<ArtTexture[]>(FOLIAGE.slice(3).map(broadleaf)),
        all<ArtTexture[]>([conifer(false), conifer(true)]),
        all<ArtTexture[]>([0, 1, 2, 3].map((v) => mountain(v, false))),
        all<ArtTexture[]>([0, 1, 2].map((v) => mountain(v, true))),
        all<ArtTexture[]>(['#e0534a', '#f2c230', '#ffffff', '#b45bd0'].map(flowers)),
        all<ArtTexture[]>(RESOURCES.map(spotMedallion)),
      ]);
    return {
      broadleaves,
      autumn,
      conifers,
      mountains,
      snowyMountains,
      tuft: await rasterise(grassTuft()),
      flowers: flowerArt,
      ship: await rasterise(ship()),
      chest: await rasterise(chest()),
      castles: await byColour(castle),
      banners: await byColour(banner),
      spots: Object.fromEntries(RESOURCES.map((r, i) => [r, spots[i]!])) as Record<
        ResourceType,
        ArtTexture
      >,
    };
  })();
  return loading;
}
