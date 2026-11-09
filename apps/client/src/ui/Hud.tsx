import {
  canAfford,
  CARDS,
  DAILY_ACTIVITY_INCOME,
  hasResources,
  RESOURCE_NAMES,
  RESOURCES,
  TROOP_BATCH_COST,
  TROOP_BATCH_SIZE,
  victoryPointCost,
  victoryPointTrophiesNeeded,
  VICTORY_POINTS_PER_GAMEDAY,
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
  formatEta,
  formatResources,
  ownBases,
  playerColor,
  playerHeraldry,
  type BaseInfo,
} from '../game/format';
import { isNightRest } from '../game/night';
import { gameSocket } from '../net/socket';
import { useGameStore, type ConnectionStatus } from '../state/store';
import {
  AlarmIcon,
  CaravanIcon,
  SoldiersIcon,
  CardArt,
  CastleIcon,
  OutpostIcon,
  ChestIcon,
  OnlineDot,
  ResourceIcon,
  ShieldIcon,
  StarIcon,
  SunIcon,
  TrophyIcon,
} from './icons';
import { BribeBanner, CardProfile } from './CardFace';
import { ChestOpening } from './ChestOpening';
import { TraderMenu } from './TraderMenu';
import { Handbook, HandbookButton, HandbookCorner } from './Handbook';
import { RuleChanges, RuleChangesButton } from './RuleChanges';
import { compactQuery } from './layout';
import { Badge } from '@/components/ui/badge';
import { Card, CardHeader } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button, SectionLabel, Tip } from './Panel';
import { ChevronDownIcon, ChevronRightIcon, MoonIcon, Undo2Icon, XIcon } from 'lucide-react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Progress } from '@/components/ui/progress';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Locked } from './Routed';
import { SelectionContent } from './SelectionPanel';
import { pactsToAnswer, useDuoNotices } from '../game/duo';
import { Inbox } from './Duo';

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

/** Game-wide status only: title, gameday clock, connection. Personal stats live in RealmBox. */
function TopBar({ view, compact }: { view: GameView; compact: boolean }) {
  const status = useGameStore((s) => s.status);
  const latencyMs = useGameStore((s) => s.latencyMs);
  const { label, dot } = STATUS_STYLES[status];
  const { clock } = view;
  const clockLabel = clock.paused
    ? 'vom Admin pausiert'
    : clock.breakToday
      ? 'Pausentag — heute ruht das Spiel'
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
      <span className="flex shrink-0 items-center gap-1.5">
        <img
          src="/favicon.svg"
          alt=""
          className={`-my-1 w-auto ${compact ? 'h-7' : 'h-8'}`}
          draggable={false}
        />
        <span className={`font-bold italic ${compact ? 'text-lg' : 'text-xl'}`}>Vectoria</span>
      </span>
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
      {!compact && isNightRest(view) && <NightNote />}
      <Tip label={label}>
        <span
          className="ml-auto flex items-center gap-1.5 text-xs text-ink-soft"
          aria-label={label}
        >
          <span className={`h-2.5 w-2.5 rounded-full border border-ink/60 ${dot}`} />
          {compact
            ? null
            : status === 'open' && latencyMs !== null
              ? `${Math.round(latencyMs)} ms`
              : label}
        </span>
      </Tip>
      {!compact && <RoutedBadge view={view} compact={false} />}
      {compact && (
        <span className="flex shrink-0 items-center gap-1">
          <RuleChangesButton compact />
          <HandbookButton />
        </span>
      )}
    </header>
  );
}

