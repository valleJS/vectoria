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
import { useEffect } from 'react';
import { cssColor, describeTarget, formatGameDuration, playerColor } from '../game/format';
import { gameSocket } from '../net/socket';
import { useGameStore, type ConnectionStatus } from '../state/store';
import { Button, Panel } from './Panel';
import { SelectionPanel } from './SelectionPanel';

const STATUS_STYLES: Record<ConnectionStatus, { label: string; dot: string }> = {
  idle: { label: 'Offline', dot: 'bg-slate-500' },
  connecting: { label: 'Verbinde…', dot: 'bg-amber-400 animate-pulse' },
  open: { label: 'Verbunden', dot: 'bg-emerald-400' },
  closed: { label: 'Verbinde neu…', dot: 'bg-rose-500 animate-pulse' },
};
const NOTICE_MS = 4_000;

function costText(cost: Resources): string {
  return RESOURCES.filter((r) => cost[r] > 0)
    .map((r) => `${cost[r]} ${RESOURCE_NAMES[r]}`)
    .join(' + ');
}

function StatusPanel({ view }: { view: GameView }) {
  const status = useGameStore((s) => s.status);
  const latencyMs = useGameStore((s) => s.latencyMs);
  const { label, dot } = STATUS_STYLES[status];
  const { clock } = view;
  const clockLabel = clock.paused
    ? 'vom Admin pausiert'
    : clock.running
      ? 'Spielzeit läuft'
      : 'außerhalb der Spielzeit (Mo–Fr 10–18)';
  return (
    <Panel>
      <div className="font-semibold tracking-wide">Vectoria</div>
      <div className="mt-1 flex items-center gap-2 text-slate-300">
        <span className={`h-2 w-2 rounded-full ${dot}`} />
        {label}
        {status === 'open' && latencyMs !== null && (
          <span className="text-slate-400">· {Math.round(latencyMs)} ms</span>
        )}
      </div>
      <div className="mt-1 text-slate-300">
        Gameday {clock.gameday} ·{' '}
        <span className={clock.running ? 'text-emerald-300' : 'text-slate-400'}>{clockLabel}</span>
        {clock.timeScale !== 1 && <span className="text-amber-300"> · {clock.timeScale}×</span>}
      </div>
    </Panel>
  );
}

