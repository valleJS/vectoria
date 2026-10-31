import {
  CARDS,
  GAMEDAY_MS,
  GATHER_PER_100_TROOPS_PER_DAY,
  RESOURCE_NAMES,
  travelMs,
  type ArmyTarget,
  type ArmyView,
  type CardType,
  type GameView,
  type Vec2,
} from '@vectoria/shared';
import { useState, type ReactNode } from 'react';
import {
  cssColor,
  describeTarget,
  formatGameDuration,
  playerColor,
  playerName,
} from '../game/format';
import { gameSocket } from '../net/socket';
import { useGameStore, type Selection } from '../state/store';
import { BannerIcon, CastleIcon, ChestIcon, ResourceIcon } from './icons';
import { Button } from './Panel';

const distance = (a: Vec2, b: Vec2) => Math.hypot(a.x - b.x, a.y - b.y);

const STATUS_NAMES: Record<ArmyView['status'], string> = {
  outbound: 'unterwegs',
  stationed: 'baut ab',
  returning: 'auf dem Rückweg',
};

function SendForm({
  view,
  target,
  position,
  verb,
}: {
  view: GameView;
  target: ArmyTarget;
  position: Vec2;
  verb: string;
}) {
  const me = view.players.find((p) => p.id === view.self.id);
  const map = useGameStore((s) => s.map);
  const home = me?.homeTroops ?? 0;
  const [chosen, setTroops] = useState(50);
  // Home troops shrink as armies leave; never offer more than are there.
  const troops = Math.min(chosen, home);
  const [cards, setCards] = useState<CardType[]>([]);
  if (!me?.castle || !map) return null;

  const marchCards = [...new Set(view.self.cards)].filter((c) => CARDS[c].use === 'march');
  const eta = travelMs(distance(me.castle, position), map.width, cards.includes('forcedMarch'));
  const valid = Number.isInteger(troops) && troops > 0 && troops <= home;

  const send = () => {
    gameSocket.send({ type: 'sendArmy', troops, target, cards });
    setCards([]);
  };

  return (
    <div className="mt-2 space-y-2 border-t border-ink/30 pt-2">
      <input
        type="range"
        min={home > 0 ? 1 : 0}
        max={home}
        value={troops}
        onChange={(e) => setTroops(Number(e.target.value))}
        className="w-full accent-seal"
        aria-label="Truppen"
      />
      <div className="flex items-center gap-2">
        <input
          type="number"
          min={1}
          max={home}
          value={troops}
          onChange={(e) => setTroops(Math.floor(Number(e.target.value)))}
          className="w-20 border border-ink/50 bg-parchment-dark px-2 py-1 tabular-nums"
        />
        <span className="text-ink-soft">/ {home} zu Hause</span>
        <Button onClick={() => setTroops(home)} disabled={home === 0}>
          Alle
        </Button>
      </div>
      {marchCards.length > 0 && (
        <div className="flex flex-wrap gap-x-3 gap-y-1">
          {marchCards.map((card) => (
            <label key={card} className="flex items-center gap-1" title={CARDS[card].description}>
              <input
                type="checkbox"
                checked={cards.includes(card)}
                className="accent-seal"
                onChange={(e) =>
                  setCards(e.target.checked ? [...cards, card] : cards.filter((c) => c !== card))
                }
              />
              {CARDS[card].name}
            </label>
          ))}
        </div>
      )}
      <div className="flex items-center justify-between gap-2">
        <span className="text-ink-soft">Ankunft in {formatGameDuration(eta)} Spielzeit</span>
        <Button variant="primary" onClick={send} disabled={!valid}>
          {verb}
        </Button>
      </div>
    </div>
  );
}

function Title({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <div className="mb-1 flex items-center gap-2 text-base italic">
      {icon}
      {children}
    </div>
  );
}

function ArmyDetails({ view, army }: { view: GameView; army: ArmyView }) {
  const own = army.ownerId === view.self.id;
  const remaining = army.arriveClock !== null ? army.arriveClock - view.clock.clock : null;
  return (
    <>
      <Title icon={<BannerIcon color={cssColor(playerColor(view, army.ownerId))} />}>
        Heerzug von {own ? 'dir' : playerName(view, army.ownerId)}
      </Title>
      <div>
        {army.troops ?? '?'} Truppen · {STATUS_NAMES[army.status]}
      </div>
      <div className="text-ink-soft">
        Ziel: {describeTarget(view, army.target)}
        {remaining !== null && ` · noch ${formatGameDuration(remaining)}`}
      </div>
      {(army.fog || army.stealth || army.forcedMarch) && (
        <div className="text-xs text-sea-dark italic">
          {[army.fog && 'Nebel', army.stealth && 'Tarnung', army.forcedMarch && 'Eilmarsch']
            .filter(Boolean)
            .join(' · ')}
        </div>
      )}
      {own && army.status !== 'returning' && (
        <Button
          className="mt-2"
          onClick={() => gameSocket.send({ type: 'recallArmy', armyId: army.id })}
        >
          Zurückrufen
        </Button>
      )}
    </>
  );
}