/** Seal-red "Handlungsunfähig" stamp in the top bar while the own troops retreat home. */
function RoutedBadge({ view, compact }: { view: GameView; compact: boolean }) {
  if (!view.players.find((p) => p.id === view.self.id)?.routed) return null;
  const away = view.armies
    .filter((a) => a.ownerId === view.self.id)
    .reduce((sum, a) => sum + (a.troops ?? 0), 0);
  const detail = `Burg gefallen — noch ${away} Truppen auf dem Rückzug`;
  return (
    <Tip label={detail}>
      {/* Top bar: may shrink and truncate. Phone banner: full detail, wrapping. */}
      <span
        className={`pointer-events-auto animate-pulse border-2 border-seal bg-parchment px-2 py-0.5 text-xs font-bold tracking-wider text-seal uppercase ${
          compact ? 'max-w-full text-center' : 'min-w-0 truncate'
        }`}
      >
        Handlungsunfähig
        <span className="ml-2 font-normal tracking-normal normal-case">{detail}</span>
      </span>
    </Tip>
  );
}

/** Chevron button that folds a box open or shut. */
function FoldToggle({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  return (
    <Button
      variant="ghost"
      size="icon-sm"
      className="text-ink-soft"
      onClick={onToggle}
      aria-expanded={open}
      aria-label={open ? 'Einklappen' : 'Ausklappen'}
    >
      {open ? <ChevronDownIcon /> : <ChevronRightIcon />}
    </Button>
  );
}

/** Icon + big number in a framed chip; the title is its tooltip and accessible label. */
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
    <Tip label={title}>
      <span
        aria-label={title}
        className="flex items-center justify-center gap-1 rounded-sm border border-ink/40 bg-muted/60 px-1.5 py-0.5 text-base font-bold tabular-nums"
      >
        {icon}
        {children}
        {extra && <span className="text-xs font-normal text-ink-soft">{extra}</span>}
      </span>
    </Tip>
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
          <Tip key={card} label={info.description}>
            <Button
              variant="plain"
              onClick={() => showCard(card)}
              className={`relative block w-[4.6rem] rounded-sm border bg-card p-[2px] font-normal whitespace-normal hover:-translate-y-0.5 hover:shadow-[1px_2px_0_rgba(59,42,24,0.35)] ${
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
              {count > 1 && <Badge className="absolute -top-2 -right-2 border-ink">{count}</Badge>}
            </Button>
          </Tip>
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
  const owned = view.players.find((p) => p.id === self.id)?.victoryPoints ?? 0;
  const vpCost = victoryPointCost(owned);
  const trophies = view.players.find((p) => p.id === self.id)?.trophies ?? 0;
  const vpTrophies = victoryPointTrophiesNeeded(owned);
  const vpLeft = Math.max(0, VICTORY_POINTS_PER_GAMEDAY - self.victoryPointsToday);
  return (
    <>
      <BaseStats view={view} base={base} />
      <div className="mt-1 text-xs text-ink-soft">Unterwegs: {field} Truppen</div>
      {hasResources(self.caravan) && (
        <div className="mt-0.5 flex items-center gap-1.5 text-xs text-[#8a6410]">
          <CaravanIcon color={cssColor(playerColor(view, self.id))} size={20} />
          <span>
            Karawane unterwegs: {formatResources(self.caravan)} — morgen früh in der Basis
          </span>
        </div>
      )}
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
            <StarIcon size={16} /> {owned + 1}. Siegpunkt
            <span className="ml-1 text-xs text-ink-soft">
              {vpLeft > 0 ? (
                <span className="inline-flex items-center gap-1.5">
                  <Cost cost={vpCost} />
                  {vpTrophies > 0 && (
                    <Tip label={`Braucht ${vpTrophies} Trophäen (werden nicht verbraucht)`}>
                      <span
                        className={`inline-flex items-center gap-0.5 tabular-nums ${trophies < vpTrophies ? 'text-seal' : ''}`}
                      >
                        ab {vpTrophies}
                        <TrophyIcon size={16} />
                      </span>
                    </Tip>
                  )}
                </span>
              ) : (
                'heute keiner mehr'
              )}
            </span>
          </span>
          <Button
            variant="primary"
            className="px-2 py-0.5"
            onClick={() => buy('victoryPoint', 1)}
            disabled={vpLeft === 0 || !canAfford(self.resources, vpCost) || trophies < vpTrophies}
            title={`Noch ${vpLeft} von ${VICTORY_POINTS_PER_GAMEDAY} Siegpunkten heute`}
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
        Ausgeben lässt sich nur, was in der Basis lagert. Um 18 Uhr bringt die Karawane das Lager
        hier heim.
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
  const heraldry = playerHeraldry(view, view.self.id);
  const color = cssColor(heraldry.color);
  const style = heraldry.style;
  return (
    <Collapsible
      open={open}
      onOpenChange={setOpen}
      className="mt-2 rounded-sm border border-ink/40"
    >
      <CollapsibleTrigger className="flex w-full cursor-pointer items-center gap-1.5 bg-muted/60 px-2 py-1 text-left outline-none hover:text-seal focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-inset">
        {base.id === null ? (
          <CastleIcon color={color} style={style} size={18} />
        ) : (
          <OutpostIcon color={color} size={18} />
        )}
        <b className="shrink-0 italic">{base.name}</b>
        <span className="min-w-0 flex-1 truncate text-right text-xs text-ink-soft tabular-nums">
          {base.troops} Tr. · {formatResources(base.resources, 'leer')}
        </span>
        {open ? (
          <ChevronDownIcon className="size-4 text-ink-soft" />
        ) : (
          <ChevronRightIcon className="size-4 text-ink-soft" />
        )}
      </CollapsibleTrigger>
      <CollapsibleContent className="px-2 pt-1.5 pb-2">
        {base.id === null ? (
          <HomeBase view={view} base={base} />
        ) : (
          <OutpostBase view={view} base={base} />
        )}
      </CollapsibleContent>
    </Collapsible>
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
    <Card className="pointer-events-auto min-h-0">
      <CardHeader className="border-b border-ink/40 bg-muted py-1.5">
        <ShieldIcon color={cssColor(playerColor(view, self.id))} size={18} />
        <b className="min-w-0 flex-1 truncate italic">{self.name}</b>
        <Tip label="Trophäen — für jeden 4. Siegpunkt nötig">
          <span className="flex items-center gap-0.5 tabular-nums">
            <TrophyIcon size={18} />
            <b>{me?.trophies ?? 0}</b>
          </span>
        </Tip>
        <Tip label="Siegpunkte">
          <span className="flex items-center gap-1 tabular-nums">
            <StarIcon size={18} />
            <b>{vp}</b>
            <span className="text-xs text-ink-soft">/ {view.victoryPointsToWin}</span>
          </span>
        </Tip>
        {collapsible && <FoldToggle open={open} onToggle={() => setOpen(!open)} />}
      </CardHeader>
      {open && (
        <div className="min-h-0 overflow-y-auto px-3 pt-2 pb-2.5">
          <div className="flex items-center justify-between text-xs text-ink-soft">
            <span>Fortschritt zum Sieg</span>
            <Progress
              value={(vp / view.victoryPointsToWin) * 100}
              className="h-1.5 w-28"
              indicatorClassName="bg-seal"
              aria-label="Fortschritt zum Sieg"
            />
          </div>

          {me?.routed && (
            <div className="mt-2 border border-seal px-2 py-1.5 text-sm text-seal">
              <b>Deine Burg ist gefallen.</b> Deine Stützpunkte sind aufgegeben, alle Züge ziehen
              sich zurück — bis alle Truppen daheim sind, kannst du nichts tun.
            </div>
          )}

          <Locked>
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
          </Locked>

          <div className="mt-2 text-right">
            <Button
              variant="link"
              className="text-xs"
              onClick={() => {
                if (
                  window.confirm('Abmelden? Du kannst dich jederzeit per E-Mail wieder anmelden.')
                ) {
                  setToken(null);
                }
              }}
            >
              Abmelden
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}

function armyStatusText(view: GameView, army: ArmyView): string {
  const left = formatEta(view.clock, army.arriveClock - view.clock.clock);
  switch (army.status) {
    case 'gathering':
      return `sammelt bis ${left}`;
    case 'returning':
      return (
        `Heimweg, zurück ${left}` +
        (hasResources(army.cargo) ? ` · ${formatResources(army.cargo)}` : '')
      );
    case 'outbound':
      if (army.joining) return `stößt zu deinem Zug: ${left}`;
      return `${army.target?.kind === 'army' ? 'Überfall' : 'Ankunft'} ${left}`;
    case 'waiting':
      if (army.duoWith) return `wartet am Duo-Treffpunkt bis ${left}`;
      return army.joining ? 'wartet auf deinen Zug' : 'wartet auf übergelaufene Truppen';
  }
}

function ArmiesList({ view }: { view: GameView }) {
  const select = useGameStore((s) => s.select);
  // Own armies, and a duo army the player is part of (led by the other side).
  const mine = view.armies.filter(
    (a) => a.ownerId === view.self.id || (a.duoWith === view.self.id && a.status === 'outbound'),
  );
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
          <Button
            variant="plain"
            className="block min-w-0 shrink text-left font-normal whitespace-normal hover:text-seal"
            onClick={() => select({ kind: 'army', id: army.id })}
          >
            <b className="tabular-nums">{army.troops}</b> → {describeTarget(view, army.target)}
            <span className="block text-xs text-ink-soft">{armyStatusText(view, army)}</span>
          </Button>
          {army.status !== 'returning' && !army.duoWith && (
            <Tip label="Zurückrufen">
              <Button
                size="icon-sm"
                aria-label="Zurückrufen"
                onClick={() => gameSocket.send({ type: 'recallArmy', armyId: army.id })}
              >
                <Undo2Icon />
              </Button>
            </Tip>
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
                className={`min-w-0 flex-1 truncate ${p.id === view.self.id ? 'font-bold' : ''}`}
              >
                {p.name}
              </span>
              <OnlineDot online={p.online} />
              <Tip label={`${p.trophies} Trophäen`}>
                <span className="flex items-center gap-0.5 text-xs text-ink-soft">
                  <TrophyIcon size={14} />
                  {p.trophies}
                </span>
              </Tip>
              <Progress
                value={(p.victoryPoints / view.victoryPointsToWin) * 100}
                indicatorColor={color}
                className="h-1.5 w-16"
                aria-label={`Siegpunkte ${p.name}`}
              />
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
    <Card className="pointer-events-auto min-h-0">
      <Tabs
        value={tab}
        onValueChange={(value) => setTab(value as SidebarTab)}
        className="min-h-0 flex-1"
      >
        <TabsList>
          {tabs.map(({ id, label, badge }) => (
            <TabsTrigger key={id} value={id}>
              {label}
              {badge ? <Badge>{badge}</Badge> : null}
            </TabsTrigger>
          ))}
        </TabsList>
        <TabsContent value="selection" className="overflow-y-auto px-3 py-2">
          <SelectionContent view={view} />
        </TabsContent>
        <TabsContent value="armies" className="overflow-y-auto px-3 py-2">
          <ArmiesList view={view} />
        </TabsContent>
        <TabsContent value="ranking" className="overflow-y-auto px-3 py-2">
          <Leaderboard view={view} />
        </TabsContent>
        <TabsContent value="log" className="overflow-y-auto px-3 py-2">
          <Chronicle view={view} />
        </TabsContent>
      </Tabs>
    </Card>
  );
}

const FEED_MARKS: Record<FeedEntry['kind'], string> = {
  march: 'bg-ink-soft',
  battle: 'bg-seal',
  gather: 'bg-[#e0a919]',
  chest: 'bg-[#b8702c]',
  outpost: 'bg-fortify',
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
  const raids = moving.filter((a) => a.target?.kind === 'army' && !a.joining).length;
  const gatherers = moving.filter(
    (a) => a.status === 'gathering' || (a.status === 'outbound' && a.target?.kind === 'spot'),
  ).length;
  const convoys = moving.filter((a) => hasResources(a.cargo)).length;
  const summary: { label: string; count: number; icon: ReactNode }[] = [
    { label: 'Angriffe', count: attacks, icon: <AlarmIcon size={16} /> },
    { label: 'Überfälle', count: raids, icon: <span className="font-bold text-seal">✕</span> },
    { label: 'Sammelzüge', count: gatherers, icon: <ResourceIcon resource="wood" size={16} /> },
    { label: 'Beladene Züge', count: convoys, icon: <ChestIcon size={16} /> },
  ];

  return (
    <Card className="pointer-events-auto min-h-0">
      <CardHeader className="border-b border-ink/40 bg-muted py-1.5">
        <span className="h-2 w-2 animate-pulse rounded-full bg-seal" aria-hidden />
        <b className="flex-1 italic">Liveticker</b>
        <span className="text-xs text-ink-soft">{moving.length} Züge unterwegs</span>
        {collapsible && <FoldToggle open={open} onToggle={() => setOpen(!open)} />}
      </CardHeader>
      <div className="grid grid-cols-4 gap-1 border-b border-ink/30 px-2 py-1.5">
        {summary.map(({ label, count, icon }) => (
          <Tip key={label} label={label}>
            <span
              aria-label={`${label}: ${count}`}
              className={`flex items-center justify-center gap-1 tabular-nums ${count === 0 ? 'opacity-40' : 'font-bold'}`}
            >
              {icon}
              {count}
            </span>
          </Tip>
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
                  <Button
                    variant="plain"
                    className="block min-w-0 shrink text-left font-normal whitespace-normal hover:text-seal hover:underline"
                    onClick={() => select({ kind: 'army', id: entry.armyId! })}
                  >
                    {entry.text}
                  </Button>
                ) : (
                  <span>{entry.text}</span>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </Card>
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

const NIGHT_TEXT = "Die Truppen rasten im Lager · weiter geht's werktags um 10 Uhr";

/** Night rest in the wide top bar: why nothing moves, and when it goes on. */
function NightNote() {
  return (
    <span className="mx-auto flex min-w-0 items-center gap-2 leading-tight">
      <MoonIcon className="size-5 shrink-0 text-gold" aria-hidden />
      <b className="shrink-0 italic">Nachtruhe</b>
      <span className="truncate text-xs text-ink-soft">{NIGHT_TEXT}</span>
    </span>
  );
}

/** Night rest on phones: a sheet under the top bar that the player can dismiss. */
function NightBanner({ onClose }: { onClose: () => void }) {
  return (
    <Card className="pointer-events-auto w-max max-w-full">
      <div className="flex items-center gap-2.5 py-1 pr-1 pl-3">
        <MoonIcon className="size-5 shrink-0 text-gold" aria-hidden />
        <div className="leading-tight">
          <b className="italic">Nachtruhe</b>
          <div className="text-xs text-ink-soft">{NIGHT_TEXT}</div>
        </div>
        <Button variant="ghost" size="icon-sm" onClick={onClose} aria-label="Hinweis schließen">
          <XIcon />
        </Button>
      </div>
    </Card>
  );
}

function EndBanner({ view }: { view: GameView }) {
  if (view.phase !== 'ended') return null;
  const winner = view.players.find((p) => p.id === view.winnerId);
  return (
    <Card className="pointer-events-auto px-4 py-2 text-center text-lg italic">
      Spielende —{' '}
      {winner ? `${winner.name} gewinnt mit ${winner.victoryPoints} Siegpunkten!` : 'kein Sieger.'}
    </Card>
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
    <Card className="pointer-events-auto min-h-0">
      <CardHeader className="block border-b border-ink/40 bg-muted py-1.5">
        <b className="italic">{title}</b>
      </CardHeader>
      <div className="min-h-0 overflow-y-auto px-3 py-2">{body}</div>
    </Card>
  );
  switch (tab) {
    case 'ticker':
      // Phones: the inbox sits on top of the ticker sheet (the tab bar has no room for it),
      // folded unless an offer waits. Capped in dvh: a % of the content-sized sheet never applies.
      return (
        <div className="flex min-h-0 flex-col gap-1.5">
          {view.self.pacts.length > 0 && (
            <div className="flex max-h-[32dvh] min-h-0 shrink-0 flex-col">
              <Inbox view={view} defaultOpen={false} />
            </div>
          )}
          <Ticker view={view} collapsible={false} />
        </div>
      );
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
  // Dismissed for this night only: the next night shows the banner again.
  const night = isNightRest(view);
  const [nightDismissed, setNightDismissed] = useState(false);
  if (!night && nightDismissed) setNightDismissed(false);
  const color = cssColor(playerColor(view, view.self.id));
  const armies = view.armies.filter((a) => a.ownerId === view.self.id).length;
  const tabs: { id: SheetTab; label: string; icon: ReactNode; badge?: number }[] = [
    {
      id: 'ticker',
      label: 'Ticker',
      icon: <AlarmIcon size={20} />,
      badge: pactsToAnswer(view),
    },
    {
      id: 'selection',
      label: 'Auswahl',
      icon: <CastleIcon color={color} style={playerHeraldry(view, view.self.id).style} size={22} />,
    },
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
        {/* Banners sit under the top bar, never in it: the menu buttons there must stay reachable. */}
        <div className="absolute inset-x-2 top-2 flex flex-col items-center gap-1.5">
          <RoutedBadge view={view} compact />
          {night && !nightDismissed && <NightBanner onClose={() => setNightDismissed(true)} />}
        </div>
        <Notice className="top-2" />
        <div className="absolute inset-x-2 bottom-2 flex flex-col items-center">
          {!tab && <EndBanner view={view} />}
        </div>
        {tab && (
          <div className="pointer-events-auto absolute inset-x-0 bottom-0 flex max-h-[62dvh] flex-col px-1.5 pt-1">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setTab(null)}
              aria-label="Panel schließen"
              className="mx-auto mb-1 rounded-full bg-background text-ink-soft shadow-[1px_2px_0_rgba(59,42,24,0.3)]"
            >
              <ChevronDownIcon /> Karte zeigen
            </Button>
            <SheetContent view={view} tab={tab} />
          </div>
        )}
      </div>
      {/* Toggle group, not tabs: tapping the open sheet's tab again closes it. */}
      <ToggleGroup
        type="single"
        value={tab ?? ''}
        onValueChange={(value) => setTab((value || null) as SheetTab | null)}
        aria-label="Bereiche"
        className="pointer-events-auto shrink-0 border-t-[3px] border-double border-ink bg-muted pb-[env(safe-area-inset-bottom)] shadow-[0_-2px_0_rgba(59,42,24,0.2)]"
      >
        {tabs.map(({ id, label, icon, badge }) => (
          <ToggleGroupItem key={id} value={id} className="h-14 text-[11px]">
            {icon}
            {label}
            {badge ? (
              <Badge className="absolute top-1 right-[calc(50%-1.4rem)] text-[10px]">{badge}</Badge>
            ) : null}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
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
  useDuoNotices(view);
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
              <div className="flex max-h-[45%] min-h-0 flex-col">
                <Ticker view={view} />
              </div>
              <div className="flex max-h-[35%] min-h-0 flex-col">
                <Inbox view={view} />
              </div>
              <div className="mt-auto flex items-end gap-2">
                <HandbookCorner />
                <RuleChangesButton />
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
      <TraderMenu />
      <CardProfile />
      <BribeBanner />
      <Handbook />
      <RuleChanges />
    </>
  );
}
