import {
  BAREFOOT_SPEED,
  planDuo,
  type ArmyTarget,
  type DuoSource,
  type DuoSourcePick,
  type GameView,
  type MapData,
  type PactView,
  type Vec2,
} from '@vectoria/shared';
import { useMemo, useState, type ReactNode } from 'react';
import { ArrowRightIcon, ChevronDownIcon, ChevronRightIcon } from 'lucide-react';
import {
  cssColor,
  describeTarget,
  formatEta,
  ownBases,
  playerColor,
  playerHeraldry,
  playerName,
  type BaseInfo,
} from '../game/format';
import { pactsToAnswer } from '../game/duo';
import { NEUTRAL_COLOR } from '../game/palette';
import { gameSocket } from '../net/socket';
import { useGameStore } from '../state/store';
import { CastleIcon, DuoIcon, OutpostIcon, ShieldIcon } from './icons';
import { Button } from './Panel';
import { Locked } from './Routed';
import { Card, CardHeader } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';

const HOME = 'home';
const key = (id: string | null) => id ?? HOME;

/** Where a player's base stands: the home castle (null) or one of their outposts. */
function basePosition(view: GameView, playerId: string, from: string | null): Vec2 | null {
  if (from === null) return view.players.find((p) => p.id === playerId)?.castle ?? null;
  return view.outposts.find((o) => o.id === from)?.position ?? null;
}

function targetPosition(view: GameView, target: ArmyTarget): Vec2 | null {
  return target.kind === 'castle'
    ? (view.players.find((p) => p.id === target.id)?.castle ?? null)
    : (view.outposts.find((o) => o.id === target.id)?.position ?? null);
}

function pace(view: GameView, playerId: string): number {
  return view.players.find((p) => p.id === playerId)?.barefoot ? BAREFOOT_SPEED : 1;
}

/**
 * Troops a player has stationed: at home plus in all their outposts (public). Bases hidden by a
 * Nebel march count as 0; `hidden` says whether there are any.
 */
function stationed(view: GameView, playerId: string): { troops: number; hidden: boolean } {
  const home = view.players.find((p) => p.id === playerId)?.homeTroops;
  const counts = [
    home ?? null,
    ...view.outposts.filter((o) => o.ownerId === playerId).map((o) => o.troops),
  ];
  return {
    troops: counts.reduce<number>((sum, n) => sum + (n ?? 0), 0),
    hidden: counts.includes(null),
  };
}

/** "120", or "120 + ?" when some of the bases are hidden by fog. */
function stationedText({ troops, hidden }: { troops: number; hidden: boolean }): string {
  return hidden ? `${troops} + ?` : String(troops);
}

/** A planned duo's timing (game ms from the start): meeting point, attack; or why there is none. */
type DuoTimes = { meetMs: number; totalMs: number } | 'no-route' | null;

