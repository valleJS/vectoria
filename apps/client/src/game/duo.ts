import type { GameView } from '@vectoria/shared';
import { useEffect, useRef } from 'react';
import { useGameStore } from '../state/store';
import { playerName } from './format';

/** Pacts that wait for the viewer: offers to answer, and abort requests by the other side. */
export function pactsToAnswer(view: GameView): number {
  const me = view.self.id;
  return view.self.pacts.filter(
    (p) =>
      (p.status === 'offered' && p.partnerId === me) ||
      (p.status !== 'offered' && p.abortBy !== null && p.abortBy !== me),
  ).length;
}

/** Shows a notice when a new duo offer comes in (wherever the inbox is shown). */
export function useDuoNotices(view: GameView | null): void {
  const seen = useRef<Set<string> | null>(null);
  const showNotice = useGameStore((s) => s.showNotice);
  useEffect(() => {
    if (!view) return;
    const incoming = view.self.pacts.filter(
      (p) => p.status === 'offered' && p.partnerId === view.self.id,
    );
    if (seen.current === null) {
      // Offers already there when the page loads are in the inbox; no notice for them.
      seen.current = new Set(incoming.map((p) => p.id));
      return;
    }
    for (const p of incoming) {
      if (seen.current.has(p.id)) continue;
      seen.current.add(p.id);
      showNotice(
        `${playerName(view, p.initiatorId)} bietet dir einen Duo-Angriff an — Posteingang`,
      );
    }
  }, [view, showNotice]);
}
