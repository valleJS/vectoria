import {
  CARDS,
  emptyResources,
  findPath,
  GATHER_DURATION_MS,
  BAREFOOT_SPEED,
  LOADED_SPEED,
  OUTPOST_DAILY_INCOME,
  GATHER_YIELD_PER_100_TROOPS,
  gatherYield,
  hasResources,
  isRaidable,
  pathLength,
  planIntercept,
  RESOURCE_NAMES,
  travelMs,
  type ArmyTarget,
  type ArmyView,
  type GameView,
  type MapData,
  type Vec2,
} from '@vectoria/shared';
import { useMemo, useState, type ReactNode } from 'react';
import {
  cssColor,
  describeTarget,
  formatGameDuration,
  formatPercent,
  formatResources,
  outpostLabel,
  ownBases,
  playerColor,
  playerHeraldry,
  playerName,
  type BaseInfo,
} from '../game/format';
import { NEUTRAL_COLOR } from '../game/palette';
import { gameSocket } from '../net/socket';
import { useGameStore, type Selection } from '../state/store';
import {
  CaravanIcon,
  CastleIcon,
  ChestIcon,
  OutpostIcon,
  ResourceIcon,
  SoldiersIcon,
  SpotIcon,
} from './icons';
import { Button, SectionLabel, Tip } from './Panel';
import { DuoForm } from './Duo';
import { Locked } from './Routed';
import { ArrowRightIcon, XIcon } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';

/** Select value for the home castle (base id null). */
const HOME = 'home';

const distance = (a: Vec2, b: Vec2) => Math.hypot(a.x - b.x, a.y - b.y);

const STATUS_NAMES: Record<ArmyView['status'], string> = {
  outbound: 'unterwegs',
  gathering: 'sammelt',
  returning: 'auf dem Heimweg',
  waiting: 'wartet am Duo-Treffpunkt',
};

/** Convoy movement as seen now: the remaining route, walked until its arrival clock. */
function trackOf(view: GameView, army: ArmyView) {
  return army.route
    ? { path: army.route, departClock: view.clock.clock, arriveClock: army.arriveClock }
    : null;
}

/** Travel time from `from` to the target, or null if no land route (or raid too late). */
function eta(
  map: MapData,
  view: GameView,
  from: Vec2,
  target: ArmyTarget,
  position: Vec2,
  forcedMarch: boolean,
  /** Seeweg: straight over water, not along land. */
  sea = false,
): number | null {
  // Marches started barefoot (Schuhe klauen) go slower, as on the server.
  const speed = barefoot(view) ? BAREFOOT_SPEED : 1;
  if (target.kind === 'army') {
    const convoy = view.armies.find((a) => a.id === target.id);
    const track = convoy && trackOf(view, convoy);
    const meeting = track && planIntercept(map, from, track, view.clock.clock, forcedMarch, speed);
    return meeting ? meeting.clock - view.clock.clock : null;
  }
  const path = sea ? [from, position] : findPath(map, from, position);
  return path ? travelMs(pathLength(path), map.width, forcedMarch, speed) : null;
}

function barefoot(view: GameView): boolean {
  return (view.self.barefootUntil ?? 0) > view.clock.clock;
}