function EconomyPanel({ view }: { view: GameView }) {
  const { self } = view;
  const me = view.players.find((p) => p.id === self.id);
  const away = view.armies
    .filter((a) => a.ownerId === self.id)
    .reduce((sum, a) => sum + (a.troops ?? 0), 0);
  const buy = (item: 'troops' | 'victoryPoint', count: number) =>
    gameSocket.send({ type: 'buy', item, count });

  return (
    <Panel title="Dein Reich">
      <div className="grid grid-cols-3 gap-2 tabular-nums">
        {RESOURCES.map((r) => (
          <div key={r} className="rounded bg-slate-800 px-2 py-1 text-center">
            <div className="text-lg font-semibold">{self.resources[r]}</div>
            <div className="text-xs text-slate-400">{RESOURCE_NAMES[r]}</div>
          </div>
        ))}
      </div>
      <div className="mt-2 text-slate-300 tabular-nums">
        {me?.homeTroops ?? 0} Truppen zu Hause · {away} unterwegs ·{' '}
        <span className="font-semibold text-amber-300">
          {me?.victoryPoints ?? 0} / {view.victoryPointsToWin} SP
        </span>
      </div>

      <div className="mt-3 text-xs font-semibold tracking-wider text-slate-400 uppercase">
        Basisaktivität
      </div>
      <div className="mt-1 flex gap-1.5">
        {RESOURCES.map((r) => (
          <Button
            key={r}
            variant={self.pendingActivity === r ? 'primary' : 'default'}
            onClick={() => gameSocket.send({ type: 'setActivity', resource: r })}
          >
            {RESOURCE_NAMES[r]}
          </Button>
        ))}
      </div>
      <div className="mt-1 text-xs text-slate-400">
        Heute:{' '}
        {self.activity ? `${RESOURCE_NAMES[self.activity]} (+${DAILY_ACTIVITY_INCOME})` : '—'}
        {self.pendingActivity && self.pendingActivity !== self.activity && (
          <> · ab nächstem Gameday: {RESOURCE_NAMES[self.pendingActivity]}</>
        )}
      </div>

      <div className="mt-3 text-xs font-semibold tracking-wider text-slate-400 uppercase">
        Kaufen
      </div>
      <div className="mt-1 space-y-1.5">
        <div className="flex items-center justify-between gap-2">
          <span className="text-slate-300">
            {TROOP_BATCH_SIZE} Truppen{' '}
            <span className="text-slate-500">({costText(TROOP_BATCH_COST)})</span>
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
          <span className="text-slate-300">
            1 Siegpunkt <span className="text-slate-500">({costText(VICTORY_POINT_COST)})</span>
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

function CardsPanel({ view }: { view: GameView }) {
  const counts = new Map<CardType, number>();
  for (const card of view.self.cards) counts.set(card, (counts.get(card) ?? 0) + 1);
  if (counts.size === 0) return null;
  return (
    <Panel title="Spezialkarten">
      <ul className="space-y-1.5">
        {[...counts].map(([card, count]) => (
          <li key={card} className="flex items-start justify-between gap-2">
            <div>
              <div className="font-medium">
                {CARDS[card].name} {count > 1 && <span className="text-slate-400">×{count}</span>}
              </div>
              <div className="text-xs text-slate-400">{CARDS[card].description}</div>
            </div>
            {CARDS[card].use === 'instant' ? (
              <Button onClick={() => gameSocket.send({ type: 'playCard', card })}>Spielen</Button>
            ) : (
              <span className="shrink-0 text-xs text-slate-500">beim Losschicken</span>
            )}
          </li>
        ))}
      </ul>
    </Panel>
  );
}

function ArmiesPanel({ view }: { view: GameView }) {
  const select = useGameStore((s) => s.select);
  const mine = view.armies.filter((a) => a.ownerId === view.self.id);
  if (mine.length === 0) return null;
  return (
    <Panel title="Deine Truppenzüge">
      <ul className="space-y-1">
        {mine.map((army) => (
          <li key={army.id} className="flex items-center justify-between gap-2">
            <button
              type="button"
              className="text-left hover:text-amber-300"
              onClick={() => select({ kind: 'army', id: army.id })}
            >
              <span className="tabular-nums">{army.troops}</span> →{' '}
              {describeTarget(view, army.target)}
              <span className="text-slate-400">
                {army.arriveClock !== null
                  ? ` · ${formatGameDuration(army.arriveClock - view.clock.clock)}`
                  : ' · baut ab'}
              </span>
            </button>
            {army.status !== 'returning' && (
              <Button onClick={() => gameSocket.send({ type: 'recallArmy', armyId: army.id })}>
                ↩
              </Button>
            )}
          </li>
        ))}
      </ul>
    </Panel>
  );
}

function Leaderboard({ view }: { view: GameView }) {
  const ranked = [...view.players].sort((a, b) => b.victoryPoints - a.victoryPoints);
  return (
    <Panel title={`Rangliste · Ziel ${view.victoryPointsToWin} SP`}>
      <ol className="space-y-0.5 tabular-nums">
        {ranked.map((p) => (
          <li key={p.id} className="flex items-center justify-between gap-3">
            <span className="flex items-center gap-1.5">
              <span
                className="h-2.5 w-2.5 rounded-sm"
                style={{ background: cssColor(playerColor(p.id, view.self.id)) }}
              />
              <span className={p.online ? '' : 'text-slate-500'}>{p.name}</span>
            </span>
            <span className="font-semibold">{p.victoryPoints}</span>
          </li>
        ))}
      </ol>
    </Panel>
  );
}

function LogPanel({ view }: { view: GameView }) {
  if (view.self.log.length === 0) return null;
  return (
    <Panel title="Ereignisse" className="max-h-48 overflow-y-auto">
      <ul className="space-y-0.5">
        {view.self.log.map((entry, i) => (
          <li key={`${entry.at}-${i}`} className="text-slate-300">
            <span className="text-slate-500 tabular-nums">
              {new Date(entry.at).toLocaleTimeString('de-DE', {
                hour: '2-digit',
                minute: '2-digit',
              })}
            </span>{' '}
            {entry.text}
          </li>
        ))}
      </ul>
    </Panel>
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
    <div className="pointer-events-auto absolute top-4 left-1/2 -translate-x-1/2 rounded-lg bg-rose-700/95 px-4 py-2 text-sm shadow-lg">
      {notice.text}
    </div>
  );
}

function EndBanner({ view }: { view: GameView }) {
  if (view.phase !== 'ended') return null;
  const winner = view.players.find((p) => p.id === view.winnerId);
  return (
    <Panel className="text-center text-base">
      Spielende —{' '}
      {winner ? `${winner.name} gewinnt mit ${winner.victoryPoints} SP!` : 'kein Sieger.'}
    </Panel>
  );
}

/**
 * HTML overlay above the canvas. The root ignores pointer events so map input passes through;
 * panels opt back in with `pointer-events-auto`.
 */
export function Hud() {
  const view = useGameStore((s) => s.view);
  if (!view) return null;
  return (
    <div className="pointer-events-none absolute inset-0 flex justify-between gap-4 p-4">
      <div className="flex w-80 flex-col gap-3 overflow-y-auto">
        <StatusPanel view={view} />
        <EconomyPanel view={view} />
        <CardsPanel view={view} />
        <LogPanel view={view} />
      </div>
      <div className="flex flex-1 flex-col items-center justify-end">
        <EndBanner view={view} />
      </div>
      <div className="flex w-80 flex-col gap-3 overflow-y-auto">
        <Leaderboard view={view} />
        <SelectionPanel view={view} />
        <ArmiesPanel view={view} />
      </div>
      <Notice />
    </div>
  );
}
