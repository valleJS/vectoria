import { CARDS } from '@vectoria/shared';
import { useEffect, useState } from 'react';
import { gameSocket } from '../net/socket';
import { useGameStore } from '../state/store';
import { CardFace } from './CardFace';
import { Button } from './Panel';

const INK = '#3b2a18';
/** The chest shakes at least this long before the card comes out, even on a fast reply. */
const SHAKE_MS = 700;
/** Give up waiting for the server's answer after this long (e.g. the command was rejected). */
const REPLY_TIMEOUT_MS = 4_000;

type Phase = 'closed' | 'opening' | 'revealed';

/** The map chest (src/art/svg.ts `chest`) with the lid as its own group so it can fly off. */
function ChestArt({ open }: { open: boolean }) {
  const line = { stroke: INK, strokeWidth: 2.4, strokeLinejoin: 'round' as const };
  return (
    <svg viewBox="0 0 56 48" className="h-44 w-auto overflow-visible" aria-hidden>
      <ellipse cx="28" cy="43" rx="21" ry="4" fill={INK} opacity=".28" />
      {open && <ellipse cx="28" cy="21" rx="18" ry="5" fill="#fff3a8" />}
      <g className={open ? 'chest-lid-open' : undefined}>
        <path d="M8 21q20-18 40 0z" fill="#9a5b22" {...line} />
        <path
          d="M13 19.5q15-11 30 0"
          fill="none"
          stroke="#c48038"
          strokeWidth={2.2}
          strokeLinecap="round"
        />
      </g>
      <rect x="8" y="21" width="40" height="21" rx="1.5" fill="#b8702c" {...line} />
      <rect x="10.5" y="31" width="35" height="8.5" fill="#9a5b22" />
      <path d="M8 29.5h40" stroke={INK} strokeWidth={1.6} />
      <g fill="#f2c230" stroke={INK} strokeWidth={1.6} strokeLinejoin="round">
        <path d="M13 21V42h5.5V21Q15.8 14.6 13 21Z" />
        <path d="M37.5 21V42H43V21Q40.2 14.6 37.5 21Z" />
        <rect x="23.5" y="25" width="9" height="10" rx="1.6" />
      </g>
      <path d="M28 28.4v3.6" stroke={INK} strokeWidth={1.8} strokeLinecap="round" />
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
    <div className="pointer-events-auto fixed inset-0 z-30 flex flex-col items-center justify-center gap-6 overflow-hidden bg-ink/70 text-parchment">
      {phase === 'revealed' && card ? (
        <>
          <Rays />
          <div className="chest-burst absolute h-40 w-40 rounded-full bg-[#fff3a8]" aria-hidden />
          <div className="relative text-xl italic">Du erhältst: {CARDS[card].name}</div>
          <button
            type="button"
            className="card-reveal relative [perspective:800px]"
            onClick={() => showCard(card)}
            title="Karte ansehen"
          >
            <CardFace card={card} className="text-ink" />
          </button>
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
          <button
            type="button"
            onClick={open}
            disabled={chests === 0 || phase !== 'closed'}
            className={phase === 'opening' ? 'chest-shake' : 'chest-wobble'}
            aria-label="Truhe öffnen"
          >
            <ChestArt open={phase === 'opening' && card !== null} />
          </button>
          <div className="text-sm">
            {phase === 'opening' ? 'Öffne…' : chests > 0 ? 'Tippe auf die Truhe' : ''}
          </div>
          <Button onClick={() => setChestOverlay(false)}>
            {chests > 0 ? 'Später öffnen' : 'Schließen'}
          </Button>
        </>
      )}
    </div>
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
