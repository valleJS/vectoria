import {
  emptyResources,
  LOADED_SPEED,
  RESOURCE_NAMES,
  type GameView,
  type ResourceType,
  type ResourceSpot,
} from '@vectoria/shared';
import { TriangleAlertIcon } from 'lucide-react';
import { useMemo, useState, type ReactNode } from 'react';
import { dataUrl, merchant } from '../art/svg';
import { formatEta, formatPercent, ownBases } from '../game/format';
import { barefoot, eta, nearestBase } from '../game/march';
import { gameSocket } from '../net/socket';
import { useGameStore } from '../state/store';
import { ResourceIcon } from './icons';
import { Button, SectionLabel } from './Panel';
import { Locked } from './Routed';
import { BaseSelect, CardToggle, TRADER_TEXT, TroopFields } from './SelectionPanel';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Slider } from '@/components/ui/slider';

// The trade menu, laid out like the "trade offer" meme: the scene (`merchant`) with a red banner
// on top, "i receive" (the stone the trader takes) in its upper left, "you receive" (gold and
// wood) in its upper right, the trader steepling his fingers in between. Below the picture: who
// carries the stone and the send button.

const MERCHANT_URL = dataUrl(merchant().svg);

/**
 * The trade menu in the middle of the screen: opens when the trader is selected on the map (or
 * from its side panel), closes on sending a trade march or on dismiss.
 */
