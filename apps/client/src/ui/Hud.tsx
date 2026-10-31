import {
  canAfford,
  CARDS,
  DAILY_ACTIVITY_INCOME,
  RESOURCE_NAMES,
  RESOURCES,
  TROOP_BATCH_COST,
  TROOP_BATCH_SIZE,
  VICTORY_POINT_COST,
  type CardType,
  type GameView,
  type Resources,
} from '@vectoria/shared';
import { useEffect, useState, type ReactNode } from 'react';
import { compassRose, dataUrl } from '../art/svg';
import { cssColor, describeTarget, formatGameDuration, playerColor } from '../game/format';
import { gameSocket } from '../net/socket';
import { useGameStore, type ConnectionStatus } from '../state/store';
import { CardArt, ResourceIcon, ShieldIcon, StarIcon, SunIcon, TroopIcon } from './icons';
import { Button, Panel, SectionLabel } from './Panel';
import { SelectionContent } from './SelectionPanel';

const STATUS_STYLES: Record<ConnectionStatus, { label: string; dot: string }> = {
  idle: { label: 'Offline', dot: 'bg-ink-soft' },
  connecting: { label: 'Verbinde…', dot: 'bg-[#d9a21b] animate-pulse' },
  open: { label: 'Verbunden', dot: 'bg-moss' },
  closed: { label: 'Verbinde neu…', dot: 'bg-seal animate-pulse' },
};
const NOTICE_MS = 4_000;

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

function TopBar({ view }: { view: GameView }) {
  const status = useGameStore((s) => s.status);
  const latencyMs = useGameStore((s) => s.latencyMs);
  const { label, dot } = STATUS_STYLES[status];
  const { clock, self } = view;
  const me = view.players.find((p) => p.id === self.id);
  const away = view.armies
    .filter((a) => a.ownerId === self.id)
    .reduce((sum, a) => sum + (a.troops ?? 0), 0);
  const vp = me?.victoryPoints ?? 0;
  const clockLabel = clock.paused
    ? 'vom Admin pausiert'
    : clock.running
      ? 'Spielzeit läuft'
      : 'Ruhezeit (Mo–Fr 10–18 Uhr)';

  return (
    <header className="pointer-events-auto flex flex-wrap items-center gap-x-3 gap-y-1 border-b-[3px] border-double border-ink bg-parchment-dark px-4 py-1.5 shadow-[0_2px_0_rgba(59,42,24,0.25)]">
      <span className="mr-2 text-xl font-bold italic">Vectoria</span>
      <span className="flex items-center gap-2 leading-tight">
        <SunIcon size={22} lit={clock.running} />
        <span>
          <b>Spieltag {clock.gameday}</b>
          <span className="block text-xs text-ink-soft">
            {clockLabel}
            {clock.timeScale !== 1 && <span className="text-seal"> · {clock.timeScale}×</span>}
          </span>
        </span>
      </span>
      <span className="mx-auto flex items-center gap-2">
        {RESOURCES.map((r) => (
          <Stat key={r} title={RESOURCE_NAMES[r]} icon={<ResourceIcon resource={r} size={26} />}>
            {self.resources[r]}
          </Stat>
        ))}
        <Stat
          title="Truppen zu Hause (unterwegs)"
          icon={<TroopIcon size={24} />}
          extra={away > 0 ? `+${away}` : undefined}
        >
          {me?.homeTroops ?? 0}
        </Stat>
      </span>
      <Stat title="Siegpunkte" icon={<StarIcon size={24} />}>
        {vp}
        <span className="text-sm font-normal text-ink-soft"> / {view.victoryPointsToWin}</span>
        <span className="ml-2 inline-block h-2 w-16 border border-ink bg-parchment-deep align-middle">
          <span
            className="block h-full bg-seal"
            style={{ width: `${Math.min(100, (vp / view.victoryPointsToWin) * 100)}%` }}
          />
        </span>
      </Stat>
      <span className="flex items-center gap-1.5 text-xs text-ink-soft" title={label}>
        <span className={`h-2.5 w-2.5 rounded-full border border-ink/60 ${dot}`} />
        {status === 'open' && latencyMs !== null ? `${Math.round(latencyMs)} ms` : label}
      </span>
    </header>
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
      className="flex items-center gap-1.5 border border-ink/40 bg-parchment px-2 py-0.5 text-lg font-bold tabular-nums"
    >
      {icon}
      {children}
      {extra && <span className="text-sm font-normal text-ink-soft">{extra}</span>}
    </span>
  );
}

