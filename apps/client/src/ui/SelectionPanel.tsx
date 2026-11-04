import {
  CARDS,
  emptyResources,
  findPath,
  GATHER_DURATION_MS,
  LOADED_SPEED,
  GATHER_YIELD_PER_100_TROOPS,
  gatherYield,
  hasResources,
  isRaidable,
  pathLength,
  planIntercept,
  RESOURCE_NAMES,
  RESOURCES,
  travelMs,
  type ArmyTarget,
  type ArmyView,
  type GameView,
  type MapData,
  type Resources,
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
  playerName,
  type BaseInfo,
} from '../game/format';
import { NEUTRAL_COLOR } from '../game/palette';
import { gameSocket } from '../net/socket';
import { useGameStore, type Selection } from '../state/store';
import { SoldiersIcon, CastleIcon, ChestIcon, ResourceIcon } from './icons';
import { Button } from './Panel';
import { Locked } from './Routed';

const distance = (a: Vec2, b: Vec2) => Math.hypot(a.x - b.x, a.y - b.y);

const STATUS_NAMES: Record<ArmyView['status'], string> = {
  outbound: 'unterwegs',
  gathering: 'sammelt',
  returning: 'auf dem Heimweg',
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
): number | null {
  if (target.kind === 'army') {
    const convoy = view.armies.find((a) => a.id === target.id);
    const track = convoy && trackOf(view, convoy);
    const meeting = track && planIntercept(map, from, track, view.clock.clock, forcedMarch);
    return meeting ? meeting.clock - view.clock.clock : null;
  }
  const path = findPath(map, from, position);
  return path ? travelMs(pathLength(path), map.width, forcedMarch) : null;
}

