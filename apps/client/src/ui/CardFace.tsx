import { CARDS, type CardType } from '@vectoria/shared';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { gameSocket } from '../net/socket';
import { useGameStore } from '../state/store';
import { cardColor } from '../game/format';
import { CardArt } from './icons';
import { Button } from './Panel';

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
  const self = useGameStore((s) => s.view?.self);
  const showCard = useGameStore((s) => s.showCard);
  if (!card || !self) return null;
  const count = self.cards.filter((c) => c === card).length;
  const active = self.activeCard === card;
  const info = CARDS[card];
  const close = () => showCard(null);

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
            {count > 0 &&
              (active ? (
                <Button onClick={() => gameSocket.send({ type: 'activateCard', card: null })}>
                  Deaktivieren
                </Button>
              ) : (
                <Button
                  variant="primary"
                  onClick={() => {
                    gameSocket.send({ type: 'activateCard', card });
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
