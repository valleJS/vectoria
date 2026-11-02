import {
  canAfford,
  CARDS,
  DAILY_ACTIVITY_INCOME,
  hasResources,
  RESOURCE_NAMES,
  RESOURCES,
  TROOP_BATCH_COST,
  TROOP_BATCH_SIZE,
  VICTORY_POINT_COST,
  type ArmyView,
  type CardType,
  type FeedEntry,
  type GameView,
  type Resources,
} from '@vectoria/shared';
import { useEffect, useState, useSyncExternalStore, type ReactNode } from 'react';
import {
  cssColor,
  describeTarget,
  formatGameDuration,
  formatResources,
  ownBases,
  playerColor,
  type BaseInfo,
} from '../game/format';
import { gameSocket } from '../net/socket';
import { useGameStore, type ConnectionStatus } from '../state/store';
import {
  AlarmIcon,
  SoldiersIcon,
  CardArt,
  CastleIcon,
  ChestIcon,
  ResourceIcon,
  ShieldIcon,
  StarIcon,
  SunIcon,
} from './icons';
import { CardProfile } from './CardFace';
import { ChestOpening } from './ChestOpening';
import { Handbook, HandbookButton, HandbookCorner } from './Handbook';
import { compactQuery } from './layout';
import { Button, SectionLabel } from './Panel';
import { SelectionContent } from './SelectionPanel';

const STATUS_STYLES: Record<ConnectionStatus, { label: string; dot: string }> = {
  idle: { label: 'Offline', dot: 'bg-ink-soft' },
  connecting: { label: 'Verbinde…', dot: 'bg-[#d9a21b] animate-pulse' },
  open: { label: 'Verbunden', dot: 'bg-moss' },
  closed: { label: 'Verbinde neu…', dot: 'bg-seal animate-pulse' },
};
const NOTICE_MS = 4_000;
const BOX =
  'pointer-events-auto border border-ink bg-parchment text-sm shadow-[2px_3px_0_rgba(59,42,24,0.35)]';

/** Cost as resource icons with amounts. */
function Cost({ cost }: { cost: Resources }) {
  return (
    <span className="inline-flex items-center gap-1.5 tabular-nums">
      {RESOURCES.filter((r) => cost[r] > 0).map((r) => (
        <span key={r} className="inline-flex items-center gap-0.5">
          {cost[r]}
          <ResourceIcon resource={r} size={16} title={RESOURCE_NAMES[r]} />
        </span>
      ))}
    </span>
  );
}

/** Game-wide status only: title, gameday clock, connection. Personal stats live in RealmBox. */
function TopBar({ view, compact }: { view: GameView; compact: boolean }) {
  const status = useGameStore((s) => s.status);
  const latencyMs = useGameStore((s) => s.latencyMs);
  const { label, dot } = STATUS_STYLES[status];
  const { clock } = view;
  const clockLabel = clock.paused
    ? 'vom Admin pausiert'
    : clock.running
      ? 'Spielzeit läuft'
      : 'Ruhezeit (Mo–Fr 10–18 Uhr)';

  return (
    <header
      className={`pointer-events-auto flex items-center border-b-[3px] border-double border-ink bg-parchment-dark shadow-[0_2px_0_rgba(59,42,24,0.25)] ${
        compact
          ? 'gap-x-2.5 px-3 pt-[max(0.25rem,env(safe-area-inset-top))] pb-1'
          : 'gap-x-4 px-4 py-1.5'
      }`}
    >
      <span className={`font-bold italic ${compact ? 'text-lg' : 'text-xl'}`}>Vectoria</span>
      <span className="flex min-w-0 items-center gap-2 leading-tight">
        <SunIcon size={compact ? 20 : 22} lit={clock.running} />
        <span className="min-w-0">
          <b className="whitespace-nowrap">Spieltag {clock.gameday}</b>
          <span className={`text-xs text-ink-soft ${compact ? 'block truncate' : 'ml-2'}`}>
            {clockLabel}
            {clock.timeScale !== 1 && <span className="text-seal"> · {clock.timeScale}×</span>}
          </span>
        </span>
      </span>
      <span className="ml-auto flex items-center gap-1.5 text-xs text-ink-soft" title={label}>
        <span className={`h-2.5 w-2.5 rounded-full border border-ink/60 ${dot}`} />
        {compact
          ? null
          : status === 'open' && latencyMs !== null
            ? `${Math.round(latencyMs)} ms`
            : label}
      </span>
      {compact && <HandbookButton />}
    </header>
  );
}