function SendForm({
  view,
  target,
  position,
  verb,
  bases,
  allowCargo = false,
  defaultTroops = 50,
  minTroops = 1,
  preview,
}: {
  view: GameView;
  target: ArmyTarget;
  position: Vec2;
  verb: string;
  /** Bases the troops may leave from; the nearest one with troops is preselected. */
  bases: BaseInfo[];
  /** Target is an own base: offer to carry resources along. */
  allowCargo?: boolean;
  defaultTroops?: number;
  /** Fewer troops than this cannot be sent (e.g. a chest's requirement). */
  minTroops?: number;
  /** Extra line under the form for the chosen troop count (e.g. expected yield). */
  preview?: (troops: number) => ReactNode;
}) {
  const map = useGameStore((s) => s.map);
  const [fromId, setFromId] = useState<string | null | undefined>(undefined);
  const [chosen, setTroops] = useState(defaultTroops);
  const [useCard, setUseCard] = useState(true);
  const [cargo, setCargo] = useState<Resources>(emptyResources);
  const activeCard = view.self.activeCard;
  const withCard = useCard && activeCard !== null;
  const forced = withCard && activeCard === 'forcedMarch';
  const nearest = [...bases].sort(
    (a, b) =>
      Number(b.troops > 0) - Number(a.troops > 0) ||
      distance(a.position, position) - distance(b.position, position),
  )[0];
  const base = bases.find((b) => b.id === fromId) ?? nearest;
  const travel = useMemo(
    () => (map && base ? eta(map, view, base.position, target, position, forced) : null),
    // Raids move with the convoy; recompute on every state update for those.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [map, base?.position, position, forced, target.kind === 'army' ? view.clock.clock : 0],
  );
  if (!base || !map) return null;

  // Troops shrink as armies leave; never offer more than are there.
  const available = base.troops;
  const troops = Math.min(chosen, available);
  const load = Object.fromEntries(
    RESOURCES.map((r) => [r, Math.min(cargo[r], base.resources[r])]),
  ) as Resources;
  // Carrying resources slows the march (same rule as the server).
  const loaded = allowCargo && hasResources(load);
  const arrival = travel !== null && loaded ? Math.round(travel / LOADED_SPEED) : travel;
  const valid = Number.isInteger(troops) && troops > 0 && troops >= minTroops && travel !== null;

  const send = () => {
    gameSocket.send({
      type: 'sendArmy',
      from: base.id,
      troops,
      target,
      useActiveCard: withCard,
      cargo: allowCargo ? load : emptyResources(),
    });
    setCargo(emptyResources());
  };

  return (
    <Locked className="mt-2 space-y-2 border-t border-ink/30 pt-2">
      {/* Raids list their own field armies (with meeting points) in RaidOptions. */}
      {target.kind !== 'army' && (
        <FieldRedirect
          view={view}
          target={target}
          position={position}
          verb={verb}
          minTroops={minTroops}
        />
      )}
      {bases.length > 1 && (
        <label className="flex items-center gap-2">
          <span className="text-ink-soft">Von</span>
          <select
            value={base.id ?? ''}
            onChange={(e) => setFromId(e.target.value || null)}
            className="min-w-0 flex-1 border border-ink/50 bg-parchment-dark px-1 py-0.5"
          >
            {bases.map((b) => (
              <option key={b.id ?? 'home'} value={b.id ?? ''}>
                {b.name} ({b.troops} Truppen)
              </option>
            ))}
          </select>
        </label>
      )}
      <input
        type="range"
        min={available > 0 ? 1 : 0}
        max={available}
        value={troops}
        onChange={(e) => setTroops(Number(e.target.value))}
        className="w-full accent-seal"
        aria-label="Truppen"
      />
      <div className="flex items-center gap-2">
        <input
          type="number"
          min={1}
          max={available}
          value={troops}
          onChange={(e) => setTroops(Math.floor(Number(e.target.value)))}
          className="w-20 border border-ink/50 bg-parchment-dark px-2 py-1 tabular-nums"
        />
        <span className="text-ink-soft">
          / {available} {base.id === null ? 'zu Hause' : 'vor Ort'}
        </span>
        <Button onClick={() => setTroops(available)} disabled={available === 0}>
          Alle
        </Button>
      </div>
      {allowCargo && hasResources(base.resources) && (
        <div>
          <div className="text-ink-soft">Mitnehmen:</div>
          <div className="mt-0.5 flex gap-2">
            {RESOURCES.map((r) => (
              <label key={r} className="flex items-center gap-1" title={RESOURCE_NAMES[r]}>
                <ResourceIcon resource={r} size={16} />
                <input
                  type="number"
                  min={0}
                  max={base.resources[r]}
                  value={load[r]}
                  onChange={(e) =>
                    setCargo({ ...cargo, [r]: Math.max(0, Math.floor(Number(e.target.value))) })
                  }
                  className="w-12 border border-ink/50 bg-parchment-dark px-1 py-0.5 tabular-nums"
                />
              </label>
            ))}
            <Button
              className="px-1.5 py-0.5 text-xs"
              onClick={() => setCargo({ ...base.resources })}
            >
              Alles
            </Button>
          </div>
        </div>
      )}
      {activeCard && (
        <label className="flex items-center gap-1" title={CARDS[activeCard].description}>
          <input
            type="checkbox"
            checked={useCard}
            className="accent-seal"
            onChange={(e) => setUseCard(e.target.checked)}
          />
          Aktive Karte mitschicken: <b>{CARDS[activeCard].name}</b>
        </label>
      )}
      {troops < minTroops && <div className="text-seal">Mindestens {minTroops} Truppen nötig.</div>}
      {preview && <div className="text-ink-soft">{preview(troops)}</div>}
      <div className="flex items-center justify-between gap-2">
        <span className={travel === null ? 'text-seal' : 'text-ink-soft'}>
          {travel === null
            ? target.kind === 'army'
              ? 'Zu weit — der Zug ist vorher daheim.'
              : 'Kein Landweg dorthin.'
            : `${target.kind === 'army' ? 'Überfall' : 'Ankunft'} in ${formatGameDuration(arrival ?? travel)}${loaded ? ` · beladen ${formatPercent(LOADED_SPEED)} Tempo` : ''}`}
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
 * home), but without cargo or a chest, and not already heading here. Redirecting re-routes them from where they stand.
 */
function FieldRedirect({
  view,
  target,
  position,
  verb,
  minTroops,
}: {
  view: GameView;
  target: ArmyTarget;
  position: Vec2;
  verb: string;
  minTroops: number;
}) {
  const map = useGameStore((s) => s.map);
  if (!map) return null;
  const field = view.armies.filter(
    (a) =>
      a.ownerId === view.self.id &&
      !hasResources(a.cargo) &&
      !a.chest &&
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
          return (
            <li key={army.id} className="flex items-center justify-between gap-2 py-1">
              <span className="min-w-0">
                Zug ({troops}) → {describeTarget(view, army.target)}
                <span className="block text-xs text-ink-soft">
                  {!path
                    ? 'Kein Landweg dorthin.'
                    : !enough
                      ? `Zu wenige Truppen (mind. ${minTroops}).`
                      : `Ankunft in ${formatGameDuration(travelMs(pathLength(path), map.width, army.forcedMarch))}`}
                </span>
              </span>
              <Button
                disabled={!path || !enough}
                title={verb}
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
    (a) => a.ownerId === view.self.id && !hasResources(a.cargo) && !a.chest,
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
        Heerzug von {own ? 'dir' : playerName(view, army.ownerId)}
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
      {(army.fog || army.stealth || army.forcedMarch) && (
        <div className="text-xs text-sea-dark italic">
          {[army.fog && 'Nebel', army.stealth && 'Tarnung', army.forcedMarch && 'Eilmarsch']
            .filter(Boolean)
            .join(' · ')}
        </div>
      )}
      {own && army.status !== 'returning' && (
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
          <Title icon={<CastleIcon color={cssColor(playerColor(view, player.id))} />}>
            {own ? 'Deine Burg' : `Burg von ${player.name}`}
          </Title>
          <div>
            {player.homeTroops} Verteidiger · {player.victoryPoints} Siegpunkte
          </div>
          {player.fortified && <div className="text-sea-dark italic">Bollwerk aktiv (+50 %)</div>}
          {player.routed && (
            <div className="text-seal italic">Gefallen — alle Truppen ziehen sich zurück</div>
          )}
          {own ? (
            outposts.length > 0 && (
              <>
                <p className="mt-1 text-xs text-ink-soft">
                  Nur Ressourcen in der Burg sind sicher und können ausgegeben werden.
                </p>
                <SendForm
                  key={selection.id}
                  view={view}
                  target={selection}
                  position={player.castle}
                  verb="Heimholen"
                  bases={outposts}
                  allowCargo
                />
              </>
            )
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
          <Title icon={<CastleIcon color={cssColor(color)} size={22} />}>
            {own ? 'Dein Stützpunkt' : outpostLabel(view, outpost)}
          </Title>
          <div>
            {outpost.ownerId ? '' : 'Verfallen und unbesetzt · '}
            {outpost.troops} Truppen
          </div>
          <div className="text-ink-soft">Lager: {formatResources(outpost.resources, 'leer')}</div>
          <p className="mt-1 text-xs text-ink-soft">
            {own
              ? 'Truppen und Ressourcen lassen sich hier sammeln. Wer mit mehr Truppen angreift, übernimmt den Stützpunkt samt Lager.'
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
            allowCargo={own}
          />
        </>
      );
    }
    case 'spot': {
      const spot = view.spots.find((s) => s.id === selection.id);
      if (!spot) return null;
      const here = view.armies.filter(
        (a) => a.status === 'gathering' && a.target?.kind === 'spot' && a.target.id === spot.id,
      );
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
