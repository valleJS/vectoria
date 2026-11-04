import {
  outpostName,
  RESOURCE_NAMES,
  RESOURCES,
  type ArmyTarget,
  type CardType,
  type GameView,
  type Outpost,
  type Resources,
  type Vec2,
} from '@vectoria/shared';
import { PLAYER_PALETTE, SELF_COLOR } from './palette';

/** Game-clock duration as "3h 20m". */
export function formatGameDuration(ms: number): string {
  const minutes = Math.max(0, Math.round(ms / 60_000));
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h > 0 ? `${h}h ${m.toString().padStart(2, '0')}m` : `${m}m`;
}

/**
 * Heraldic per-player colour: the viewer is always red, the others take palette slots in join
 * order (stable, since players are listed in registration order).
 */
export function playerColor(view: Pick<GameView, 'players' | 'self'>, playerId: string): number {
  return playerHeraldry(view, playerId).color;
}

/** Number of castle styles (`art/svg.ts` `castle`). */
export const CASTLE_STYLES = 3;

export interface Heraldry {
  color: number;
  /** Castle style, 0 … CASTLE_STYLES - 1. */
  style: number;
}

/**
 * Colour + castle style per player. The style follows the join order, so every client shows a
 * player's castle alike; it shifts once per lap of the palette. Colours run through the palette in
 * join order of the other players (the viewer is always red), so the first
 * `PLAYER_PALETTE.length × CASTLE_STYLES` players never share both colour and style.
 */
export function playerHeraldry(
  view: Pick<GameView, 'players' | 'self'>,
  playerId: string,
): Heraldry {
  const n = PLAYER_PALETTE.length;
  const joined = view.players.findIndex((p) => p.id === playerId);
  let hash = 0;
  for (const char of playerId) hash = (hash * 31 + char.charCodeAt(0)) | 0;
  hash = Math.abs(hash);
  const style = (joined >= 0 ? joined + Math.floor(joined / n) : hash) % CASTLE_STYLES;
  if (playerId === view.self.id) return { color: SELF_COLOR, style };
  const index = view.players
    .filter((p) => p.id !== view.self.id)
    .findIndex((p) => p.id === playerId);
  if (index >= 0 && index < n * CASTLE_STYLES) return { color: PLAYER_PALETTE[index % n]!, style };
  return { color: hslToHex(hash % 360, 0.55, 0.45), style };
}

export function cssColor(hex: number): string {
  return `#${hex.toString(16).padStart(6, '0')}`;
}

function hslToHex(h: number, s: number, l: number): number {
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return (Math.round(f(0) * 255) << 16) | (Math.round(f(8) * 255) << 8) | Math.round(f(4) * 255);
}

export function playerName(view: GameView, id: string): string {
  return view.players.find((p) => p.id === id)?.name ?? 'Unbekannt';
}

/** "Ruine" or "Stützpunkt <owner>". */
export function outpostLabel(view: GameView, outpost: Outpost): string {
  return outpostName(outpost.ownerId ? playerName(view, outpost.ownerId) : null);
}

/** Where an army is headed, as text; `null` target means hidden by a stealth card. */
export function describeTarget(view: GameView, target: ArmyTarget | null): string {
  if (!target) return 'unbekanntes Ziel';
  switch (target.kind) {
    case 'castle':
      return target.id === view.self.id ? 'deine Burg' : `Burg von ${playerName(view, target.id)}`;
    case 'spot': {
      const spot = view.spots.find((s) => s.id === target.id);
      return spot ? `${RESOURCE_NAMES[spot.resource]}-Vorkommen` : 'Vorkommen';
    }
    case 'outpost': {
      const outpost = view.outposts.find((o) => o.id === target.id);
      if (!outpost) return 'Stützpunkt';
      return outpost.ownerId === view.self.id ? 'deinen Stützpunkt' : outpostLabel(view, outpost);
    }
    case 'chest':
      return 'Truhe';
    case 'army': {
      const army = view.armies.find((a) => a.id === target.id);
      return army ? `Zug von ${playerName(view, army.ownerId)}` : 'Truppenzug';
    }
  }
}

/** "4 Holz, 2 Gold"; `fallback` when empty. */
export function formatResources(resources: Resources, fallback = 'nichts'): string {
  const parts = RESOURCES.filter((r) => resources[r] > 0).map(
    (r) => `${resources[r]} ${RESOURCE_NAMES[r]}`,
  );
  return parts.length > 0 ? parts.join(', ') : fallback;
}

/** A place the player's troops can leave from: the home castle (`id` null) or an own outpost. */
export interface BaseInfo {
  id: string | null;
  name: string;
  position: Vec2;
  troops: number;
  resources: Resources;
}

/** Home castle first ("Basis"), then own outposts, numbered when there are several. */
export function ownBases(view: GameView): BaseInfo[] {
  const me = view.players.find((p) => p.id === view.self.id);
  const outposts = view.outposts.filter((o) => o.ownerId === view.self.id);
  const bases: BaseInfo[] = me?.castle
    ? [
        {
          id: null,
          name: 'Basis',
          position: me.castle,
          troops: me.homeTroops,
          resources: view.self.resources,
        },
      ]
    : [];
  outposts.forEach((o, i) => {
    bases.push({
      id: o.id,
      name: outposts.length > 1 ? `Stützpunkt ${i + 1}` : 'Stützpunkt',
      position: o.position,
      troops: o.troops,
      resources: o.resources,
    });
  });
  return bases;
}

const CARD_COLORS: Record<CardType, string> = {
  fog: '#8fa3bf',
  stealth: '#6b5a8e',
  forcedMarch: '#e08a3c',
  fortify: '#5f9a55',
};

/** Frame colour of a card, shared by the card art, the hand and the card profile. */
export function cardColor(card: CardType): string {
  return CARD_COLORS[card];
}

/** A share as a whole percentage, e.g. 0.75 → "75 %" (non-breaking space). */
export function formatPercent(share: number): string {
  return `${Math.round(share * 100)}\u00a0%`;
}
