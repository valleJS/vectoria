import { useEffect, useState } from 'react';
import { CARDS, type CardType } from '@vectoria/shared';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { gameSocket } from '../net/socket';
import { useGameStore } from '../state/store';
import { bribableArmies } from '../game/bribe';
import { cardColor, ownBases } from '../game/format';
import { CardArt } from './icons';
import { Button } from './Panel';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

const USE_TEXT: Record<'march' | 'instant', { badge: string; line: string }> = {
  march: { badge: 'Marsch', line: 'Aktivieren, dann mit dem nächsten Zug losschicken' },
  instant: { badge: 'Sofort', line: 'Wirkt sofort beim Aktivieren' },
};

/** A card drawn large, trading-card style: name and type, art window, effect, lore line. */
export function CardFace({ card, className = '' }: { card: CardType; className?: string }) {
  const info = CARDS[card];
  const color = cardColor(card);
  const use = USE_TEXT[info.use];
  return (
    <div
      className={`w-60 rounded-xl border-2 border-ink p-1.5 shadow-[3px_4px_0_rgba(59,42,24,0.4)] ${className}`}
      style={{ background: color }}
    >
      <div className="rounded-lg border border-ink bg-parchment px-2.5 pt-1.5 pb-2">
        <div className="flex items-baseline justify-between gap-2">
          <b className="text-lg italic">{info.name}</b>
          <span
            className="rounded-full border border-ink px-2 text-[10px] tracking-wider text-parchment uppercase"
            style={{ background: color }}
          >
            {use.badge}
          </span>
        </div>
        <div className="mt-1 border-2 border-ink/80 p-[2px]" style={{ background: color }}>
          <CardArt card={card} className="h-28 w-full border-0" />
        </div>
        <div className="mt-1 text-center text-[10px] text-ink-soft italic">
          Spezialkarte · einmal einsetzbar
        </div>
        <p className="mt-1.5 border-t border-ink/30 pt-1.5 text-sm leading-snug">
          {info.description}
        </p>
        <p className="mt-2 text-xs text-ink-soft italic">„{info.flavor}“</p>
        <div className="mt-2 border-t border-ink/30 pt-1 text-[10px] text-ink-soft">{use.line}</div>
      </div>
    </div>
  );
}