export function TraderMenu() {
  const open = useGameStore((s) => s.traderMenu);
  const view = useGameStore((s) => s.view);
  const selection = useGameStore((s) => s.selection);
  const setTraderMenu = useGameStore((s) => s.setTraderMenu);
  const spot =
    selection?.kind === 'spot' && view
      ? view.spots.find((s) => s.id === selection.id && s.resource === 'trader')
      : undefined;
  if (!view || !spot) return null;
  return (
    <Dialog open={open} onOpenChange={setTraderMenu}>
      <DialogContent className="max-h-[94dvh] max-w-3xl">
        <div className="min-h-0 overflow-y-auto p-3">
          <TradeOffer key={spot.id} view={view} spot={spot} onSent={() => setTraderMenu(false)} />
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** The meme's ⚠: a brass warning triangle. */
function Warning() {
  return (
    <TriangleAlertIcon
      className="size-6 shrink-0 fill-gold text-ink sm:size-7"
      strokeWidth={2.2}
      aria-hidden
    />
  );
}

/**
 * "i receive:" / "you receive:" and their boxes. From `sm` on they sit in the scene's upper
 * corners like the meme's captions; on phones they line up under the picture.
 */
function Side({
  label,
  className,
  children,
}: {
  label: string;
  className: string;
  children: ReactNode;
}) {
  return (
    <div className={`min-w-0 space-y-1.5 sm:absolute sm:top-[16%] sm:w-[34%] ${className}`}>
      <div className="text-lg leading-none italic sm:text-2xl sm:text-parchment sm:[text-shadow:0_0_3px_#3b2a18,1px_1px_0_#3b2a18,-1px_-1px_0_#3b2a18,1px_-1px_0_#3b2a18,-1px_1px_0_#3b2a18]">
        {label}
      </div>
      {children}
    </div>
  );
}

/** One resource of the deal on a parchment slip: icon, amount field, slider. */
function Amount({
  resource,
  value,
  max,
  onChange,
  label,
  extra,
}: {
  resource: ResourceType;
  value: number;
  max: number;
  onChange: (value: number) => void;
  label: string;
  extra?: ReactNode;
}) {
  return (
    <div className="space-y-1 rounded-sm border border-ink bg-parchment/95 px-2 py-1.5 shadow-[2px_3px_0_rgba(59,42,24,0.35)]">
      <div className="flex items-center gap-2">
        <ResourceIcon resource={resource} size={30} title={RESOURCE_NAMES[resource]} />
        <Input
          type="number"
          min={0}
          max={max}
          value={value}
          onChange={(e) => onChange(Math.max(0, Math.min(max, Math.floor(Number(e.target.value)))))}
          disabled={max === 0}
          className="h-8 w-16 text-base font-bold tabular-nums"
          aria-label={label}
        />
        <span className="truncate text-ink-soft">{RESOURCE_NAMES[resource]}</span>
      </div>
      <div className="flex items-center gap-2">
        <Slider
          min={0}
          max={Math.max(max, 1)}
          step={1}
          value={[value]}
          onValueChange={([v]) => onChange(v ?? 0)}
          disabled={max === 0}
          className="flex-1 py-1"
          aria-label={label}
        />
        {extra}
      </div>
    </div>
  );
}

/**
 * The trade form: x stone from a store → y gold + z wood (x = y + z), carried there and back by
 * troops from that store.
 */
function TradeOffer({
  view,
  spot,
  onSent,
}: {
  view: GameView;
  spot: ResourceSpot;
  onSent: () => void;
}) {
  const map = useGameStore((s) => s.map);
  const bases = ownBases(view);
  const [fromId, setFromId] = useState<string | null | undefined>(undefined);
  const [chosen, setTroops] = useState(10);
  const [useCard, setUseCard] = useState(true);
  const [stoneWanted, setStone] = useState(0);
  // Gold's share of the stone, so the split survives a change of the stone amount.
  const [goldShare, setGoldShare] = useState(0.5);
  const activeCard = view.self.activeCard;
  const withCard = useCard && activeCard !== null;
  const forced = withCard && activeCard === 'forcedMarch';
  const sea = withCard && activeCard === 'sea';
  const target = { kind: 'spot', id: spot.id } as const;
  const base = bases.find((b) => b.id === fromId) ?? nearestBase(bases, spot.position);
  const travel = useMemo(
    () => (map && base ? eta(map, view, base.position, target, spot.position, forced, sea) : null),
    // `target` is rebuilt every render but only depends on the spot.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [map, base?.position, spot.id, spot.position, forced, sea],
  );
  if (!base || !map) return null;

  // Troops shrink as armies leave; never offer more than are there. Stone in the store caps x.
  const troops = Math.min(chosen, base.troops);
  const store = base.resources.stone;
  const stone = Math.max(0, Math.min(stoneWanted, store));
  const gold = Math.round(stone * goldShare);
  const wood = stone - gold;
  // Carrying resources slows the march (same rule as the server).
  const arrival = travel !== null && stone > 0 ? Math.round(travel / LOADED_SPEED) : travel;
  const valid = Number.isInteger(troops) && troops > 0 && travel !== null && stone > 0;
  const setGold = (value: number) => stone > 0 && setGoldShare(value / stone);
  const setWood = (value: number) => stone > 0 && setGoldShare(1 - value / stone);

  const send = () => {
    gameSocket.send({
      type: 'sendArmy',
      from: base.id,
      troops,
      target,
      useActiveCard: withCard,
      cargo: { ...emptyResources(), stone },
      trade: { gold, wood },
    });
    setStone(0);
    onSent();
  };

  return (
    <Locked className="space-y-3">
      {/* The meme: banner on top, the offer in the upper corners, the trader in between. */}
      <div className="relative">
        <img
          src={MERCHANT_URL}
          alt="Der Händler legt die Fingerspitzen aneinander"
          className="block w-full rounded-sm border border-ink select-none"
          draggable={false}
        />
        <div className="absolute inset-x-0 top-[3%] flex justify-center px-2">
          <DialogTitle className="inline-flex items-center gap-2 rounded-sm border border-ink bg-seal px-3 py-1 text-lg font-bold tracking-wide text-parchment uppercase not-italic shadow-[2px_3px_0_rgba(59,42,24,0.45)] sm:px-4 sm:py-1.5 sm:text-3xl">
            <Warning />
            Trade Offer
            <Warning />
          </DialogTitle>
        </div>
        <div className="mt-2 grid grid-cols-2 items-start gap-2 sm:contents">
          <Side label="i receive:" className="sm:left-[2.5%]">
            <Amount
              resource="stone"
              value={stone}
              max={store}
              onChange={setStone}
              label="Stein zum Tauschen"
              extra={
                <Button size="sm" onClick={() => setStone(store)} disabled={store === 0}>
                  Alles
                </Button>
              }
            />
            <div
              className={`rounded-sm border border-ink/40 bg-parchment/90 px-2 py-0.5 text-xs ${store === 0 ? 'text-seal' : 'text-ink-soft'}`}
            >
              {store === 0
                ? bases.length > 1
                  ? 'Hier lagert kein Stein — wähle unten einen anderen Ort.'
                  : 'Kein Stein im Lager.'
                : `${store} Stein im Lager (${base.name})`}
            </div>
          </Side>
          <Side label="you receive:" className="sm:right-[2.5%]">
            <Amount
              resource="gold"
              value={gold}
              max={stone}
              onChange={setGold}
              label="Gold aus dem Tausch"
            />
            <Amount
              resource="wood"
              value={wood}
              max={stone}
              onChange={setWood}
              label="Holz aus dem Tausch"
            />
            <div className="flex gap-1">
              {(
                [
                  ['Alles Gold', 'Gold', 1],
                  ['Halb / halb', 'Halb', 0.5],
                  ['Alles Holz', 'Holz', 0],
                ] as const
              ).map(([title, label, share]) => (
                <Button
                  key={label}
                  size="sm"
                  title={title}
                  className="flex-1 px-1"
                  variant={goldShare === share ? 'selected' : 'default'}
                  onClick={() => setGoldShare(share)}
                >
                  {label}
                </Button>
              ))}
            </div>
          </Side>
        </div>
      </div>
      <DialogDescription>{TRADER_TEXT}</DialogDescription>
      <div>
        <SectionLabel>Träger</SectionLabel>
        <div className="space-y-2">
          <BaseSelect
            bases={bases}
            base={base}
            onChange={setFromId}
            label="Aus"
            describe={(b) => `${b.name} (${b.resources.stone} Stein · ${b.troops} Tr.)`}
          />
          <TroopFields base={base} troops={troops} onChange={setTroops} />
          {activeCard && <CardToggle card={activeCard} checked={useCard} onChange={setUseCard} />}
        </div>
      </div>
      <div className="flex items-center justify-between gap-2 border-t border-ink/30 pt-2">
        <span className={travel === null ? 'text-seal' : 'text-ink-soft'}>
          {travel === null
            ? 'Kein Landweg dorthin.'
            : `Zurück ${formatEta(view.clock, 2 * (arrival ?? travel))} · beladen ${formatPercent(LOADED_SPEED)} Tempo${barefoot(view) ? ' · barfuß' : ''}`}
        </span>
        <Button variant="primary" onClick={send} disabled={!valid}>
          Handeln
        </Button>
      </div>
    </Locked>
  );
}
