import { RESOURCE_NAMES, type ArmyTarget, type GameView } from '@vectoria/shared';

/** Game-clock duration as "3h 20m". */
export function formatGameDuration(ms: number): string {
  const minutes = Math.max(0, Math.round(ms / 60_000));
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h > 0 ? `${h}h ${m.toString().padStart(2, '0')}m` : `${m}m`;
}

/** Stable per-player colour; the viewer's own castle and armies are always gold. */
export function playerColor(playerId: string, selfId: string | null): number {
  if (playerId === selfId) return 0xf5c542;
  let hash = 0;
  for (const char of playerId) hash = (hash * 31 + char.charCodeAt(0)) | 0;
  const hue = Math.abs(hash) % 360;
  return hslToHex(hue, 0.65, 0.55);
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
    case 'chest':
      return 'Truhe';
  }
}
