import {
  dayKey,
  GAMEDAY_MS,
  outpostName,
  realTimeAfter,
  WEEKDAY_SCHEDULE,
  RESOURCE_NAMES,
  SPOT_NAMES,
  RESOURCES,
  type ArmyTarget,
  type CaravanTrip,
  type CaravanWagon,
  type CardType,
  type ClockState,
  type GameView,
  type Outpost,
  type Resources,
  type Vec2,
} from '@vectoria/shared';
import { PLAYER_PALETTE } from './palette';

/** Game-clock duration as "3h 20m". */
export function formatGameDuration(ms: number): string {
  const minutes = Math.max(0, Math.round(ms / 60_000));
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h > 0 ? `${h}h ${m.toString().padStart(2, '0')}m` : `${m}m`;
}

const timeFormats = new Map<string, Intl.DateTimeFormat>();
const weekdayFormats = new Map<string, Intl.DateTimeFormat>();

function cachedFormat(
  cache: Map<string, Intl.DateTimeFormat>,
  timeZone: string,
  options: Intl.DateTimeFormatOptions,
): Intl.DateTimeFormat {
  let format = cache.get(timeZone);
  if (!format) {
    format = new Intl.DateTimeFormat('de-DE', { ...options, timeZone });
    cache.set(timeZone, format);
  }
  return format;
}

/** Where a prediction lands: the real instant (null while paused) and whether a gameday lies between. */
export interface Arrival {
  at: number | null;
  nextGameday: boolean;
}

/**
 * When `ms` more game-clock milliseconds will have passed, in real time: the clock only runs in
 * the gameday hours (minus break days), so nights, weekends and break days are skipped.
 */
export function arrivalOf(clock: ClockState, ms: number, now = Date.now()): Arrival {
  if (clock.mode === 'always') {
    const at = clock.paused ? null : now + Math.max(0, ms) / clock.timeScale;
    const day = (t: number) => Math.floor(t / GAMEDAY_MS);
    return { at, nextGameday: day(clock.clock + Math.max(0, ms)) > day(clock.clock) };
  }
  const schedule = { ...WEEKDAY_SCHEDULE, timezone: clock.timezone, breakDays: clock.breakDays };
  const at = realTimeAfter(schedule, now, ms, clock.timeScale);
  if (at === null) return { at: null, nextGameday: true };
  return {
    at: clock.paused ? null : at,
    nextGameday: dayKey(schedule, new Date(at)) !== dayKey(schedule, new Date(now)),
  };
}

/**
 * A predicted time as the arrival with the span behind it: "10:55 (55m)"; another day gets its
 * weekday ("Di 10:55 (9h 10m)") and a warning that it lands in a later gameday. While the game is
 * paused only the span can be told.
 */
export function formatEta(clock: ClockState, ms: number, now = Date.now()): string {
  const span = formatGameDuration(ms);
  const { at, nextGameday } = arrivalOf(clock, ms, now);
  const warning = nextGameday ? ' · ⚠ erst am nächsten Spieltag' : '';
  if (at === null) return `in ${span}${warning}`;
  const zone = clock.timezone;
  const time = cachedFormat(timeFormats, zone, { hour: '2-digit', minute: '2-digit' }).format(at);
  const sameDay =
    clock.mode === 'always' ||
    cachedFormat(weekdayFormats, zone, { weekday: 'short' }).format(at) ===
      cachedFormat(weekdayFormats, zone, { weekday: 'short' }).format(now);
  const weekday = sameDay
    ? ''
    : `${cachedFormat(weekdayFormats, zone, { weekday: 'short' }).format(at).replace('.', '')} `;
  return `${weekday}${time} (${span})${warning}`;
}

/**
 * Heraldic per-player colour, the same on every client (players are listed in registration
 * order). The own pieces stand out by the gold star on the castle plate and the castle's base.
 */
export function playerColor(view: Pick<GameView, 'players'>, playerId: string): number {
  return playerHeraldry(view, playerId).color;
}

/** Selection id of a night caravan wagon: its owner and its index in the owner's trip. */
export function caravanSelectionId(ownerId: string, index: number): string {
  return `${ownerId}:${index}`;
}

/** The caravan wagon a selection id points at, with its owner and trip; null once it arrived. */
export function findCaravanWagon(
  view: Pick<GameView, 'players'>,
  id: string,
): { ownerId: string; trip: CaravanTrip; wagon: CaravanWagon } | null {
  const split = id.lastIndexOf(':');
  const ownerId = id.slice(0, split);
  const trip = view.players.find((p) => p.id === ownerId)?.caravanTrip;
  const wagon = trip?.wagons[Number(id.slice(split + 1))];
  return trip && wagon ? { ownerId, trip, wagon } : null;
}

/** Number of castle styles (`art/svg.ts` `castle`). */
export const CASTLE_STYLES = 3;

export interface Heraldry {
  color: number;
  /** Castle style, 0 … CASTLE_STYLES - 1. */
  style: number;
}

/**
 * Colour + castle style per player, by join order, so every client shows a player alike. Colours
 * run through the palette and the style shifts once per lap, so the first
 * `PLAYER_PALETTE.length × CASTLE_STYLES` players never share both colour and style; anyone past
 * that gets a colour hashed from the id.
 */
export function playerHeraldry(
  view: { players: readonly { id: string }[] },
  playerId: string,
): Heraldry {
  const n = PLAYER_PALETTE.length;
  const joined = view.players.findIndex((p) => p.id === playerId);
  let hash = 0;
  for (const char of playerId) hash = (hash * 31 + char.charCodeAt(0)) | 0;
  hash = Math.abs(hash);
  const style = (joined >= 0 ? joined + Math.floor(joined / n) : hash) % CASTLE_STYLES;
  if (joined >= 0 && joined < n * CASTLE_STYLES)
    return { color: PLAYER_PALETTE[joined % n]!, style };
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
export function outpostLabel(view: GameView, outpost: Pick<Outpost, 'ownerId'>): string {
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
      return spot ? SPOT_NAMES[spot.resource] : 'Vorkommen';
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
      if (army?.ownerId === view.self.id) return 'deinen Zug';
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
          // Own bases are never hidden from their owner.
          troops: me.homeTroops ?? 0,
          resources: view.self.resources,
        },
      ]
    : [];
  outposts.forEach((o, i) => {
    bases.push({
      id: o.id,
      name: outposts.length > 1 ? `Stützpunkt ${i + 1}` : 'Stützpunkt',
      position: o.position,
      troops: o.troops ?? 0,
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
  sea: '#3f7f9e',
  harvest: '#c9951b',
  stealShoes: '#9a5a3a',
  relocate: '#a3311f',
  pickpocket: '#4f6b4a',
  bribe: '#b07d2a',
};

/** Frame colour of a card, shared by the card art, the hand and the card profile. */
export function cardColor(card: CardType): string {
  return CARD_COLORS[card];
}

/** A share as a whole percentage, e.g. 0.75 → "75 %" (non-breaking space). */
export function formatPercent(share: number): string {
  return `${Math.round(share * 100)}\u00a0%`;
}