function SendForm({
  view,
  target,
  position,
  verb,
  bases,
  defaultTroops = 50,
  minTroops = 1,
  preview,
  trade = false,
}: {
  view: GameView;
  target: ArmyTarget;
  position: Vec2;
  verb: string;
  /** Bases the troops may leave from; the nearest one with troops is preselected. */
  bases: BaseInfo[];
  defaultTroops?: number;
  /** Fewer troops than this cannot be sent (e.g. a chest's requirement). */
  minTroops?: number;
  /** Extra line under the form for the chosen troop count (e.g. expected yield). */
  preview?: (troops: number) => ReactNode;
  /** Target is the trader: carry stone and choose the gold/wood split. */
  trade?: boolean;
}) {
  const map = useGameStore((s) => s.map);
  const [fromId, setFromId] = useState<string | null | undefined>(undefined);
  const [chosen, setTroops] = useState(defaultTroops);
  const [useCard, setUseCard] = useState(true);
  const [stoneWanted, setStone] = useState(0);
  const [goldShare, setGoldShare] = useState(0.5);
  const activeCard = view.self.activeCard;
  // A Seeweg cannot be used for a raid (the server refuses it): it stays armed for later.
  const cardUsable = activeCard !== null && !(activeCard === 'sea' && target.kind === 'army');
  const withCard = useCard && cardUsable;
  const forced = withCard && activeCard === 'forcedMarch';
  const sea = withCard && activeCard === 'sea' && target.kind !== 'army';
  const nearest = [...bases].sort(
    (a, b) =>
      Number(b.troops > 0) - Number(a.troops > 0) ||
      distance(a.position, position) - distance(b.position, position),
  )[0];
  const base = bases.find((b) => b.id === fromId) ?? nearest;
  const travel = useMemo(
    () => (map && base ? eta(map, view, base.position, target, position, forced, sea) : null),
    // Raids move with the convoy; recompute on every state update for those.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [map, base?.position, position, forced, sea, target.kind === 'army' ? view.clock.clock : 0],
  );
  if (!base || !map) return null;

  // Troops shrink as armies leave; never offer more than are there.
  const available = base.troops;
  const troops = Math.min(chosen, available);
  // Trader: x stone → y gold + z wood (x = y + z); stone in the store caps x.
  const stone = trade ? Math.max(0, Math.min(stoneWanted, base.resources.stone)) : 0;
  const gold = Math.round(stone * goldShare);
  const wood = stone - gold;
  // Carrying resources slows the march (same rule as the server).
  const arrival = travel !== null && stone > 0 ? Math.round(travel / LOADED_SPEED) : travel;
  const valid =
    Number.isInteger(troops) &&
    troops > 0 &&
    troops >= minTroops &&
    travel !== null &&
    (!trade || stone > 0);

  const send = () => {
    gameSocket.send({
      type: 'sendArmy',
      from: base.id,
      troops,
      target,
      useActiveCard: withCard,
      // Cargo only goes to the trader; stock moves between bases with the night caravan.
      cargo: trade ? { ...emptyResources(), stone } : emptyResources(),
      ...(trade ? { trade: { gold, wood } } : {}),
    });
    setStone(0);
  };

  const baseSelect = bases.length > 1 && (
    <div className="flex items-center gap-2">
      <Label htmlFor="send-from" className="text-ink-soft">
        {trade ? 'Aus' : 'Von'}
      </Label>
      {/* Radix items need a non-empty value: the home castle (id null) is "home". */}
      <Select
        value={base.id ?? HOME}
        onValueChange={(value) => setFromId(value === HOME ? null : value)}
      >
        <SelectTrigger id="send-from" className="h-7 flex-1">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {bases.map((b) => (
            <SelectItem key={b.id ?? HOME} value={b.id ?? HOME}>
              {trade
                ? `${b.name} (${b.resources.stone} Stein · ${b.troops} Tr.)`
                : `${b.name} (${b.troops} Truppen)`}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );

  const troopFields = (
    <div className="space-y-1">
      {trade && <SectionLabel>Träger</SectionLabel>}
      <Slider
        min={available > 0 ? 1 : 0}
        max={Math.max(available, 1)}
        step={1}
        value={[troops]}
        onValueChange={([value]) => setTroops(value ?? 0)}
        disabled={available === 0}
        className="py-1"
        aria-label="Truppen"
      />
      <div className="flex items-center gap-2">
        <Input
          type="number"
          min={1}
          max={available}
          value={troops}
          onChange={(e) => setTroops(Math.floor(Number(e.target.value)))}
          className="h-7 w-20 tabular-nums"
          aria-label="Anzahl Truppen"
        />
        <span className="text-ink-soft">
          / {available} {base.id === null ? 'zu Hause' : 'vor Ort'}
        </span>
        <Button onClick={() => setTroops(available)} disabled={available === 0}>
          Alle
        </Button>
      </div>
    </div>
  );

  const store = base.resources.stone;
  const tradeFields = trade && (
    <div className="space-y-2">
      {/* The deal at a glance: x stone in, y gold + z wood out. */}
      <div className="flex items-center justify-center gap-2 border border-ink/30 bg-parchment-dark px-2 py-1.5 text-base tabular-nums">
        <span className="inline-flex items-center gap-1">
          <ResourceIcon resource="stone" size={22} title={RESOURCE_NAMES.stone} />
          <b>{stone}</b>
        </span>
        <ArrowRightIcon className="size-4 text-ink-soft" aria-hidden />
        <span className="inline-flex items-center gap-1">
          <ResourceIcon resource="gold" size={22} title={RESOURCE_NAMES.gold} />
          <b>{gold}</b>
        </span>
        <span className="text-ink-soft">+</span>
        <span className="inline-flex items-center gap-1">
          <ResourceIcon resource="wood" size={22} title={RESOURCE_NAMES.wood} />
          <b>{wood}</b>
        </span>
      </div>
      {baseSelect}
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <Label htmlFor="trade-stone" className="gap-1">
            <ResourceIcon resource="stone" size={16} title={RESOURCE_NAMES.stone} />
            Stein
          </Label>
          <Slider
            min={0}
            max={Math.max(store, 1)}
            step={1}
            value={[stone]}
            onValueChange={([value]) => setStone(value ?? 0)}
            disabled={store === 0}
            className="flex-1 py-1"
            aria-label="Stein zum Tauschen"
          />
          <Input
            id="trade-stone"
            type="number"
            min={0}
            max={store}
            value={stone}
            onChange={(e) => setStone(Math.max(0, Math.floor(Number(e.target.value))))}
            className="h-7 w-16 tabular-nums"
          />
          <Button size="sm" onClick={() => setStone(store)} disabled={store === 0}>
            Alles
          </Button>
        </div>
        {store === 0 && (
          <div className="text-seal">
            {bases.length > 1
              ? 'Hier lagert kein Stein — wähle einen anderen Ort.'
              : 'Kein Stein im Lager.'}
          </div>
        )}
      </div>
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <span className="inline-flex w-12 items-center gap-1">
            <ResourceIcon resource="gold" size={16} title={RESOURCE_NAMES.gold} /> Gold
          </span>
          <Slider
            min={0}
            max={1}
            step={0.01}
            value={[1 - goldShare]}
            onValueChange={([value]) => setGoldShare(1 - (value ?? 0.5))}
            className="flex-1 py-1"
            aria-label="Aufteilung Gold / Holz"
          />
          <span className="inline-flex w-12 items-center justify-end gap-1">
            Holz <ResourceIcon resource="wood" size={16} title={RESOURCE_NAMES.wood} />
          </span>
        </div>
        <div className="flex gap-1">
          {(
            [
              ['Alles Gold', 1],
              ['Halb / halb', 0.5],
              ['Alles Holz', 0],
            ] as const
          ).map(([label, share]) => (
            <Button
              key={label}
              size="sm"
              className="flex-1"
              variant={goldShare === share ? 'selected' : 'default'}
              onClick={() => setGoldShare(share)}
            >
              {label}
            </Button>
          ))}
        </div>
      </div>
    </div>
  );

  return (
    <Locked className="mt-2 space-y-2 border-t border-ink/30 pt-2">
      {/* Raids list their own field armies (with meeting points) in RaidOptions; the trader
          only takes stone straight from a store. */}
      {target.kind !== 'army' && !trade && (
        <FieldRedirect
          view={view}
          target={target}
          position={position}
          verb={verb}
          minTroops={minTroops}
          ownBase={
            (target.kind === 'castle' && target.id === view.self.id) ||
            (target.kind === 'outpost' &&
              view.outposts.some((o) => o.id === target.id && o.ownerId === view.self.id))
          }
        />
      )}
      {trade ? (
        <>
          {tradeFields}
          {troopFields}
        </>
      ) : (
        <>
          {baseSelect}
          {troopFields}
        </>
      )}
      {activeCard && cardUsable && (
        <Tip label={CARDS[activeCard].description}>
          <Label className="gap-1.5 leading-snug">
            <Checkbox
              checked={useCard}
              onCheckedChange={(checked) => setUseCard(checked === true)}
            />
            <span>
              Aktive Karte mitschicken: <b>{CARDS[activeCard].name}</b>
            </span>
          </Label>
        </Tip>
      )}
      {troops < minTroops && <div className="text-seal">Mindestens {minTroops} Truppen nötig.</div>}
      {preview && <div className="text-ink-soft">{preview(troops)}</div>}
      <div className="flex items-center justify-between gap-2">
        <span className={travel === null ? 'text-seal' : 'text-ink-soft'}>
          {travel === null
            ? target.kind === 'army'
              ? 'Zu weit — der Zug ist vorher daheim.'
              : 'Kein Landweg dorthin.'
            : trade
              ? `Hin und zurück ${formatGameDuration(2 * (arrival ?? travel))} · beladen ${formatPercent(LOADED_SPEED)} Tempo${barefoot(view) ? ' · barfuß' : ''}`
              : `${target.kind === 'army' ? 'Überfall' : 'Ankunft'} in ${formatGameDuration(arrival ?? travel)}${stone > 0 ? ` · beladen ${formatPercent(LOADED_SPEED)} Tempo` : ''}${barefoot(view) ? ' · barfuß' : ''}`}
        </span>
        <Button variant="primary" onClick={send} disabled={!valid}>
          {verb}
        </Button>
      </div>
    </Locked>
  );
}

/**
 * Own armies in the field that could take this target instead: any status (also on the way
 * home), not already heading here; armies with cargo or a chest only on their way home and
 * only when the target is one of the player's own bases (`ownBase`). Redirecting re-routes them from where they
 * stand; cargo slows them (same rule as the server).
 */
function FieldRedirect({
  view,
  target,
  position,
  verb,
  minTroops,
  ownBase,
}: {
  view: GameView;
  target: ArmyTarget;
  position: Vec2;
  verb: string;
  minTroops: number;
  ownBase: boolean;
}) {
  const map = useGameStore((s) => s.map);
  if (!map) return null;
  const field = view.armies.filter(
    (a) =>
      a.ownerId === view.self.id &&
      a.duoWith === null &&
      // Loaded armies on their way home may switch to another own store (not a trade march).
      (ownBase
        ? a.status === 'returning' || !(hasResources(a.cargo) || a.chest)
        : !(hasResources(a.cargo) || a.chest)) &&
      !(a.target?.kind === target.kind && a.target.id === target.id),
  );
  if (field.length === 0) return null;
  return (
    <div>
      <div className="text-xs text-ink-soft">Zug im Feld umleiten:</div>
      <ul className="divide-y divide-ink/15">
        {field.map((army) => {
          const path = findPath(map, army.position, position);
          const troops = army.troops ?? 0;
          const enough = troops >= minTroops;
          const loaded = hasResources(army.cargo);
          const speed = (loaded ? LOADED_SPEED : 1) * (barefoot(view) ? BAREFOOT_SPEED : 1);
          return (
            <li key={army.id} className="flex items-center justify-between gap-2 py-1">
              <span className="min-w-0">
                Zug ({troops}) → {describeTarget(view, army.target)}
                {loaded && ` · mit ${formatResources(army.cargo)}`}
                <span className="block text-xs text-ink-soft">
                  {!path
                    ? 'Kein Landweg dorthin.'
                    : !enough
                      ? `Zu wenige Truppen (mind. ${minTroops}).`
                      : `Ankunft in ${formatGameDuration(travelMs(pathLength(path), map.width, army.forcedMarch, speed))}`}
                </span>
              </span>
              <Button
                disabled={!path || !enough}
                aria-label={`Umleiten: ${verb}`}
                onClick={() => gameSocket.send({ type: 'redirectArmy', armyId: army.id, target })}
              >
                Umleiten
              </Button>
            </li>
          );
        })}
      </ul>
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

/** Ambush options against an enemy convoy: redirect an army in the field or send from a base. */
function RaidOptions({ view, convoy }: { view: GameView; convoy: ArmyView }) {
  const map = useGameStore((s) => s.map);
  const track = trackOf(view, convoy);
  if (!map || !track) return null;
  const field = view.armies.filter(
    (a) => a.ownerId === view.self.id && a.duoWith === null && !hasResources(a.cargo) && !a.chest,
  );
  const strength = (troops: number) =>
    convoy.troops === null ? null : troops > convoy.troops ? 'überlegen' : 'unterlegen';
  return (
    <Locked className="mt-2 border-t border-ink/30 pt-2">
      <div className="font-bold">Überfallen</div>
      <p className="text-xs text-ink-soft">
        Abfangen, bevor der Zug sein Ziel erreicht. Wer mehr Truppen hat, gewinnt; der Sieger nimmt
        die ganze Ladung.
      </p>
      {field.length > 0 && (
        <ul className="mt-1 divide-y divide-ink/15">
          {field.map((army) => {
            const meeting = planIntercept(
              map,
              army.position,
              track,
              view.clock.clock,
              army.forcedMarch,
              barefoot(view) ? BAREFOOT_SPEED : 1,
            );
            return (
              <li key={army.id} className="flex items-center justify-between gap-2 py-1">
                <span className="min-w-0">
                  Zug ({army.troops}) → {describeTarget(view, army.target)}
                  <span className="block text-xs text-ink-soft">
                    {meeting
                      ? [
                          `Treffpunkt in ${formatGameDuration(meeting.clock - view.clock.clock)}`,
                          strength(army.troops ?? 0),
                        ]
                          .filter(Boolean)
                          .join(' · ')
                      : 'zu weit weg'}
                  </span>
                </span>
                <Button
                  variant="primary"
                  disabled={!meeting}
                  onClick={() =>
                    gameSocket.send({
                      type: 'redirectArmy',
                      armyId: army.id,
                      target: { kind: 'army', id: convoy.id },
                    })
                  }
                >
                  Umleiten
                </Button>
              </li>
            );
          })}
        </ul>
      )}
      <SendForm
        key={convoy.id}
        view={view}
        target={{ kind: 'army', id: convoy.id }}
        position={convoy.position}
        verb="Überfallen"
        bases={ownBases(view)}
        defaultTroops={(convoy.troops ?? 25) * 2}
        preview={strength}
      />
    </Locked>
  );
}

function ArmyDetails({ view, army }: { view: GameView; army: ArmyView }) {
  const own = army.ownerId === view.self.id;
  const remaining = army.arriveClock - view.clock.clock;
  const carrying = hasResources(army.cargo);
  const ownerRouted = view.players.find((p) => p.id === army.ownerId)?.routed ?? false;
  return (
    <>
      <Title icon={<SoldiersIcon color={cssColor(playerColor(view, army.ownerId))} />}>
        {army.duoWith
          ? `Duo-Zug: ${own ? 'du' : playerName(view, army.ownerId)} + ${army.duoWith === view.self.id ? 'du' : playerName(view, army.duoWith)}`
          : `Heerzug von ${own ? 'dir' : playerName(view, army.ownerId)}`}
      </Title>
      <div>
        {army.troops ?? '?'} Truppen · {STATUS_NAMES[army.status]}
      </div>
      <div className="text-ink-soft">
        Ziel: {describeTarget(view, army.target)} · noch {formatGameDuration(remaining)}
      </div>
      {carrying && (
        <div className="mt-1 flex items-center gap-1 font-bold text-[#8a6410]">
          Ladung: {formatResources(army.cargo)}
          {(army.status === 'returning' || army.status === 'outbound') && (
            <span className="font-normal text-ink-soft">
              {' '}
              · {formatPercent(LOADED_SPEED)} Tempo
            </span>
          )}
        </div>
      )}
      {army.chest && (
        <div className="mt-1 flex items-center gap-1 font-bold text-[#8a6410]">
          <ChestIcon size={18} /> Bringt eine Truhe heim — die Truhe kann niemand rauben.
        </div>
      )}
      {(army.fog || army.stealth || army.forcedMarch || army.sea) && (
        <div className="text-xs text-fortify italic">
          {[
            army.fog && 'Nebel',
            army.stealth && 'Tarnung',
            army.forcedMarch && 'Eilmarsch',
            army.sea && 'Seeweg',
          ]
            .filter(Boolean)
            .join(' · ')}
        </div>
      )}
      {own && (carrying || army.chest) && <StoreRedirect view={view} army={army} />}
      {army.duoWith && (army.ownerId === view.self.id || army.duoWith === view.self.id) && (
        <div className="mt-1 text-xs text-ink-soft italic">
          Duo-Pakt: abbrechen nur gemeinsam, im Posteingang.
        </div>
      )}
      {own && army.status !== 'returning' && !army.duoWith && (
        <Locked className="mt-2">
          <Button onClick={() => gameSocket.send({ type: 'recallArmy', armyId: army.id })}>
            Zurückrufen
          </Button>
        </Locked>
      )}
      {!own && carrying && ownerRouted && (
        <div className="mt-1 text-xs text-ink-soft italic">
          Zieht sich nach dem Fall der Burg zurück — unantastbar.
        </div>
      )}
      {!own && isRaidable(army, ownerRouted) && <RaidOptions view={view} convoy={army} />}
    </>
  );
}

/** A loaded own army can switch to any other own store (castle or outpost) to unload there. */
function StoreRedirect({ view, army }: { view: GameView; army: ArmyView }) {
  const current =
    army.status === 'returning' && army.target
      ? army.target.kind === 'castle'
        ? null
        : army.target.id
      : undefined;
  const stores = ownBases(view).filter((b) => b.id !== current);
  if (stores.length === 0) return null;
  return (
    <Locked className="mt-2">
      <div className="text-ink-soft">Abliefern in:</div>
      <div className="mt-0.5 flex flex-wrap gap-1.5">
        {stores.map((b) => (
          <Button
            key={b.id ?? 'home'}
            onClick={() =>
              gameSocket.send({
                type: 'redirectArmy',
                armyId: army.id,
                target:
                  b.id === null
                    ? { kind: 'castle', id: view.self.id }
                    : { kind: 'outpost', id: b.id },
              })
            }
          >
            {b.name}
          </Button>
        ))}
      </div>
    </Locked>
  );
}

function SelectionBody({ view, selection }: { view: GameView; selection: Selection }) {
  const bases = ownBases(view);
  switch (selection.kind) {
    case 'army': {
      const army = view.armies.find((a) => a.id === selection.id);
      return army ? <ArmyDetails view={view} army={army} /> : null;
    }
    case 'castle': {
      const player = view.players.find((p) => p.id === selection.id);
      if (!player?.castle) return null;
      const own = player.id === view.self.id;
      const outposts = bases.filter((b) => b.id !== null);
      return (
        <>
          <Title
            icon={
              <CastleIcon
                color={cssColor(playerColor(view, player.id))}
                style={playerHeraldry(view, player.id).style}
              />
            }
          >
            {own ? 'Deine Burg' : `Burg von ${player.name}`}
          </Title>
          <div>
            {player.homeTroops} Verteidiger · {player.victoryPoints} Siegpunkte
          </div>
          {player.fortified && <div className="text-fortify italic">Bollwerk aktiv (+50 %)</div>}
          {player.barefoot && (
            <div className="text-seal italic">
              Barfuß — neue Züge laufen mit {formatPercent(BAREFOOT_SPEED)} Tempo
            </div>
          )}
          {own && view.self.harvestDays > 0 && (
            <div className="text-gold-deep italic">
              Füllhorn: noch {view.self.harvestDays}{' '}
              {view.self.harvestDays === 1 ? 'Spieltag' : 'Spieltage'} +1 auf alles
            </div>
          )}
          {player.routed && (
            <div className="text-seal italic">Gefallen — alle Truppen ziehen sich zurück</div>
          )}
          {own ? (
            outposts.length > 0 && (
              <>
                <p className="mt-1 text-xs text-ink-soft">
                  Truppen heimholen geht jederzeit, Ressourcen bleiben im Stützpunkt. Die Karawane
                  bringt sie um 18 Uhr in die Burg, ausgeben lassen sie sich am nächsten Morgen.
                </p>
                <SendForm
                  key={selection.id}
                  view={view}
                  target={selection}
                  position={player.castle}
                  verb="Heimholen"
                  bases={outposts}
                />
              </>
            )
          ) : player.routed ? (
            <p className="mt-1 text-xs text-ink-soft">
              Gefallen: nicht angreifbar, bis alle Truppen von {player.name} wieder daheim sind.
            </p>
          ) : (
            <>
              <p className="mt-1 text-xs text-ink-soft">
                Sieg: du verlierst 25 %, die Verteidigung 50 %, du erbeutest 50 % der Ressourcen und
                eine Truhe; der Verlierer gibt seine Stützpunkte auf und zieht alle Truppen zurück.
                Niederlage: dein Zug fällt, die Verteidigung verliert 25 %.
              </p>
              <SendForm
                key={selection.id}
                view={view}
                target={selection}
                position={player.castle}
                verb="Angreifen"
                bases={bases}
              />
              <DuoForm key={`duo-${selection.id}`} view={view} target={selection} />
            </>
          )}
        </>
      );
    }
    case 'outpost': {
      const outpost = view.outposts.find((o) => o.id === selection.id);
      if (!outpost) return null;
      const own = outpost.ownerId === view.self.id;
      const color = outpost.ownerId ? playerColor(view, outpost.ownerId) : NEUTRAL_COLOR;
      return (
        <>
          <Title icon={<OutpostIcon color={outpost.ownerId ? cssColor(color) : null} size={24} />}>
            {own ? 'Dein Stützpunkt' : outpostLabel(view, outpost)}
          </Title>
          <div>
            {outpost.ownerId ? '' : 'Verfallen und unbesetzt · '}
            {outpost.troops} Truppen
          </div>
          <div className="text-ink-soft">Lager: {formatResources(outpost.resources, 'leer')}</div>
          <p className="mt-1 text-xs text-ink-soft">
            {own
              ? `Bringt täglich +${OUTPOST_DAILY_INCOME} jedes Rohstoffs in die Burg. Das Lager zieht um 18 Uhr per Karawane heim. Wer mit mehr Truppen angreift, übernimmt den Stützpunkt samt Lager.`
              : outpost.ownerId
                ? 'Mehr Truppen als die Besatzung schicken, um ihn samt Lager zu übernehmen.'
                : 'Wer die Ruine einnimmt, baut sie als eigenen Stützpunkt wieder auf.'}
          </p>
          <SendForm
            key={selection.id}
            view={view}
            target={selection}
            position={outpost.position}
            verb={own ? 'Verlegen' : outpost.ownerId ? 'Angreifen' : 'Einnehmen'}
            bases={bases.filter((b) => b.id !== outpost.id)}
          />
          {!own && outpost.ownerId && (
            <DuoForm key={`duo-${selection.id}`} view={view} target={selection} />
          )}
        </>
      );
    }
    case 'spot': {
      const spot = view.spots.find((s) => s.id === selection.id);
      if (!spot) return null;
      const here = view.armies.filter(
        (a) => a.status === 'gathering' && a.target?.kind === 'spot' && a.target.id === spot.id,
      );
      if (spot.resource === 'trader') {
        return (
          <>
            <Title icon={<SpotIcon kind="trader" size={30} />}>Händler</Title>
            <div className="text-ink-soft">
              Tauscht Stein 1:1 gegen Gold und Holz, sofort bei Ankunft. Deine Truppen tragen hin
              und zurück — beladen langsamer und überfallbar.
            </div>
            <SendForm
              key={selection.id}
              view={view}
              target={selection}
              position={spot.position}
              verb="Handeln"
              bases={bases}
              defaultTroops={10}
              trade
            />
          </>
        );
      }
      const name = RESOURCE_NAMES[spot.resource];
      return (
        <>
          <Title icon={<ResourceIcon resource={spot.resource} size={26} />}>{name}-Vorkommen</Title>
          <div className="text-ink-soft">
            Deine Truppen ziehen hin, laden {formatGameDuration(GATHER_DURATION_MS)} lang und
            bringen je 100 Truppen {GATHER_YIELD_PER_100_TROOPS} {name} heim. Beladen marschieren
            sie heim nur mit {formatPercent(LOADED_SPEED)} Tempo und können überfallen werden.
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
            verb="Sammeln"
            bases={bases}
            preview={(troops) => `Bringt ${gatherYield(troops)} ${name} zurück.`}
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
          <div>
            Zum Öffnen braucht es <b>{chest.troopsNeeded} Truppen</b>.
          </div>
          <div className="text-ink-soft">
            Enthält eine Spezialkarte. Wer zuerst mit genug Truppen ankommt, birgt sie; die Truppen
            bringen sie direkt heim und können dabei nicht überfallen werden. Daheim öffnest du sie.
          </div>
          <SendForm
            key={selection.id}
            view={view}
            target={selection}
            position={chest.position}
            verb="Hinschicken"
            bases={bases}
            defaultTroops={chest.troopsNeeded}
            minTroops={chest.troopsNeeded}
          />
        </>
      );
    }
    case 'caravan': {
      const trip = view.self.caravanTrip;
      const wagon = trip?.wagons[Number(selection.id)];
      if (!trip || !wagon) return null;
      const arrival = new Date(trip.arrivesAt).toLocaleTimeString('de-DE', {
        hour: '2-digit',
        minute: '2-digit',
      });
      return (
        <>
          <Title icon={<CaravanIcon color={cssColor(playerColor(view, view.self.id))} size={26} />}>
            Deine Karawane
          </Title>
          <div>Ladung: {formatResources(wagon.load)}</div>
          <div className="text-ink-soft">Ankunft in der Burg: {arrival} Uhr</div>
          <p className="mt-1 text-xs text-ink-soft">
            Bringt das Lager der Stützpunkte über Nacht heim. Sie braucht keine Truppen und kann
            nicht überfallen werden; ausgeben lässt sich die Ladung, sobald sie in der Burg ist.
          </p>
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
    case 'outpost':
      return view.outposts.some((o) => o.id === selection.id);
    case 'spot':
      return view.spots.some((s) => s.id === selection.id);
    case 'chest':
      return view.chests.some((c) => c.id === selection.id);
    case 'caravan':
      return view.self.caravanTrip?.wagons[Number(selection.id)] !== undefined;
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
        Klicke auf der Karte auf eine Burg, einen Stützpunkt, ein Vorkommen, eine Truhe oder einen
        Heerzug.
      </p>
    );
  }
  return (
    <div>
      <Button
        variant="ghost"
        size="icon-sm"
        className="float-right -mt-0.5"
        onClick={() => select(null)}
        aria-label="Auswahl schließen"
      >
        <XIcon />
      </Button>
      <SelectionBody view={view} selection={selection} />
    </div>
  );
}