/** Modal profile of a card in hand, with the action to activate (or disarm) it. */
export function CardProfile() {
  const card = useGameStore((s) => s.cardProfile);
  const view = useGameStore((s) => s.view);
  const showCard = useGameStore((s) => s.showCard);
  const map = useGameStore((s) => s.map);
  const setBribing = useGameStore((s) => s.setBribing);
  const [picked, setPicked] = useState<string | undefined>(undefined);
  const self = view?.self;
  if (!card || !view || !self) return null;
  const count = self.cards.filter((c) => c === card).length;
  const active = self.activeCard === card;
  const info = CARDS[card];
  const close = () => {
    setPicked(undefined);
    showCard(null);
  };
  // Cards aimed at something: the own outposts (Hofumzug) or the other players (Schuhe klauen,
  // Langfinger — which shows how many cards each holds, and only those with any).
  const counts = card === 'pickpocket' ? self.cardCounts : null;
  const targets =
    info.target === 'ownOutpost'
      ? ownBases(view).flatMap((b) =>
          b.id ? [{ id: b.id, label: `${b.name} · ${b.troops} Truppen` }] : [],
        )
      : info.target === 'player'
        ? view.players
            .filter((p) => p.id !== self.id && p.castle)
            .flatMap((p) => {
              if (!counts) return [{ id: p.id, label: p.name }];
              const count = counts.find((c) => c.playerId === p.id)?.count ?? 0;
              return count > 0
                ? [{ id: p.id, label: `${p.name} · ${count} ${count === 1 ? 'Karte' : 'Karten'}` }]
                : [];
            })
        : [];
  const target = targets.find((t) => t.id === picked)?.id;
  const ready = !info.target || target !== undefined;
  // Bestechung is aimed on the map: the armies in reach light up there.
  const inReach = info.target === 'foreignArmy' && map ? bribableArmies(view, map).length : 0;

  return (
    <Dialog open onOpenChange={(open) => (open ? undefined : close())}>
      <DialogContent bare showClose={false} className="items-center gap-3">
        <DialogTitle className="sr-only">Karte {info.name}</DialogTitle>
        <DialogDescription className="sr-only">
          {info.name}: aktivieren oder schließen
        </DialogDescription>
        <CardFace card={card} />
        <Card className="w-60">
          <CardContent className="flex flex-col gap-1.5 p-2">
            <div className="flex justify-between text-ink-soft">
              <span>Im Besitz: {count}</span>
              {active && <b className="text-seal">aktiv</b>}
            </div>
            {count > 0 && info.target && info.target !== 'foreignArmy' && (
              <Select value={target ?? ''} onValueChange={setPicked}>
                <SelectTrigger aria-label="Ziel der Karte" className="w-full">
                  <SelectValue
                    placeholder={
                      targets.length === 0
                        ? info.target === 'ownOutpost'
                          ? 'Du hast keinen Stützpunkt'
                          : counts
                            ? 'Niemand hat Karten'
                            : 'Niemand sonst da'
                        : info.target === 'ownOutpost'
                          ? 'Stützpunkt wählen'
                          : 'Wen trifft es?'
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  {targets.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            {count > 0 && info.target === 'foreignArmy' && (
              <>
                <p className="text-xs text-ink-soft">
                  {inReach > 0
                    ? `${inReach} ${inReach === 1 ? 'Zug ist' : 'Züge sind'} gerade in Reichweite deiner Züge — sie leuchten auf der Karte.`
                    : 'Gerade ist kein fremder Zug ohne Ladung nah genug an einem deiner Züge.'}
                </p>
                <Button
                  variant="primary"
                  disabled={inReach === 0}
                  onClick={() => {
                    setBribing(true);
                    close();
                  }}
                >
                  Zug auf der Karte wählen
                </Button>
              </>
            )}
            {count > 0 &&
              info.target !== 'foreignArmy' &&
              (active ? (
                <Button onClick={() => gameSocket.send({ type: 'activateCard', card: null })}>
                  Deaktivieren
                </Button>
              ) : (
                <Button
                  variant="primary"
                  disabled={!ready}
                  onClick={() => {
                    gameSocket.send(
                      target === undefined
                        ? { type: 'activateCard', card }
                        : { type: 'activateCard', card, target },
                    );
                    if (info.use === 'instant') close();
                  }}
                >
                  {info.use === 'instant' ? 'Aktivieren (wirkt sofort)' : 'Aktivieren'}
                </Button>
              ))}
            {info.use === 'march' && (
              <p className="text-xs text-ink-soft">
                Es kann immer nur eine Karte aktiv sein. Die aktive Karte geht mit dem nächsten Zug,
                den du losschickst, und ist danach verbraucht.
              </p>
            )}
            <Button onClick={close}>Schließen</Button>
          </CardContent>
        </Card>
      </DialogContent>
    </Dialog>
  );
}

/**
 * While Bestechung is aimed: a banner over the map until an army is picked (its panel has the
 * button) or the player cancels. Ends by itself once the card is gone.
 */
export function BribeBanner() {
  const bribing = useGameStore((s) => s.bribing);
  const setBribing = useGameStore((s) => s.setBribing);
  const view = useGameStore((s) => s.view);
  const map = useGameStore((s) => s.map);
  const holds = view?.self.cards.includes('bribe') ?? false;
  useEffect(() => {
    if (bribing && !holds) setBribing(false);
  }, [bribing, holds, setBribing]);
  useEffect(() => {
    if (!bribing) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setBribing(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [bribing, setBribing]);
  if (!bribing || !view || !map || !holds) return null;
  const count = bribableArmies(view, map).length;
  return (
    <div className="pointer-events-none absolute inset-x-0 top-16 z-20 flex justify-center px-4">
      <Card className="pointer-events-auto max-w-md">
        <CardContent className="flex items-center gap-3 p-2">
          <CardArt card="bribe" className="h-7 w-10 shrink-0 rounded-[2px]" />
          <span className="text-sm">
            <b>Bestechung:</b>{' '}
            {count > 0
              ? 'Wähle einen leuchtenden Zug auf der Karte.'
              : 'Gerade ist kein fremder Zug in Reichweite deiner Züge.'}
          </span>
          <Button onClick={() => setBribing(false)}>Abbrechen</Button>
        </CardContent>
      </Card>
    </div>
  );
}