function RealmPanel({ view }: { view: GameView }) {
  const { self } = view;
  const buy = (item: 'troops' | 'victoryPoint', count: number) =>
    gameSocket.send({ type: 'buy', item, count });

  return (
    <Panel title="Dein Reich">
      <SectionLabel>Basisaktivität</SectionLabel>
      <div className="grid grid-cols-3 gap-1.5">
        {RESOURCES.map((r) => (
          <Button
            key={r}
            variant={self.pendingActivity === r ? 'selected' : 'default'}
            className="flex items-center justify-center gap-1 px-1"
            onClick={() => gameSocket.send({ type: 'setActivity', resource: r })}
          >
            <ResourceIcon resource={r} size={18} />
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

      <SectionLabel>Kaufen</SectionLabel>
      <div className="space-y-1.5">
        <div className="flex items-center justify-between gap-2">
          <span className="flex flex-col">
            <span className="flex items-center gap-1">
              <TroopIcon size={18} /> {TROOP_BATCH_SIZE} Truppen
            </span>
            <span className="text-xs text-ink-soft">
              <Cost cost={TROOP_BATCH_COST} />
            </span>
          </span>
          <div className="flex gap-1">
            {[1, 5].map((n) => (
              <Button
                key={n}
                onClick={() => buy('troops', n)}
                disabled={!canAfford(self.resources, TROOP_BATCH_COST, n)}
              >
                {n}×
              </Button>
            ))}
          </div>
        </div>
        <div className="flex items-center justify-between gap-2">
          <span className="flex flex-col">
            <span className="flex items-center gap-1">
              <StarIcon size={18} /> 1 Siegpunkt
            </span>
            <span className="text-xs text-ink-soft">
              <Cost cost={VICTORY_POINT_COST} />
            </span>
          </span>
          <Button
            variant="primary"
            onClick={() => buy('victoryPoint', 1)}
            disabled={!canAfford(self.resources, VICTORY_POINT_COST)}
          >
            1×
          </Button>
        </div>
      </div>
    </Panel>
  );
}

/** The player's special cards as a hand of illustrated cards along the bottom edge. */
function CardHand({ view }: { view: GameView }) {
  const counts = new Map<CardType, number>();
  for (const card of view.self.cards) counts.set(card, (counts.get(card) ?? 0) + 1);
  if (counts.size === 0) return null;
  return (
    <div className="pointer-events-auto flex items-end gap-2">
      {[...counts].map(([card, count]) => {
        const info = CARDS[card];
        const instant = info.use === 'instant';
        return (
          <div
            key={card}
            title={info.description}
            className="relative w-24 border border-ink bg-parchment p-[3px] shadow-[2px_3px_0_rgba(59,42,24,0.35)]"
          >
            <CardArt card={card} className="h-12 w-full" />
            <div className="pt-1 text-center text-xs italic">{info.name}</div>
            {instant ? (
              <Button
                variant="primary"
                className="mt-1 w-full px-1 py-0.5 text-xs"
                onClick={() => gameSocket.send({ type: 'playCard', card })}
              >
                Ausspielen
              </Button>
            ) : (
              <div className="pb-0.5 text-center text-[10px] leading-tight text-ink-soft">
                beim Entsenden
              </div>
            )}
            {count > 1 && (
              <span className="absolute -top-2 -right-2 flex h-5 min-w-5 items-center justify-center rounded-full border border-ink bg-seal px-1 text-xs text-parchment">
                {count}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
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
            <span className="block text-xs text-ink-soft">
              {army.status === 'stationed'
                ? 'baut ab'
                : `${army.status === 'returning' ? 'Rückweg' : 'Ankunft'} in ${formatGameDuration(
                    (army.arriveClock ?? view.clock.clock) - view.clock.clock,
                  )}`}
            </span>
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

function Chronicle({ view }: { view: GameView }) {
  if (view.self.log.length === 0) {
    return <p className="py-2 text-ink-soft italic">Noch nichts geschehen.</p>;
  }
  return (
    <ul className="divide-y divide-ink/15">
      {view.self.log.map((entry, i) => (
        <li key={`${entry.at}-${i}`} className="flex gap-2 py-1">
          <span className="shrink-0 text-ink-soft tabular-nums">
            {new Date(entry.at).toLocaleTimeString('de-DE', {
              hour: '2-digit',
              minute: '2-digit',
            })}
          </span>
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
    <div className="pointer-events-auto flex max-h-full min-h-0 flex-col border border-ink bg-parchment text-sm shadow-[2px_3px_0_rgba(59,42,24,0.35)]">
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

function Notice() {
  const notice = useGameStore((s) => s.notice);
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => useGameStore.setState({ notice: null }), NOTICE_MS);
    return () => clearTimeout(timer);
  }, [notice]);
  if (!notice) return null;
  return (
    <div className="pointer-events-auto absolute top-16 left-1/2 -translate-x-1/2 border border-ink bg-seal px-4 py-2 text-sm text-parchment shadow-[2px_3px_0_rgba(59,42,24,0.35)]">
      {notice.text}
    </div>
  );
}

function EndBanner({ view }: { view: GameView }) {
  if (view.phase !== 'ended') return null;
  const winner = view.players.find((p) => p.id === view.winnerId);
  return (
    <Panel className="text-center text-lg italic">
      Spielende —{' '}
      {winner ? `${winner.name} gewinnt mit ${winner.victoryPoints} Siegpunkten!` : 'kein Sieger.'}
    </Panel>
  );
}

const COMPASS_URL = dataUrl(compassRose());

function CompassRose() {
  return <img src={COMPASS_URL} alt="" className="h-28 w-auto" draggable={false} />;
}

/**
 * HTML overlay above the canvas. The root ignores pointer events so map input passes through;
 * panels opt back in with `pointer-events-auto`.
 */
export function Hud() {
  const view = useGameStore((s) => s.view);
  if (!view) return null;
  return (
    <div className="pointer-events-none absolute inset-0 flex flex-col">
      <TopBar view={view} />
      <div className="relative flex min-h-0 flex-1 justify-between gap-4 p-3">
        <div className="flex w-72 min-h-0 flex-col gap-3">
          <RealmPanel view={view} />
          <div className="mt-auto">
            <CardHand view={view} />
          </div>
        </div>
        <div className="flex flex-1 flex-col items-center justify-end">
          <EndBanner view={view} />
        </div>
        <div className="flex w-80 min-h-0 flex-col items-stretch gap-3">
          <Sidebar view={view} />
          <div className="mt-auto flex justify-end">
            <CompassRose />
          </div>
        </div>
        <Notice />
      </div>
    </div>
  );
}
