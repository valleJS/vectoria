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
  if (playerId === view.self.id) return SELF_COLOR;
  const index = view.players
    .filter((p) => p.id !== view.self.id)
    .findIndex((p) => p.id === playerId);
  if (index >= 0 && index < PLAYER_PALETTE.length) return PLAYER_PALETTE[index]!;
  let hash = 0;
  for (const char of playerId) hash = (hash * 31 + char.charCodeAt(0)) | 0;
  return hslToHex(Math.abs(hash) % 360, 0.55, 0.45);
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
