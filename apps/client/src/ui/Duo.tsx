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
import { useMemo, useState } from 'react';
import {
  describeTarget,
  formatGameDuration,
  ownBases,
  playerName,
  type BaseInfo,
} from '../game/format';
import { pactsToAnswer } from '../game/duo';
import { gameSocket } from '../net/socket';
import { useGameStore } from '../state/store';
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

/** Troops a player has stationed: at home plus in all their outposts (public). */
function stationed(view: GameView, playerId: string): number {
  const home = view.players.find((p) => p.id === playerId)?.homeTroops ?? 0;
  return view.outposts
    .filter((o) => o.ownerId === playerId)
    .reduce((sum, o) => sum + o.troops, home);
}

/** "Dauer 7:30 h (Offenlegung des Ziels nach 3:10 h)" for a plan, or why there is none. */
function useDuoTimes(
  map: MapData | null,
  view: GameView,
  groups: { playerId: string; from: string | null }[],
  target: ArmyTarget,
): string {
  const signature = JSON.stringify(groups);
  return useMemo(() => {
    const to = targetPosition(view, target);
    const sources: DuoSource[] = groups.flatMap((g) => {
      const position = basePosition(view, g.playerId, g.from);
      return position ? [{ position, speed: pace(view, g.playerId) }] : [];
    });
    if (!map || !to || sources.length === 0) return '';
    const plan = planDuo(map, sources, to);
    if (!plan) return 'Kein Landweg für dieses Duo.';
    return `Dauer ${formatGameDuration(plan.totalMs)} (Offenlegung des Ziels nach ${formatGameDuration(plan.meetMs)})`;
    // Bases and paces barely change; recompute when the picked groups or the target do.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, signature, target.kind, target.id]);
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
  const budget = partnerId ? stationed(view, partnerId) : 0;
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
          Duo-Angreifen
        </Button>
      </Locked>
    );
  }
  const valid = partnerId !== undefined && ownTroops > 0 && partnerTroops > 0;
  return (
    <Locked className="mt-2 space-y-2 border-t border-ink/30 pt-2">
      <div className="font-bold">Duo-Angriff</div>
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
              {p.name} ({stationed(view, p.id)} Truppen stationiert)
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <div className="text-ink-soft">Deine Truppen ({ownTroops}):</div>
      <SourcePicker bases={bases} picks={picks} onChange={setPicks} />
      {partnerId && (
        <div>
          <div className="text-ink-soft">
            Von {playerName(view, partnerId)}: <b className="text-ink">{partnerTroops}</b> /{' '}
            {budget}
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
      {times && <div className="text-ink-soft">{times}</div>}
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
  const target = describeTarget(view, pact.target);
  const shares = `${pact.initiatorTroops} von ${incoming ? other : 'dir'} + ${pact.partnerTroops} von ${incoming ? 'dir' : other}`;
  const now = view.clock.clock;

  return (
    <li className="space-y-1.5 py-2">
      {pact.status === 'offered' ? (
        <>
          <div>
            {incoming ? (
              <>
                <b>{other}</b> lädt dich zum Duo-Angriff ein:
              </>
            ) : (
              <>
                Dein Angebot an <b>{other}</b>:
              </>
            )}{' '}
            {target} · {shares}
          </div>
          {times && <div className="text-xs text-ink-soft">{times}</div>}
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
          <div>
            Duo mit <b>{other}</b> gegen {target} · {shares}
          </div>
          <div className="text-xs text-ink-soft">
            {pact.status === 'marching' && pact.meetClock !== null
              ? `Treffpunkt in ${formatGameDuration(Math.max(0, pact.meetClock - now))}`
              : 'Vereint'}
            {pact.attackClock !== null &&
              ` · Angriff in ${pact.status === 'marching' ? 'ca. ' : ''}${formatGameDuration(Math.max(0, pact.attackClock - now))}`}
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

/** Duo attack offers and running pacts. Under the live ticker; on phones inside its sheet. */
export function Inbox({ view }: { view: GameView }) {
  const pacts = [...view.self.pacts].sort(
    (a, b) => Number(b.partnerId === view.self.id) - Number(a.partnerId === view.self.id),
  );
  const waiting = pactsToAnswer(view);
  return (
    <Card className="pointer-events-auto min-h-0">
      <CardHeader className="border-b border-ink/40 bg-muted py-1.5">
        <b className="flex-1 italic">Posteingang</b>
        {waiting > 0 && (
          <span className="rounded-full bg-seal px-1.5 text-xs font-bold text-parchment">
            {waiting}
          </span>
        )}
      </CardHeader>
      {pacts.length === 0 ? (
        <p className="px-3 py-1.5 text-xs text-ink-soft italic">
          Keine Duo-Angebote. Wähle eine fremde Burg oder einen Stützpunkt für „Duo-Angreifen“.
        </p>
      ) : (
        <Locked className="min-h-0 overflow-y-auto px-3">
          <ul className="divide-y divide-ink/15">
            {pacts.map((p) => (
              <PactItem key={p.id} view={view} pact={p} />
            ))}
          </ul>
        </Locked>
      )}
    </Card>
  );
}