function SelectionBody({ view, selection }: { view: GameView; selection: Selection }) {
  switch (selection.kind) {
    case 'army': {
      const army = view.armies.find((a) => a.id === selection.id);
      return army ? <ArmyDetails view={view} army={army} /> : null;
    }
    case 'castle': {
      const player = view.players.find((p) => p.id === selection.id);
      if (!player?.castle) return null;
      const own = player.id === view.self.id;
      return (
        <>
          <Title icon={<CastleIcon color={cssColor(playerColor(view, player.id))} />}>
            {own ? 'Deine Burg' : `Burg von ${player.name}`}
          </Title>
          <div>
            {player.homeTroops} Verteidiger · {player.victoryPoints} Siegpunkte
          </div>
          {player.fortified && <div className="text-sea-dark italic">Bollwerk aktiv (+50 %)</div>}
          {!own && (
            <SendForm
              key={selection.id}
              view={view}
              target={selection}
              position={player.castle}
              verb="Angreifen"
            />
          )}
        </>
      );
    }
    case 'spot': {
      const spot = view.spots.find((s) => s.id === selection.id);
      if (!spot) return null;
      const here = view.armies.filter(
        (a) => a.status === 'stationed' && a.target?.kind === 'spot' && a.target.id === spot.id,
      );
      return (
        <>
          <Title icon={<ResourceIcon resource={spot.resource} size={26} />}>
            {RESOURCE_NAMES[spot.resource]}-Vorkommen
          </Title>
          <div className="text-ink-soft">
            100 Truppen bauen {GATHER_PER_100_TROOPS_PER_DAY} {RESOURCE_NAMES[spot.resource]} pro
            Gameday ({formatGameDuration(GAMEDAY_MS)}) ab.
          </div>
          {here.length > 0 && (
            <div>
              Hier:{' '}
              {here.map((a) => `${playerName(view, a.ownerId)} (${a.troops ?? '?'})`).join(', ')}
            </div>
          )}
          <SendForm
            key={selection.id}
            view={view}
            target={selection}
            position={spot.position}
            verb="Abbauen"
          />
        </>
      );
    }
    case 'chest': {
      const chest = view.chests.find((c) => c.id === selection.id);
      if (!chest) return null;
      return (
        <>
          <Title icon={<ChestIcon size={26} />}>Truhe</Title>
          <div className="text-ink-soft">
            Enthält eine Spezialkarte. Wer zuerst ankommt, bekommt sie; danach kehren die Truppen
            heim.
          </div>
          <SendForm
            key={selection.id}
            view={view}
            target={selection}
            position={chest.position}
            verb="Hinschicken"
          />
        </>
      );
    }
  }
}

function selectionExists(view: GameView, selection: Selection): boolean {
  switch (selection.kind) {
    case 'army':
      return view.armies.some((a) => a.id === selection.id);
    case 'castle':
      return view.players.some((p) => p.id === selection.id);
    case 'spot':
      return view.spots.some((s) => s.id === selection.id);
    case 'chest':
      return view.chests.some((c) => c.id === selection.id);
  }
}

/** Details and actions for the selected map object; a hint when nothing is selected. */
export function SelectionContent({ view }: { view: GameView }) {
  const selection = useGameStore((s) => s.selection);
  const select = useGameStore((s) => s.select);
  // A chest that was opened or an army that disbanded leaves a stale selection behind.
  if (!selection || !selectionExists(view, selection)) {
    return (
      <p className="py-2 text-ink-soft italic">
        Klicke auf der Karte auf eine Burg, ein Vorkommen, eine Truhe oder einen Heerzug.
      </p>
    );
  }
  return (
    <div>
      <button
        type="button"
        className="float-right -mt-0.5 text-lg leading-none text-ink-soft hover:text-seal"
        onClick={() => select(null)}
        aria-label="Auswahl schließen"
      >
        ×
      </button>
      <SelectionBody view={view} selection={selection} />
    </div>
  );
}