/** ▾/▸ button that folds a box open or shut. */
function FoldToggle({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      className="px-1 text-ink-soft hover:text-seal"
      onClick={onToggle}
      aria-expanded={open}
      aria-label={open ? 'Einklappen' : 'Ausklappen'}
    >
      {open ? '▾' : '▸'}
    </button>
  );
}

/** Icon + big number in a framed chip; the title doubles as tooltip and accessible label. */
function Stat({
  title,
  icon,
  extra,
  children,
}: {
  title: string;
  icon: ReactNode;
  extra?: string;
  children: ReactNode;
}) {
  return (
    <span
      title={title}
      aria-label={title}
      className="flex items-center justify-center gap-1 border border-ink/40 bg-parchment-dark/60 px-1.5 py-0.5 text-base font-bold tabular-nums"
    >
      {icon}
      {children}
      {extra && <span className="text-xs font-normal text-ink-soft">{extra}</span>}
    </span>
  );
}

/** The player's special cards as a compact hand; a card opens its profile. */
function CardHand({ view }: { view: GameView }) {
  const showCard = useGameStore((s) => s.showCard);
  const counts = new Map<CardType, number>();
  for (const card of view.self.cards) counts.set(card, (counts.get(card) ?? 0) + 1);
  if (counts.size === 0) {
    return <p className="text-xs text-ink-soft italic">Keine Karten — erobere Truhen.</p>;
  }
  return (
    <div className="flex flex-wrap gap-1.5">
      {[...counts].map(([card, count]) => {
        const info = CARDS[card];
        const active = view.self.activeCard === card;
        return (
          <button
            key={card}
            type="button"
            title={info.description}
            onClick={() => showCard(card)}
            className={`relative w-[4.6rem] border bg-parchment p-[2px] hover:-translate-y-0.5 hover:shadow-[1px_2px_0_rgba(59,42,24,0.35)] ${
              active ? 'border-seal outline-2 outline-seal' : 'border-ink'
            }`}
          >
            <CardArt card={card} className="h-8 w-full" />
            <div className="text-center text-[11px] italic">{info.name}</div>
            <div className="text-center text-[10px] leading-tight text-ink-soft">
              {active ? (
                <b className="text-seal">aktiv</b>
              ) : info.use === 'instant' ? (
                'sofort'
              ) : (
                'Marsch'
              )}
            </div>
            {count > 1 && (
              <span className="absolute -top-2 -right-2 flex h-4 min-w-4 items-center justify-center rounded-full border border-ink bg-seal px-1 text-[10px] text-parchment">
                {count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

/** Resources and troops stored at one base. */
function BaseStats({ view, base }: { view: GameView; base: BaseInfo }) {
  const where = base.id === null ? 'in der Basis' : 'im Stützpunkt';
  return (
    <div className="grid grid-cols-4 gap-1">
      {RESOURCES.map((r) => (
        <Stat
          key={r}
          title={`${RESOURCE_NAMES[r]} ${where}`}
          icon={<ResourceIcon resource={r} size={20} />}
        >
          {base.resources[r]}
        </Stat>
      ))}
      <Stat
        title={`Truppen ${where}`}
        icon={<SoldiersIcon color={cssColor(playerColor(view, view.self.id))} size={20} />}
      >
        {base.troops}
      </Stat>
    </div>
  );
}

/** The home castle: stock, troops in the field, and the shop (spending happens only here). */
function HomeBase({ view, base }: { view: GameView; base: BaseInfo }) {
  const { self } = view;
  const field = view.armies
    .filter((a) => a.ownerId === self.id)
    .reduce((sum, a) => sum + (a.troops ?? 0), 0);
  const buy = (item: 'troops' | 'victoryPoint', count: number) =>
    gameSocket.send({ type: 'buy', item, count });
  return (
    <>
      <BaseStats view={view} base={base} />
      <div className="mt-1 text-xs text-ink-soft">Unterwegs: {field} Truppen</div>
      <div className="mt-2 space-y-1.5">
        <div className="flex items-center justify-between gap-2">
          <span className="flex items-center gap-1">
            <SoldiersIcon color={cssColor(playerColor(view, self.id))} size={18} />{' '}
            {TROOP_BATCH_SIZE} Truppen
            <span className="ml-1 text-xs text-ink-soft">
              <Cost cost={TROOP_BATCH_COST} />
            </span>
          </span>
          <div className="flex gap-1">
            {[1, 5].map((n) => (
              <Button
                key={n}
                className="px-2 py-0.5"
                onClick={() => buy('troops', n)}
                disabled={!canAfford(self.resources, TROOP_BATCH_COST, n)}
              >
                {n}×
              </Button>
            ))}
          </div>
        </div>
        <div className="flex items-center justify-between gap-2">
          <span className="flex items-center gap-1">
            <StarIcon size={16} /> 1 Siegpunkt
            <span className="ml-1 text-xs text-ink-soft">
              <Cost cost={VICTORY_POINT_COST} />
            </span>
          </span>
          <Button
            variant="primary"
            className="px-2 py-0.5"
            onClick={() => buy('victoryPoint', 1)}
            disabled={!canAfford(self.resources, VICTORY_POINT_COST)}
          >
            1×
          </Button>
        </div>
      </div>
    </>
  );
}

/** An own outpost: stock and troops, with shortcuts to act from or bring goods home. */
function OutpostBase({ view, base }: { view: GameView; base: BaseInfo }) {
  const select = useGameStore((s) => s.select);
  return (
    <>
      <BaseStats view={view} base={base} />
      <p className="mt-1 text-xs text-ink-soft">
        Ausgeben lässt sich nur, was in der Basis lagert.
      </p>
      <div className="mt-1.5 flex gap-1.5">
        <Button className="flex-1 px-1" onClick={() => select({ kind: 'outpost', id: base.id! })}>
          Auf der Karte
        </Button>
        <Button
          className="flex-1 px-1"
          disabled={base.troops === 0}
          onClick={() => select({ kind: 'castle', id: view.self.id })}
        >
          Heimholen
        </Button>
      </div>
    </>
  );
}

/** A base section that folds open; used once the player holds more than one base. */
function BaseFold({
  view,
  base,
  defaultOpen,
}: {
  view: GameView;
  base: BaseInfo;
  defaultOpen: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const color = cssColor(playerColor(view, view.self.id));
  return (
    <div className="mt-2 border border-ink/40">
      <button
        type="button"
        className="flex w-full items-center gap-1.5 bg-parchment-dark/60 px-2 py-1 text-left hover:text-seal"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
      >
        <CastleIcon color={color} size={18} />
        <b className="min-w-0 flex-1 truncate italic">{base.name}</b>
        <span className="text-xs text-ink-soft tabular-nums">
          {base.troops} Tr. · {formatResources(base.resources, 'leer')}
        </span>
        <span className="text-ink-soft">{open ? '▾' : '▸'}</span>
      </button>
      {open && (
        <div className="px-2 pt-1.5 pb-2">
          {base.id === null ? (
            <HomeBase view={view} base={base} />
          ) : (
            <OutpostBase view={view} base={base} />
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Everything about the player in one box. Victory points, base activity and cards belong to the
 * player and sit on top; troops and resources belong to a base ("Basis", then each outpost),
 * each in its own fold once there is more than one.
 */
function RealmBox({ view, collapsible = true }: { view: GameView; collapsible?: boolean }) {
  const setToken = useGameStore((s) => s.setToken);
  const setChestOverlay = useGameStore((s) => s.setChestOverlay);
  const [open, setOpen] = useState(true);
  const { self } = view;
  const me = view.players.find((p) => p.id === self.id);
  const bases = ownBases(view);
  const vp = me?.victoryPoints ?? 0;

  return (
    <section className={`${BOX} flex min-h-0 flex-col`}>
      <header className="flex items-center gap-2 border-b border-ink bg-parchment-dark px-3 py-1.5">
        <ShieldIcon color={cssColor(playerColor(view, self.id))} size={18} />
        <b className="min-w-0 flex-1 truncate italic">{self.name}</b>
        <span className="flex items-center gap-1 tabular-nums" title="Siegpunkte">
          <StarIcon size={18} />
          <b>{vp}</b>
          <span className="text-xs text-ink-soft">/ {view.victoryPointsToWin}</span>
        </span>
        {collapsible && <FoldToggle open={open} onToggle={() => setOpen(!open)} />}
      </header>
      {open && (
        <div className="min-h-0 overflow-y-auto px-3 pt-2 pb-2.5">
          <div className="flex items-center justify-between text-xs text-ink-soft">
            <span>Fortschritt zum Sieg</span>
            <span className="inline-block h-1.5 w-28 border border-ink/50 bg-parchment-deep">
              <span
                className="block h-full bg-seal"
                style={{ width: `${Math.min(100, (vp / view.victoryPointsToWin) * 100)}%` }}
              />
            </span>
          </div>

          {self.chests > 0 && (
            <Button
              variant="primary"
              className="mt-2 flex w-full items-center justify-center gap-1.5"
              onClick={() => setChestOverlay(true)}
            >
              <ChestIcon size={18} />
              {self.chests === 1 ? 'Truhe öffnen' : `${self.chests} Truhen öffnen`}
            </Button>
          )}

          <SectionLabel>Basisaktivität</SectionLabel>
          <div className="grid grid-cols-3 gap-1.5">
            {RESOURCES.map((r) => (
              <Button
                key={r}
                variant={self.pendingActivity === r ? 'selected' : 'default'}
                className="flex items-center justify-center gap-1 px-1"
                onClick={() => gameSocket.send({ type: 'setActivity', resource: r })}
              >
                <ResourceIcon resource={r} size={16} />
                {RESOURCE_NAMES[r]}
              </Button>
            ))}
          </div>
          <div className="mt-1 text-xs text-ink-soft">
            Heute:{' '}
            {self.activity ? `${RESOURCE_NAMES[self.activity]} (+${DAILY_ACTIVITY_INCOME})` : '—'}
            {self.pendingActivity && self.pendingActivity !== self.activity && (
              <> · ab nächstem Spieltag: {RESOURCE_NAMES[self.pendingActivity]}</>
            )}
          </div>

          <SectionLabel>Karten</SectionLabel>
          <CardHand view={view} />

          {bases.length === 1 ? (
            <>
              <SectionLabel>Basis</SectionLabel>
              <HomeBase view={view} base={bases[0]!} />
            </>
          ) : (
            bases.map((base) => (
              <BaseFold
                key={base.id ?? 'home'}
                view={view}
                base={base}
                defaultOpen={base.id === null}
              />
            ))
          )}

          <div className="mt-2 text-right">
            <button
              type="button"
              className="text-xs text-ink-soft underline hover:text-seal"
              onClick={() => {
                if (
                  window.confirm('Abmelden? Du kannst dich jederzeit per E-Mail wieder anmelden.')
                ) {
                  setToken(null);
                }
              }}
            >
              Abmelden
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

function armyStatusText(view: GameView, army: ArmyView): string {
  const left = formatGameDuration(army.arriveClock - view.clock.clock);
  switch (army.status) {
    case 'gathering':
      return `sammelt noch ${left}`;
    case 'returning':
      return (
        `Heimweg, ${left}` + (hasResources(army.cargo) ? ` · ${formatResources(army.cargo)}` : '')
      );
    case 'outbound':
      return `${army.target?.kind === 'army' ? 'Überfall' : 'Ankunft'} in ${left}`;
  }
}

function ArmiesList({ view }: { view: GameView }) {
  const select = useGameStore((s) => s.select);
  const mine = view.armies.filter((a) => a.ownerId === view.self.id);
  if (mine.length === 0) {
    return (
      <p className="py-2 text-ink-soft italic">
        Keine Heerzüge unterwegs. Wähle ein Ziel auf der Karte, um Truppen zu entsenden.
      </p>
    );
  }
  return (
    <ul className="divide-y divide-ink/15">
      {mine.map((army) => (
        <li key={army.id} className="flex items-center justify-between gap-2 py-1.5">
          <button
            type="button"
            className="min-w-0 text-left hover:text-seal"
            onClick={() => select({ kind: 'army', id: army.id })}
          >
            <b className="tabular-nums">{army.troops}</b> → {describeTarget(view, army.target)}
            <span className="block text-xs text-ink-soft">{armyStatusText(view, army)}</span>
          </button>
          {army.status !== 'returning' && (
            <Button
              title="Zurückrufen"
              onClick={() => gameSocket.send({ type: 'recallArmy', armyId: army.id })}
            >
              ↩
            </Button>
          )}
        </li>
      ))}
    </ul>
  );
}

function Leaderboard({ view }: { view: GameView }) {
  const ranked = [...view.players].sort((a, b) => b.victoryPoints - a.victoryPoints);
  return (
    <>
      <p className="mb-1.5 text-xs text-ink-soft">
        Wer zuerst {view.victoryPointsToWin} Siegpunkte hat, gewinnt.
      </p>
      <ol className="space-y-1.5 tabular-nums">
        {ranked.map((p, rank) => {
          const color = cssColor(playerColor(view, p.id));
          return (
            <li key={p.id} className="flex items-center gap-2">
              <span className="w-4 text-right text-xs text-ink-soft">{rank + 1}.</span>
              <ShieldIcon color={color} />
              <span
                className={`min-w-0 flex-1 truncate ${p.online ? '' : 'text-ink-soft italic'} ${p.id === view.self.id ? 'font-bold' : ''}`}
                title={p.online ? undefined : 'offline'}
              >
                {p.name}
              </span>
              <span className="h-1.5 w-16 border border-ink/50 bg-parchment-deep">
                <span
                  className="block h-full"
                  style={{
                    width: `${Math.min(100, (p.victoryPoints / view.victoryPointsToWin) * 100)}%`,
                    background: color,
                  }}
                />
              </span>
              <b className="w-5 text-right">{p.victoryPoints}</b>
            </li>
          );
        })}
      </ol>
    </>
  );
}

const timeOf = (at: number) =>
  new Date(at).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });

function Chronicle({ view }: { view: GameView }) {
  if (view.self.log.length === 0) {
    return <p className="py-2 text-ink-soft italic">Noch nichts geschehen.</p>;
  }
  return (
    <ul className="divide-y divide-ink/15">
      {view.self.log.map((entry, i) => (
        <li key={`${entry.at}-${i}`} className="flex gap-2 py-1">
          <span className="shrink-0 text-ink-soft tabular-nums">{timeOf(entry.at)}</span>
          <span>{entry.text}</span>
        </li>
      ))}
    </ul>
  );
}

type SidebarTab = 'selection' | 'armies' | 'ranking' | 'log';

/** Right-hand sidebar: one tab at a time, so the map stays visible. */
function Sidebar({ view }: { view: GameView }) {
  const selection = useGameStore((s) => s.selection);
  const [tab, setTab] = useState<SidebarTab>('ranking');
  const [seenSelection, setSeenSelection] = useState(selection);
  // Selecting something on the map brings its details forward.
  if (selection !== seenSelection) {
    setSeenSelection(selection);
    if (selection) setTab('selection');
  }
  const armies = view.armies.filter((a) => a.ownerId === view.self.id).length;
  const tabs: { id: SidebarTab; label: string; badge?: number }[] = [
    { id: 'selection', label: 'Auswahl' },
    { id: 'armies', label: 'Heerzüge', badge: armies },
    { id: 'ranking', label: 'Rangliste' },
    { id: 'log', label: 'Chronik' },
  ];
  return (
    <div className={`${BOX} flex min-h-0 flex-col`}>
      <nav className="flex shrink-0 border-b border-ink bg-parchment-dark" role="tablist">
        {tabs.map(({ id, label, badge }) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            onClick={() => setTab(id)}
            className={`flex flex-1 items-center justify-center gap-1 border-r border-ink/30 px-1 py-1.5 last:border-r-0 ${
              tab === id
                ? '-mb-px border-b-2 border-b-seal bg-parchment font-bold'
                : 'text-ink-soft hover:bg-parchment-deep/60 hover:text-ink'
            }`}
          >
            {label}
            {badge ? (
              <span className="rounded-full bg-seal px-1.5 text-[11px] leading-4 text-parchment">
                {badge}
              </span>
            ) : null}
          </button>
        ))}
      </nav>
      <div className="min-h-0 overflow-y-auto px-3 py-2">
        {tab === 'selection' && <SelectionContent view={view} />}
        {tab === 'armies' && <ArmiesList view={view} />}
        {tab === 'ranking' && <Leaderboard view={view} />}
        {tab === 'log' && <Chronicle view={view} />}
      </div>
    </div>
  );
}

const FEED_MARKS: Record<FeedEntry['kind'], string> = {
  march: 'bg-ink-soft',
  battle: 'bg-seal',
  gather: 'bg-[#e0a919]',
  chest: 'bg-[#b8702c]',
  outpost: 'bg-sea-dark',
  day: 'bg-moss',
};

/** Live ticker for everyone: what is on the move right now, and the latest public events. */
/** `collapsible` false: always open (inside the phone's bottom sheet). */
function Ticker({ view, collapsible = true }: { view: GameView; collapsible?: boolean }) {
  const select = useGameStore((s) => s.select);
  const [open, setOpen] = useState(true);
  const moving = view.armies;
  const attacks = moving.filter(
    (a) =>
      a.status === 'outbound' &&
      (a.target?.kind === 'castle' || a.target?.kind === 'outpost') &&
      a.target.id !== a.ownerId,
  ).length;
  const raids = moving.filter((a) => a.target?.kind === 'army').length;
  const gatherers = moving.filter(
    (a) => a.status === 'gathering' || (a.status === 'outbound' && a.target?.kind === 'spot'),
  ).length;
  const convoys = moving.filter((a) => a.status === 'returning' && hasResources(a.cargo)).length;
  const summary: { label: string; count: number; icon: ReactNode }[] = [
    { label: 'Angriffe', count: attacks, icon: <AlarmIcon size={16} /> },
    { label: 'Überfälle', count: raids, icon: <span className="font-bold text-seal">✕</span> },
    { label: 'Sammelzüge', count: gatherers, icon: <ResourceIcon resource="wood" size={16} /> },
    { label: 'Beladene Züge', count: convoys, icon: <ChestIcon size={16} /> },
  ];

  return (
    <section className={`${BOX} flex min-h-0 flex-col`}>
      <header className="flex items-center gap-2 border-b border-ink bg-parchment-dark px-3 py-1.5">
        <span className="h-2 w-2 animate-pulse rounded-full bg-seal" aria-hidden />
        <b className="flex-1 italic">Liveticker</b>
        <span className="text-xs text-ink-soft">{moving.length} Züge unterwegs</span>
        {collapsible && <FoldToggle open={open} onToggle={() => setOpen(!open)} />}
      </header>
      <div className="grid grid-cols-4 gap-1 border-b border-ink/30 px-2 py-1.5">
        {summary.map(({ label, count, icon }) => (
          <span
            key={label}
            title={label}
            className={`flex items-center justify-center gap-1 tabular-nums ${count === 0 ? 'opacity-40' : 'font-bold'}`}
          >
            {icon}
            {count}
          </span>
        ))}
      </div>
      {open && (
        <ul className="min-h-0 divide-y divide-ink/10 overflow-y-auto px-3 py-1">
          {view.feed.length === 0 && <li className="py-1 text-ink-soft italic">Noch ruhig.</li>}
          {view.feed.map((entry, i) => {
            const linked = entry.armyId && view.armies.some((a) => a.id === entry.armyId);
            return (
              <li key={`${entry.at}-${i}`} className="flex items-baseline gap-2 py-1 leading-snug">
                <span className="shrink-0 text-xs text-ink-soft tabular-nums">
                  {timeOf(entry.at)}
                </span>
                <span
                  className={`h-2 w-2 shrink-0 translate-y-[-1px] rounded-full ${FEED_MARKS[entry.kind]}`}
                />
                {linked ? (
                  <button
                    type="button"
                    className="text-left hover:text-seal hover:underline"
                    onClick={() => select({ kind: 'army', id: entry.armyId! })}
                  >
                    {entry.text}
                  </button>
                ) : (
                  <span>{entry.text}</span>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function Notice({ className = 'top-4' }: { className?: string }) {
  const notice = useGameStore((s) => s.notice);
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => useGameStore.setState({ notice: null }), NOTICE_MS);
    return () => clearTimeout(timer);
  }, [notice]);
  if (!notice) return null;
  return (
    <div
      className={`pointer-events-auto absolute left-1/2 z-20 w-max max-w-[calc(100%-2rem)] -translate-x-1/2 border border-ink bg-seal px-4 py-2 text-sm text-parchment shadow-[2px_3px_0_rgba(59,42,24,0.35)] ${className}`}
    >
      {notice.text}
    </div>
  );
}

function EndBanner({ view }: { view: GameView }) {
  if (view.phase !== 'ended') return null;
  const winner = view.players.find((p) => p.id === view.winnerId);
  return (
    <div className={`${BOX} px-4 py-2 text-center text-lg italic`}>
      Spielende —{' '}
      {winner ? `${winner.name} gewinnt mit ${winner.victoryPoints} Siegpunkten!` : 'kein Sieger.'}
    </div>
  );
}

/** True below the compact breakpoint (phones, narrow windows); follows window resizes. */
function useCompact(): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const query = window.matchMedia(compactQuery);
      query.addEventListener('change', onChange);
      return () => query.removeEventListener('change', onChange);
    },
    () => window.matchMedia(compactQuery).matches,
  );
}

type SheetTab = 'ticker' | 'selection' | 'armies' | 'ranking' | 'realm';

/** Content of one phone sheet; boxes with their own header come as they are. */
function SheetContent({ view, tab }: { view: GameView; tab: SheetTab }) {
  const titled = (title: string, body: ReactNode) => (
    <section className={`${BOX} flex min-h-0 flex-col`}>
      <header className="border-b border-ink bg-parchment-dark px-3 py-1.5">
        <b className="italic">{title}</b>
      </header>
      <div className="min-h-0 overflow-y-auto px-3 py-2">{body}</div>
    </section>
  );
  switch (tab) {
    case 'ticker':
      return <Ticker view={view} collapsible={false} />;
    case 'selection':
      return titled('Auswahl', <SelectionContent view={view} />);
    case 'armies':
      return titled('Heerzüge', <ArmiesList view={view} />);
    case 'ranking':
      return titled(
        'Rangliste & Chronik',
        <>
          <Leaderboard view={view} />
          <SectionLabel>Deine Chronik</SectionLabel>
          <Chronicle view={view} />
        </>,
      );
    case 'realm':
      return <RealmBox view={view} collapsible={false} />;
  }
}

/**
 * Phone layout: the map fills the screen; a tab bar at the bottom opens one panel at a time as
 * a sheet over the lower part of the map. Selecting something on the map opens "Auswahl".
 */
function CompactHud({ view }: { view: GameView }) {
  const selection = useGameStore((s) => s.selection);
  const [tab, setTab] = useState<SheetTab | null>(null);
  const [seenSelection, setSeenSelection] = useState(selection);
  if (selection !== seenSelection) {
    setSeenSelection(selection);
    if (selection) setTab('selection');
  }
  const color = cssColor(playerColor(view, view.self.id));
  const armies = view.armies.filter((a) => a.ownerId === view.self.id).length;
  const tabs: { id: SheetTab; label: string; icon: ReactNode; badge?: number }[] = [
    { id: 'ticker', label: 'Ticker', icon: <AlarmIcon size={20} /> },
    { id: 'selection', label: 'Auswahl', icon: <CastleIcon color={color} size={22} /> },
    { id: 'armies', label: 'Züge', icon: <SoldiersIcon color={color} size={22} />, badge: armies },
    { id: 'ranking', label: 'Rang', icon: <StarIcon size={20} /> },
    {
      id: 'realm',
      label: 'Reich',
      icon: <ShieldIcon color={color} size={20} />,
      badge: view.self.chests,
    },
  ];

  return (
    <div className="pointer-events-none absolute inset-0 flex flex-col">
      <TopBar view={view} compact />
      <div className="relative min-h-0 flex-1">
        <Notice className="top-2" />
        <div className="absolute inset-x-2 bottom-2 flex flex-col items-center">
          {!tab && <EndBanner view={view} />}
        </div>
        {tab && (
          <div className="pointer-events-auto absolute inset-x-0 bottom-0 flex max-h-[62dvh] flex-col px-1.5 pt-1">
            <button
              type="button"
              onClick={() => setTab(null)}
              aria-label="Panel schließen"
              className="mx-auto mb-1 flex items-center gap-1 rounded-full border border-ink/60 bg-parchment px-3 py-0.5 text-xs text-ink-soft shadow-[1px_2px_0_rgba(59,42,24,0.3)]"
            >
              ▾ Karte zeigen
            </button>
            <SheetContent view={view} tab={tab} />
          </div>
        )}
      </div>
      <nav
        className="pointer-events-auto flex shrink-0 border-t-[3px] border-double border-ink bg-parchment-dark pb-[env(safe-area-inset-bottom)] shadow-[0_-2px_0_rgba(59,42,24,0.2)]"
        role="tablist"
      >
        {tabs.map(({ id, label, icon, badge }) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            onClick={() => setTab(tab === id ? null : id)}
            className={`relative flex h-14 flex-1 flex-col items-center justify-center gap-0.5 text-[11px] ${
              tab === id ? 'bg-parchment font-bold text-seal' : 'text-ink-soft'
            }`}
          >
            {icon}
            {label}
            {badge ? (
              <span className="absolute top-1 right-[calc(50%-1.4rem)] rounded-full bg-seal px-1.5 text-[10px] leading-4 text-parchment">
                {badge}
              </span>
            ) : null}
          </button>
        ))}
      </nav>
    </div>
  );
}

/**
 * HTML overlay above the canvas. The root ignores pointer events so map input passes through;
 * panels opt back in with `pointer-events-auto`. Wide: live ticker left, selection tabs above
 * the player's realm box right. Compact (phones): see `CompactHud`.
 */
export function Hud() {
  const view = useGameStore((s) => s.view);
  const compact = useCompact();
  if (!view) return null;
  return (
    <>
      {compact ? (
        <CompactHud view={view} />
      ) : (
        <div className="pointer-events-none absolute inset-0 flex flex-col">
          <TopBar view={view} compact={false} />
          <div className="relative flex min-h-0 flex-1 justify-between gap-4 p-3">
            <div className="flex w-80 min-h-0 flex-col gap-3">
              <div className="flex max-h-[55%] min-h-0 flex-col">
                <Ticker view={view} />
              </div>
              <div className="mt-auto">
                <HandbookCorner />
              </div>
            </div>
            <div className="flex flex-1 flex-col items-center justify-end">
              <EndBanner view={view} />
            </div>
            <div className="flex w-80 min-h-0 flex-col gap-3">
              <Sidebar view={view} />
              <div className="mt-auto flex max-h-[65%] min-h-0 shrink-0 flex-col">
                <RealmBox view={view} />
              </div>
            </div>
            <Notice />
          </div>
        </div>
      )}
      <ChestOpening />
      <CardProfile />
      <Handbook />
    </>
  );
}
