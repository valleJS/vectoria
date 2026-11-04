import { TileType, type MapData } from '@vectoria/shared';
import { Container, Graphics, Sprite } from 'pixi.js';
import type { MapArt } from '../art/textures';
import { hash2 } from './fields';

// Night rest ("Nachtruhe": the game clock stands still outside gameday hours). The map sinks into
// moonlit blue, castles and outposts glow warm, chests shimmer, fireflies drift over the forests
// and stars twinkle on the water. Everything fades in and out with `amount`.

/** Moonlight multiplied over the map at full night: deep blue that keeps the map's contrast. */
const NIGHT_SKY = 0x4a5794;
const NIGHT_RGB = [(NIGHT_SKY >> 16) & 255, (NIGHT_SKY >> 8) & 255, NIGHT_SKY & 255] as const;
/** Pieces (castles, armies, labels) are lit by the moon: a cool tint at full night. */
const MOONLIT = [0xc4, 0xc8, 0xe2] as const;
/** Lamp light of castles, outposts and campfires. */
export const FIRELIGHT = 0xff9a40;
const TREASURE_LIGHT = 0xffe08a;
const FIREFLY = 0xfff3a6;
const STARLIGHT = 0xe8eeff;
/** Time constant of the dusk/dawn fade, ms. */
const FADE_MS = 900;

/** A light source standing on the map, in world px at piece scale 1. */
export interface NightLight {
  x: number;
  y: number;
  /** Radius of the light pool, world px. */
  radius: number;
  kind: 'castle' | 'outpost' | 'chest';
}

interface Glow {
  sprite: Sprite;
  alpha: number;
  phase: number;
  /** Flicker strength 0..1. */
  flicker: number;
}

interface Drifter {
  sprite: Sprite;
  x: number;
  y: number;
  phase: number;
  speed: number;
}

/** `#rrggbb` channels lerped from white to `to` by `t`. */
function towards(to: readonly [number, number, number], t: number): number {
  const c = (i: 0 | 1 | 2) => Math.round(255 + (to[i] - 255) * t);
  return (c(0) << 16) | (c(1) << 8) | c(2);
}

export class NightScene {
  /** Dark wash over terrain and routes. */
  readonly darkness = new Graphics();
  /** Star reflections on the water, just above the darkness. */
  readonly stars = new Container();
  /** Light pools under the sites (additive). */
  readonly glowUnder = new Container();
  /** Warm light over the sites, so the buildings themselves read as lit (additive). */
  readonly glowOver = new Container();
  /** Fireflies above everything on the map. */
  readonly fireflies = new Container();
  /** 0 = day, 1 = full night; eases toward the target. */
  amount = 0;
  private target = 0;
  private started = false;
  private glows: Glow[] = [];
  private drifters: Drifter[] = [];
  private twinkles: { sprite: Sprite; phase: number; size: number }[] = [];

  private readonly art: MapArt;

  constructor(art: MapArt) {
    this.art = art;
    // Far beyond any map, so the canvas edge never shows through.
    // Drawn white and tinted towards NIGHT_SKY, multiplied over everything below.
    this.darkness.rect(-50_000, -50_000, 100_000, 100_000).fill(0xffffff);
    this.darkness.blendMode = 'multiply';
    this.darkness.visible = false;
    for (const layer of [this.glowUnder, this.glowOver, this.fireflies, this.stars]) {
      layer.alpha = 0;
      layer.visible = false;
    }
  }

  /** Night is on while `night` is true; the scene fades over FADE_MS. */
  setNight(night: boolean): void {
    this.target = night ? 1 : 0;
    // The first state after loading applies at once: opening the game at night shows night.
    if (!this.started) this.amount = this.target;
    this.started = true;
  }

  /** Whether night is (being) switched on — the switch for tents vs. marching soldiers. */
  get night(): boolean {
    return this.target === 1;
  }

