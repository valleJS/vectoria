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
import {
  BannerIcon,
  CardArt,
  ResourceIcon,
  ShieldIcon,
  StarIcon,
  SunIcon,
  TroopIcon,
} from './icons';
import { Button, Panel, SectionLabel } from './Panel';
import { SelectionPanel } from './SelectionPanel';

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
    <header className="pointer-events-auto flex flex-wrap items-center gap-x-6 gap-y-1 border-b-[3px] border-double border-ink bg-parchment-dark px-4 py-1.5 shadow-[0_2px_0_rgba(59,42,24,0.25)]">
      <span className="text-xl font-bold italic">Vectoria</span>
      <span className="flex items-center gap-1.5">
        <SunIcon lit={clock.running} />
        Spieltag {clock.gameday}
        <span className="text-sm text-ink-soft">· {clockLabel}</span>
        {clock.timeScale !== 1 && (
          <span className="text-sm text-seal">· {clock.timeScale}× schneller</span>
        )}
      </span>
      <span className="flex items-center gap-4 text-lg font-bold tabular-nums">
        {RESOURCES.map((r) => (
          <span key={r} className="flex items-center gap-1" title={RESOURCE_NAMES[r]}>
            <ResourceIcon resource={r} size={24} title={RESOURCE_NAMES[r]} />
            {self.resources[r]}
          </span>
        ))}
      </span>
      <span className="flex items-center gap-1 tabular-nums" title="Truppen zu Hause · unterwegs">
        <TroopIcon />
        <b className="text-lg">{me?.homeTroops ?? 0}</b>
        {away > 0 && <span className="text-ink-soft">+ {away} unterwegs</span>}
      </span>
      <span className="ml-auto flex items-center gap-2 tabular-nums" title="Siegpunkte">
        <StarIcon size={22} />
        <b className="text-lg">
          {vp} / {view.victoryPointsToWin}
        </b>
        <span className="h-2 w-20 border border-ink bg-parchment-deep">
          <span
            className="block h-full bg-seal"
            style={{ width: `${Math.min(100, (vp / view.victoryPointsToWin) * 100)}%` }}
          />
        </span>
      </span>
      <span className="flex items-center gap-1.5 text-sm text-ink-soft" title={label}>
        <span className={`h-2.5 w-2.5 rounded-full border border-ink/60 ${dot}`} />
        {status === 'open' && latencyMs !== null ? `${Math.round(latencyMs)} ms` : label}
      </span>
    </header>
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

function ArmiesPanel({ view }: { view: GameView }) {
  const select = useGameStore((s) => s.select);
  const mine = view.armies.filter((a) => a.ownerId === view.self.id);
  if (mine.length === 0) return null;
  const color = cssColor(playerColor(view, view.self.id));
  return (
    <Panel title="Deine Heerzüge" icon={<BannerIcon color={color} size={20} />}>
      <ul className="space-y-1">
        {mine.map((army) => (
          <li key={army.id} className="flex items-center justify-between gap-2">
            <button
              type="button"
              className="text-left hover:text-seal"
              onClick={() => select({ kind: 'army', id: army.id })}
            >
              <b className="tabular-nums">{army.troops}</b> → {describeTarget(view, army.target)}
              <span className="text-ink-soft">
                {army.arriveClock !== null
                  ? ` · ${formatGameDuration(army.arriveClock - view.clock.clock)}`
                  : ' · baut ab'}
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
    </Panel>
  );
}

function Leaderboard({ view }: { view: GameView }) {
  const ranked = [...view.players].sort((a, b) => b.victoryPoints - a.victoryPoints);
  return (
    <Panel title="Rangliste" icon={<StarIcon size={18} />}>
      <ol className="space-y-1 tabular-nums">
        {ranked.map((p) => {
          const color = cssColor(playerColor(view, p.id));
          return (
            <li key={p.id} className="flex items-center gap-2">
              <ShieldIcon color={color} />
              <span
                className={`min-w-0 flex-1 truncate ${p.online ? '' : 'text-ink-soft italic'} ${p.id === view.self.id ? 'font-bold' : ''}`}
              >
                {p.name}
              </span>
              <span className="h-1.5 w-14 border border-ink/50 bg-parchment-deep">
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
    </Panel>
  );
}

function Chronicle({ view }: { view: GameView }) {
  if (view.self.log.length === 0) return null;
  return (
    <Panel title="Chronik" className="flex min-h-0 flex-col">
      <ul className="max-h-48 space-y-0.5 overflow-y-auto">
        {view.self.log.map((entry, i) => (
          <li key={`${entry.at}-${i}`}>
            <span className="text-ink-soft tabular-nums">
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

function CompassRose() {
  return (
    <svg viewBox="-32 -36 64 68" className="h-20 w-20 opacity-90" aria-hidden>
      <circle r={22} fill="#f3e7c4" fillOpacity={0.85} stroke="#3b2a18" />
      <path d="M0-28L5 0L0 28L-5 0Z" fill="#d4472f" stroke="#3b2a18" strokeWidth={0.8} />
      <path d="M-28 0L0-5L28 0L0 5Z" fill="#3b6ea5" stroke="#3b2a18" strokeWidth={0.8} />
      <text
        y={-30}
        textAnchor="middle"
        fontFamily="Georgia, serif"
        fontSize={9}
        fontWeight="bold"
        fill="#3b2a18"
      >
        N
      </text>
    </svg>
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
    <div className="pointer-events-none absolute inset-0 flex flex-col">
      <TopBar view={view} />
      <div className="relative flex min-h-0 flex-1 justify-between gap-4 p-3">
        <div className="flex w-72 min-h-0 flex-col gap-3">
          <RealmPanel view={view} />
          <Chronicle view={view} />
          <div className="mt-auto">
            <CardHand view={view} />
          </div>
        </div>
        <div className="flex flex-1 flex-col items-center justify-end">
          <EndBanner view={view} />
        </div>
        <div className="flex w-80 min-h-0 flex-col gap-3 overflow-y-auto">
          <SelectionPanel view={view} />
          <ArmiesPanel view={view} />
          <Leaderboard view={view} />
          <div className="mt-auto flex justify-end">
            <CompassRose />
          </div>
        </div>
        <Notice />
      </div>
    </div>
  );
}
