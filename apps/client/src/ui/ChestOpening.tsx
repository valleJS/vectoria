import { CARDS } from '@vectoria/shared';
import { chestParts } from '../art/svg';
import { useEffect, useState } from 'react';
import { gameSocket } from '../net/socket';
import { useGameStore } from '../state/store';
import { CardFace } from './CardFace';
import { Button } from './Panel';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';

/** The chest shakes at least this long before the card comes out, even on a fast reply. */
const SHAKE_MS = 700;
/** Give up waiting for the server's answer after this long (e.g. the command was rejected). */
const REPLY_TIMEOUT_MS = 4_000;

type Phase = 'closed' | 'opening' | 'revealed';

const CHEST = chestParts();

/** The map chest (src/art/svg.ts `chestParts`) with the lid as its own group so it can fly off. */
function ChestArt({ open }: { open: boolean }) {
  return (
    <svg viewBox="0 0 56 48" className="h-44 w-auto overflow-visible" aria-hidden>
      <g dangerouslySetInnerHTML={{ __html: CHEST.shadow }} />
      {open && <ellipse cx="28" cy="25" rx="20" ry="4.5" fill="#fff3a8" />}
      <g dangerouslySetInnerHTML={{ __html: CHEST.body }} />
      <g
        className={open ? 'chest-lid-open' : undefined}
        dangerouslySetInnerHTML={{ __html: CHEST.lid }}
      />
    </svg>
  );
}

/** Slowly turning light rays behind the revealed card. */
function Rays() {
  return (
    <svg
      viewBox="-100 -100 200 200"
      className="chest-rays absolute h-[30rem] w-[30rem]"
      aria-hidden
    >
      {Array.from({ length: 12 }, (_, i) => (
        <path
          key={i}
          d="M0 0L-9-100H9Z"
          fill="#fff3a8"
          opacity=".35"
          transform={`rotate(${i * 30})`}
        />
      ))}
    </svg>
  );
}

function ChestScene() {
  const chests = useGameStore((s) => s.view?.self.chests ?? 0);
  const card = useGameStore((s) => s.revealedCard);
  const { setChestOverlay, revealCard, showCard } = useGameStore.getState();
  const [phase, setPhase] = useState<Phase>('closed');

  useEffect(() => {
    if (phase !== 'opening') return;
    const timer = card
      ? setTimeout(() => setPhase('revealed'), SHAKE_MS)
      : setTimeout(() => setPhase('closed'), REPLY_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [phase, card]);

  const open = () => {
    if (phase !== 'closed' || chests === 0) return;
    revealCard(null);
    gameSocket.send({ type: 'openChest' });
    setPhase('opening');
  };

  return (
    <Dialog open onOpenChange={(open) => (open ? undefined : setChestOverlay(false))}>
      <DialogContent
        bare
        showClose={false}
        aria-describedby={undefined}
        className="inset-0 top-0 left-0 h-full max-h-none w-full translate-x-0 translate-y-0 items-center justify-center gap-6 overflow-hidden bg-ink/35 text-parchment"
      >
        <DialogTitle className="sr-only">Truhe öffnen</DialogTitle>
        {phase === 'revealed' && card ? (
          <>
            <Rays />
            <div className="chest-burst absolute h-40 w-40 rounded-full bg-[#fff3a8]" aria-hidden />
            <div className="relative text-xl italic">Du erhältst: {CARDS[card].name}</div>
            <Button
              variant="plain"
              className="card-reveal relative [perspective:800px]"
              onClick={() => showCard(card)}
              aria-label="Karte ansehen"
            >
              <CardFace card={card} className="text-ink" />
            </Button>
            <div className="relative flex gap-2">
              {chests > 0 && (
                <Button variant="primary" onClick={() => setPhase('closed')}>
                  Nächste Truhe ({chests})
                </Button>
              )}
              <Button onClick={() => showCard(card)}>Karte ansehen</Button>
              <Button onClick={() => setChestOverlay(false)}>Fertig</Button>
            </div>
          </>
        ) : (
          <>
            <div className="text-xl italic">
              {chests === 0 && phase === 'closed'
                ? 'Keine Truhe mehr da.'
                : `Deine Truppen haben ${chests === 1 ? 'eine Truhe' : `${chests} Truhen`} heimgebracht!`}
            </div>
            <Button
              variant="plain"
              onClick={open}
              disabled={chests === 0 || phase !== 'closed'}
              className={`disabled:opacity-100 ${phase === 'opening' ? 'chest-shake' : 'chest-wobble'}`}
              aria-label="Truhe öffnen"
            >
              <ChestArt open={phase === 'opening' && card !== null} />
            </Button>
            <div className="text-sm">
              {phase === 'opening' ? 'Öffne…' : chests > 0 ? 'Tippe auf die Truhe' : ''}
            </div>
            <Button onClick={() => setChestOverlay(false)}>
              {chests > 0 ? 'Später öffnen' : 'Schließen'}
            </Button>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

/**
 * Clash-Royale-style chest opening for chests the player's troops brought home. Pops up on its own
 * when chests are waiting (see the store's `applyState`); reopened from the realm box.
 */
export function ChestOpening() {
  const show = useGameStore((s) => s.chestOverlay);
  return show ? <ChestScene /> : null;
}