function useDuoTimes(
  map: MapData | null,
  view: GameView,
  groups: { playerId: string; from: string | null }[],
  target: ArmyTarget,
): DuoTimes {
  const signature = JSON.stringify(groups);
  return useMemo(() => {
    const to = targetPosition(view, target);
    const sources: DuoSource[] = groups.flatMap((g) => {
      const position = basePosition(view, g.playerId, g.from);
      return position ? [{ position, speed: pace(view, g.playerId) }] : [];
    });
    if (!map || !to || sources.length === 0) return null;
    const plan = planDuo(map, sources, to);
    return plan ? { meetMs: plan.meetMs, totalMs: plan.totalMs } : 'no-route';
    // Bases and paces barely change; recompute when the picked groups or the target do.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, signature, target.kind, target.id]);
}

const colorOf = (view: GameView, playerId: string | undefined) =>
  cssColor(playerId ? playerColor(view, playerId) : NEUTRAL_COLOR);

/** The emblem with the partners' colours: initiator left, partner right (neutral until chosen). */
function Emblem({
  view,
  initiatorId,
  partnerId,
  size = 34,
}: {
  view: GameView;
  initiatorId: string;
  partnerId: string | undefined;
  size?: number;
}) {
  return <DuoIcon left={colorOf(view, initiatorId)} right={colorOf(view, partnerId)} size={size} />;
}

/** Heading of a duo block: emblem and title in the selection panel's heading style. */
function DuoHeading({ emblem, children }: { emblem: ReactNode; children: ReactNode }) {
  return (
    <div className="flex items-center gap-2 text-base italic">
      {emblem}
      <span className="min-w-0">{children}</span>
    </div>
  );
}

/** One side of the duo: shield in the player's colour and the name ("du" for the viewer). */
function Side({ view, playerId }: { view: GameView; playerId: string | undefined }) {
  const name = !playerId ? '…' : playerId === view.self.id ? 'du' : playerName(view, playerId);
  return (
    <span className="inline-flex items-center gap-1 whitespace-nowrap">
      <ShieldIcon color={colorOf(view, playerId)} size={14} />
      <b>{name}</b>
    </span>
  );
}

/** Who attacks whom: both partners' shields, an arrow, and the target with its map art. */
function DuoLine({
  view,
  initiatorId,
  partnerId,
  target,
}: {
  view: GameView;
  initiatorId: string;
  partnerId: string | undefined;
  target: ArmyTarget;
}) {
  const outpost =
    target.kind === 'outpost' ? view.outposts.find((o) => o.id === target.id) : undefined;
  const icon =
    target.kind === 'castle' ? (
      <CastleIcon
        color={colorOf(view, target.id)}
        style={playerHeraldry(view, target.id).style}
        size={22}
      />
    ) : (
      <OutpostIcon color={outpost?.ownerId ? colorOf(view, outpost.ownerId) : null} size={20} />
    );
  return (
    <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
      <Side view={view} playerId={initiatorId} />
      <span className="text-ink-soft">+</span>
      <Side view={view} playerId={partnerId} />
      <ArrowRightIcon className="size-3.5 shrink-0 text-ink-soft" />
      <span className="inline-flex items-center gap-1">
        {icon}
        <span>{describeTarget(view, target)}</span>
      </span>
    </div>
  );
}

/** The duo's strength: one bar split in the partners' colours, each share and the total. */
function StrengthBar({
  view,
  parts,
}: {
  view: GameView;
  parts: { playerId: string | undefined; troops: number }[];
}) {
  const total = parts.reduce((sum, p) => sum + p.troops, 0);
  return (
    <div>
      <div className="flex h-2.5 overflow-hidden rounded-[2px] border border-ink/80 bg-ink/10">
        {parts.map((p, i) => (
          <div
            key={i}
            className="h-full border-ink/60 not-last:border-r"
            style={{ flexGrow: p.troops, backgroundColor: colorOf(view, p.playerId) }}
          />
        ))}
      </div>
      <div className="mt-0.5 flex flex-wrap items-center gap-x-1 text-xs text-ink-soft tabular-nums">
        {parts.map((p, i) => (
          <span key={i} className="inline-flex items-center gap-0.5">
            {i > 0 && <span className="mr-0.5">+</span>}
            <ShieldIcon color={colorOf(view, p.playerId)} size={11} />
            <b className="text-ink">{p.troops}</b>
          </span>
        ))}
        <span>
          = <b className="text-ink">{total}</b> Truppen
        </span>
      </div>
    </div>
  );
}

/** A small parchment chip for one moment of the duo (meeting point, attack). */
function Chip({ children }: { children: ReactNode }) {
  return (
    <span className="rounded-[3px] border border-ink/35 bg-parchment/60 px-1.5 py-px text-xs">
      {children}
    </span>
  );
}

/** Planned timing as chips, or why there is no plan. */
function TimeChips({ view, times }: { view: GameView; times: DuoTimes }) {
  if (times === null) return null;
  if (times === 'no-route') {
    return <div className="text-xs text-seal italic">Kein Landweg für dieses Duo.</div>;
  }
  return (
    <div className="flex flex-wrap gap-1">
      <Chip>Treffpunkt {formatEta(view.clock, times.meetMs)}</Chip>
      <Chip>Angriff {formatEta(view.clock, times.totalMs)}</Chip>
    </div>
  );
}

/** Troop inputs per own base; returns the picks (bases with troops) and their sum. */
function SourcePicker({
  bases,
  picks,
  onChange,
}: {
  bases: BaseInfo[];
  picks: Record<string, number>;
  onChange: (picks: Record<string, number>) => void;
}) {
  return (
    <div className="space-y-1">
      {bases.map((b) => (
        <div key={key(b.id)} className="flex items-center justify-between gap-2">
          <span className="min-w-0 truncate">
            {b.name} <span className="text-xs text-ink-soft">({b.troops})</span>
          </span>
          <span className="flex shrink-0 items-center gap-1">
            <Input
              type="number"
              min={0}
              max={b.troops}
              value={picks[key(b.id)] ?? 0}
              onChange={(e) =>
                onChange({
                  ...picks,
                  [key(b.id)]: Math.max(0, Math.min(b.troops, Math.floor(Number(e.target.value)))),
                })
              }
              className="h-7 w-16 tabular-nums"
              aria-label={`Truppen aus ${b.name}`}
            />
            <Button size="sm" onClick={() => onChange({ ...picks, [key(b.id)]: b.troops })}>
              Alle
            </Button>
          </span>
        </div>
      ))}
    </div>
  );
}

function toPicks(bases: BaseInfo[], picks: Record<string, number>): DuoSourcePick[] {
  return bases.flatMap((b) => {
    const troops = Math.min(picks[key(b.id)] ?? 0, b.troops);
    return troops > 0 ? [{ from: b.id, troops }] : [];
  });
}

/** Fills `wanted` troops from the bases in order (home castle first). */
function fill(bases: BaseInfo[], wanted: number): Record<string, number> {
  const picks: Record<string, number> = {};
  let left = wanted;
  for (const b of bases) {
    const take = Math.min(left, b.troops);
    if (take > 0) picks[key(b.id)] = take;
    left -= take;
  }
  return picks;
}

/**
 * "Duo-Angreifen" on an enemy castle or outpost: pick a partner, put the own share together from
 * stationed troops and ask the partner for theirs. The partner gets the plan in the inbox.
 */
export function DuoForm({ view, target }: { view: GameView; target: ArmyTarget }) {
  const map = useGameStore((s) => s.map);
  const [open, setOpen] = useState(false);
  const [partnerId, setPartnerId] = useState<string | undefined>(undefined);
  const [picks, setPicks] = useState<Record<string, number>>({});
  const [asked, setAsked] = useState(30);
  const targetOwner =
    target.kind === 'castle' ? target.id : view.outposts.find((o) => o.id === target.id)?.ownerId;
  const partners = view.players.filter(
    (p) => p.id !== view.self.id && p.id !== targetOwner && p.castle && !p.routed,
  );
  const bases = ownBases(view).filter((b) => b.troops > 0);
  const own = toPicks(bases, picks);
  const ownTroops = own.reduce((sum, p) => sum + p.troops, 0);
  const partnerStationed = partnerId ? stationed(view, partnerId) : null;
  const budget = partnerStationed?.troops ?? 0;
  const partnerTroops = Math.min(asked, budget);
  const times = useDuoTimes(
    map,
    view,
    [
      ...own.map((p) => ({ playerId: view.self.id, from: p.from })),
      ...(partnerId ? [{ playerId: partnerId, from: null }] : []),
    ],
    target,
  );

  if (!open) {
    return (
      <Locked className="mt-2">
        <Button className="w-full" onClick={() => setOpen(true)} disabled={partners.length === 0}>
          <DuoIcon left={colorOf(view, view.self.id)} right={cssColor(NEUTRAL_COLOR)} size={20} />
          Duo-Angreifen
        </Button>
      </Locked>
    );
  }
  const valid = partnerId !== undefined && ownTroops > 0 && partnerTroops > 0;
  return (
    <Locked className="mt-2 space-y-2 border-t border-ink/30 pt-2">
      <DuoHeading emblem={<Emblem view={view} initiatorId={view.self.id} partnerId={partnerId} />}>
        Duo-Angriff
      </DuoHeading>
      <p className="text-xs text-ink-soft">
        Ihr trefft euch auf kürzestem Weg, vereint euch und greift gemeinsam an. Bis zum Treffen
        sieht niemand das Ziel. Beute und Truhe teilt ihr nach Truppen; abbrechen geht nur
        gemeinsam.
      </p>
      <Select value={partnerId ?? ''} onValueChange={setPartnerId}>
        <SelectTrigger aria-label="Duo-Partner" className="h-7 w-full">
          <SelectValue placeholder="Partner wählen" />
        </SelectTrigger>
        <SelectContent>
          {partners.map((p) => (
            <SelectItem key={p.id} value={p.id}>
              {p.name} ({stationedText(stationed(view, p.id))} Truppen stationiert)
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <DuoLine view={view} initiatorId={view.self.id} partnerId={partnerId} target={target} />
      <div className="text-xs text-ink-soft">Deine Truppen:</div>
      <SourcePicker bases={bases} picks={picks} onChange={setPicks} />
      {partnerId && (
        <div>
          <div className="text-ink-soft">
            Von {playerName(view, partnerId)}: <b className="text-ink">{partnerTroops}</b> /{' '}
            {partnerStationed ? stationedText(partnerStationed) : budget}
          </div>
          <Slider
            min={1}
            max={Math.max(budget, 1)}
            step={1}
            value={[partnerTroops]}
            onValueChange={([value]) => setAsked(value ?? 1)}
            disabled={budget === 0}
            className="py-1"
            aria-label="Truppen vom Partner"
          />
        </div>
      )}
      <StrengthBar
        view={view}
        parts={[
          { playerId: view.self.id, troops: ownTroops },
          { playerId: partnerId, troops: partnerId ? partnerTroops : 0 },
        ]}
      />
      <TimeChips view={view} times={times} />
      <div className="flex justify-between gap-2">
        <Button onClick={() => setOpen(false)}>Abbrechen</Button>
        <Button
          variant="primary"
          disabled={!valid}
          onClick={() => {
            gameSocket.send({
              type: 'duoOffer',
              partnerId: partnerId!,
              target,
              sources: own,
              partnerTroops,
            });
            setOpen(false);
            setPicks({});
          }}
        >
          Angebot senden
        </Button>
      </div>
    </Locked>
  );
}

function PactItem({ view, pact }: { view: GameView; pact: PactView }) {
  const map = useGameStore((s) => s.map);
  const me = view.self.id;
  const incoming = pact.partnerId === me;
  const other = playerName(view, incoming ? pact.initiatorId : pact.partnerId);
  const bases = ownBases(view).filter((b) => b.troops > 0);
  const [picks, setPicks] = useState<Record<string, number>>(() => fill(bases, pact.partnerTroops));
  const answer = incoming && pact.status === 'offered';
  const own = toPicks(bases, picks);
  const ownTroops = own.reduce((sum, p) => sum + p.troops, 0);
  const times = useDuoTimes(
    pact.status === 'offered' ? map : null,
    view,
    [
      ...pact.initiatorSources.map((s) => ({ playerId: pact.initiatorId, from: s.from })),
      ...(answer
        ? own.map((p) => ({ playerId: me, from: p.from }))
        : [{ playerId: pact.partnerId, from: null }]),
    ],
    pact.target,
  );
  const now = view.clock.clock;
  const heading =
    pact.status === 'offered'
      ? incoming
        ? `${other} lädt dich ein`
        : `Dein Angebot an ${other}`
      : pact.status === 'marching'
        ? `Duo mit ${other} · unterwegs`
        : `Duo mit ${other} · vereint`;

  return (
    <li
      className={`space-y-1.5 py-2 ${answer ? '-mx-3 border-l-[3px] border-seal bg-seal/5 pr-3 pl-[9px]' : ''}`}
    >
      <DuoHeading
        emblem={
          <Emblem view={view} initiatorId={pact.initiatorId} partnerId={pact.partnerId} size={34} />
        }
      >
        <span className="text-sm">{heading}</span>
      </DuoHeading>
      <DuoLine
        view={view}
        initiatorId={pact.initiatorId}
        partnerId={pact.partnerId}
        target={pact.target}
      />
      <StrengthBar
        view={view}
        parts={[
          { playerId: pact.initiatorId, troops: pact.initiatorTroops },
          { playerId: pact.partnerId, troops: pact.partnerTroops },
        ]}
      />
      {pact.status === 'offered' ? (
        <>
          <TimeChips view={view} times={times} />
          {answer ? (
            <>
              <div className="text-xs text-ink-soft">
                Deine {pact.partnerTroops} Truppen ({ownTroops} gewählt):
              </div>
              <SourcePicker bases={bases} picks={picks} onChange={setPicks} />
              <div className="flex justify-end gap-1.5">
                <Button
                  onClick={() =>
                    gameSocket.send({
                      type: 'duoAnswer',
                      pactId: pact.id,
                      accept: false,
                      sources: [],
                    })
                  }
                >
                  Ablehnen
                </Button>
                <Button
                  variant="primary"
                  disabled={ownTroops !== pact.partnerTroops}
                  onClick={() =>
                    gameSocket.send({
                      type: 'duoAnswer',
                      pactId: pact.id,
                      accept: true,
                      sources: own,
                    })
                  }
                >
                  Annehmen
                </Button>
              </div>
            </>
          ) : (
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs text-ink-soft italic">wartet auf Antwort</span>
              <Button
                size="sm"
                onClick={() => gameSocket.send({ type: 'duoWithdraw', pactId: pact.id })}
              >
                Zurückziehen
              </Button>
            </div>
          )}
        </>
      ) : (
        <>
          <div className="flex flex-wrap gap-1">
            {pact.status === 'marching' && pact.meetClock !== null ? (
              <Chip>Treffpunkt {formatEta(view.clock, pact.meetClock - now)}</Chip>
            ) : (
              <Chip>Vereint · Ziel sichtbar</Chip>
            )}
            {pact.attackClock !== null && (
              <Chip>
                Angriff {pact.status === 'marching' ? 'ca. ' : ''}
                {formatEta(view.clock, pact.attackClock - now)}
              </Chip>
            )}
          </div>
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs text-ink-soft italic">
              {pact.abortBy === null
                ? 'Abbruch nur gemeinsam'
                : pact.abortBy === me
                  ? `Du willst abbrechen — wartet auf ${other}`
                  : `${other} will abbrechen`}
            </span>
            <Button
              size="sm"
              variant={pact.abortBy !== null && pact.abortBy !== me ? 'danger' : 'default'}
              onClick={() => gameSocket.send({ type: 'duoAbort', pactId: pact.id })}
            >
              {pact.abortBy === null
                ? 'Abbruch vorschlagen'
                : pact.abortBy === me
                  ? 'Zurücknehmen'
                  : 'Zustimmen'}
            </Button>
          </div>
        </>
      )}
    </li>
  );
}

/**
 * Duo attack offers and running pacts. Under the live ticker; on phones inside its sheet.
 * Folds like the other boxes; a new offer to answer unfolds it again.
 */
export function Inbox({ view, defaultOpen = true }: { view: GameView; defaultOpen?: boolean }) {
  const pacts = [...view.self.pacts].sort(
    (a, b) => Number(b.partnerId === view.self.id) - Number(a.partnerId === view.self.id),
  );
  const waiting = pactsToAnswer(view);
  const [open, setOpen] = useState(defaultOpen || waiting > 0);
  const [seenWaiting, setSeenWaiting] = useState(waiting);
  if (waiting !== seenWaiting) {
    setSeenWaiting(waiting);
    if (waiting > seenWaiting) setOpen(true);
  }
  return (
    <Card className="pointer-events-auto min-h-0">
      <CardHeader className="border-b border-ink/40 bg-muted p-0">
        <button
          type="button"
          onClick={() => setOpen(!open)}
          aria-expanded={open}
          className="flex w-full cursor-pointer items-center gap-2 px-3 py-1.5 text-left outline-none hover:text-seal focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-inset"
        >
          <b className="flex-1 italic">Posteingang</b>
          {waiting > 0 && (
            <span className="rounded-full bg-seal px-1.5 text-xs font-bold text-parchment">
              {waiting}
            </span>
          )}
          {!open && pacts.length > 0 && waiting === 0 && (
            <span className="text-xs text-ink-soft">{pacts.length}</span>
          )}
          {open ? (
            <ChevronDownIcon className="size-4 text-ink-soft" />
          ) : (
            <ChevronRightIcon className="size-4 text-ink-soft" />
          )}
        </button>
      </CardHeader>
      {open &&
        (pacts.length === 0 ? (
          <p className="px-3 py-1.5 text-xs text-ink-soft italic">
            Keine Duo-Angebote. Wähle eine fremde Burg oder einen Stützpunkt für „Duo-Angreifen“.
          </p>
        ) : (
          <Locked className="min-h-0 overflow-y-auto overscroll-contain px-3">
            <ul className="divide-y divide-ink/15">
              {pacts.map((p) => (
                <PactItem key={p.id} view={view} pact={p} />
              ))}
            </ul>
          </Locked>
        ))}
    </Card>
  );
}