  /** Fireflies over forests and star glints on water, placed by hash so every client agrees. */
  setMap(map: MapData | null): void {
    for (const layer of [this.fireflies, this.stars]) {
      for (const child of layer.removeChildren()) child.destroy();
    }
    this.drifters = [];
    this.twinkles = [];
    if (!map) return;
    const { width, height, tileSize: T, tiles } = map;
    const typeAt = (x: number, y: number) =>
      x < 0 || y < 0 || x >= width || y >= height ? TileType.Water : tiles[y * width + x];
    for (let ty = -3; ty < height + 3; ty++) {
      for (let tx = -3; tx < width + 3; tx++) {
        const type = typeAt(tx, ty);
        const r = hash2(tx, ty, 300);
        if (type === TileType.Forest && r < 0.22) {
          const sprite = new Sprite(this.art.glow);
          sprite.anchor.set(0.5);
          sprite.tint = FIREFLY;
          sprite.blendMode = 'add';
          sprite.scale.set((T * (0.16 + hash2(tx, ty, 301) * 0.08)) / 128);
          this.fireflies.addChild(sprite);
          this.drifters.push({
            sprite,
            x: (tx + hash2(tx, ty, 302)) * T,
            y: (ty + hash2(tx, ty, 303)) * T,
            phase: hash2(tx, ty, 304) * Math.PI * 2,
            speed: 0.4 + hash2(tx, ty, 305) * 0.6,
          });
        } else if (type === TileType.Water && r < 0.1) {
          const sprite = new Sprite(this.art.sparkle.texture);
          sprite.anchor.set(0.5);
          sprite.tint = STARLIGHT;
          sprite.position.set((tx + hash2(tx, ty, 306)) * T, (ty + hash2(tx, ty, 307)) * T);
          const size = T * (0.14 + hash2(tx, ty, 308) * 0.12);
          this.stars.addChild(sprite);
          this.twinkles.push({ sprite, phase: hash2(tx, ty, 309) * Math.PI * 2, size });
        }
      }
    }
  }

  /** Rebuilds the light pools for the current sites. */
  setLights(lights: NightLight[]): void {
    for (const layer of [this.glowUnder, this.glowOver]) {
      for (const child of layer.removeChildren()) child.destroy({ children: true });
    }
    this.glows = [];
    for (const [i, light] of lights.entries()) {
      const tint = light.kind === 'chest' ? TREASURE_LIGHT : FIRELIGHT;
      const pool = this.glowSprite(light, light.radius * 3.4, tint);
      this.glowUnder.addChild(pool.container);
      this.glows.push({
        sprite: pool.sprite,
        alpha: light.kind === 'chest' ? 0.6 : 0.85,
        phase: i * 1.7,
        flicker: light.kind === 'chest' ? 0.3 : 0.12,
      });
      if (light.kind !== 'chest') {
        // A softer wash over the building itself: lit windows and walls.
        const wash = this.glowSprite(light, light.radius * 1.8, FIRELIGHT);
        this.glowOver.addChild(wash.container);
        this.glows.push({ sprite: wash.sprite, alpha: 0.3, phase: i * 1.7 + 0.6, flicker: 0.1 });
      }
    }
  }

  private glowSprite(light: NightLight, diameter: number, tint: number) {
    const container = new Container();
    container.position.set(light.x, light.y);
    const sprite = new Sprite(this.art.glow);
    sprite.anchor.set(0.5);
    sprite.tint = tint;
    sprite.blendMode = 'add';
    sprite.scale.set(diameter / 128);
    container.addChild(sprite);
    return { container, sprite };
  }

  /**
   * Advances the fade and the animation. `pieceScale` scales the light pools like the sites;
   * returns the tint for moonlit pieces (white by day).
   */
  update(deltaMS: number, seconds: number, pieceScale: number): number {
    this.amount += (this.target - this.amount) * (1 - Math.exp(-deltaMS / FADE_MS));
    if (Math.abs(this.target - this.amount) < 0.002) this.amount = this.target;
    const a = this.amount;
    const on = a > 0.002;
    this.darkness.tint = towards(NIGHT_RGB, a);
    this.darkness.visible = on;
    for (const layer of [this.glowUnder, this.glowOver, this.fireflies, this.stars]) {
      layer.alpha = a;
      layer.visible = on;
    }
    if (!on) return 0xffffff;
    for (const child of [...this.glowUnder.children, ...this.glowOver.children]) {
      child.scale.set(pieceScale);
    }
    for (const glow of this.glows) {
      // Two slow waves make an uneven, candle-like flicker.
      const wave =
        Math.sin(seconds * 5.3 + glow.phase) * 0.6 + Math.sin(seconds * 8.9 + glow.phase * 2) * 0.4;
      glow.sprite.alpha = glow.alpha * (1 - glow.flicker * (0.5 + 0.5 * wave));
    }
    for (const d of this.drifters) {
      const t = seconds * d.speed + d.phase;
      d.sprite.position.set(
        d.x + Math.sin(t * 0.7) * 14 + Math.sin(t * 1.9) * 4,
        d.y + Math.cos(t * 0.5) * 10 + Math.sin(t * 2.3) * 3,
      );
      // Fireflies blink: mostly dim, now and then a bright pulse.
      const pulse = Math.max(0, Math.sin(t * 1.3));
      d.sprite.alpha = 0.15 + 0.85 * pulse ** 3;
    }
    for (const s of this.twinkles) {
      const twinkle = 0.35 + 0.65 * Math.max(0, Math.sin(seconds * 1.4 + s.phase));
      s.sprite.alpha = twinkle;
      s.sprite.scale.set(((0.6 + 0.4 * twinkle) * s.size) / this.art.sparkle.width);
    }
    return towards(MOONLIT, a);
  }
}
