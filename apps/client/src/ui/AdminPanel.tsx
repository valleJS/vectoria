import {
  CARDS,
  RESOURCE_NAMES,
  RESOURCES,
  type AdminAction,
  type AdminPlayer,
  type AdminState,
} from '@vectoria/shared';
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { formatGameDuration } from '../game/format';
import { api } from '../net/api';
import { OnlineDot, ResourceIcon, SoldiersIcon, TrophyIcon } from './icons';
import { Button, Panel, Tip } from './Panel';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

const TOKEN_KEY = 'vectoria.adminToken';
const POLL_MS = 2_000;
/** The admin list has no player colours; troops show in plain ink-brown. */
const TROOP_COLOR = '#8a7550';

const PHASE_NAMES: Record<AdminState['phase'], string> = {
  registration: 'Anmeldung offen',
  running: 'läuft',
  ended: 'beendet',
};

function storedToken(): string {
  try {
    return localStorage.getItem(TOKEN_KEY) ?? '';
  } catch {
    return '';
  }
}

/** Steps the −/+ buttons can change a value by; picked once for the whole player list. */
const STEPS = [1, 10, 100] as const;
type Step = (typeof STEPS)[number];

/** One value with − and + buttons that change it by `step`; big enough to tap on a phone. */
function AdjustRow({
  icon,
  label,
  value,
  extra,
  step,
  onAdjust,
}: {
  icon: ReactNode;
  label: string;
  value: number;
  extra?: ReactNode;
  step: number;
  onAdjust: (amount: number) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="flex w-6 shrink-0 justify-center">{icon}</span>
      <span className="min-w-0 flex-1 truncate">
        {label} <b className="tabular-nums">{value}</b>
        {extra}
      </span>
      <span className="flex shrink-0 gap-1">
        <Button
          size="sm"
          className="h-9 min-w-12 text-sm sm:h-7 sm:min-w-11 sm:text-xs"
          disabled={value === 0}
          aria-label={`${label} −${step}`}
          onClick={() => onAdjust(-step)}
        >
          −{step}
        </Button>
        <Button
          size="sm"
          className="h-9 min-w-12 text-sm sm:h-7 sm:min-w-11 sm:text-xs"
          aria-label={`${label} +${step}`}
          onClick={() => onAdjust(step)}
        >
          +{step}
        </Button>
      </span>
    </div>
  );
}

/** A small labelled fact for the game status. */
function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-ink-soft">{label}</dt>
      <dd className="truncate font-bold">{children}</dd>
    </div>
  );
}

/** One player's card: login email, troops and each resource with its own −/+. */
function PlayerCard({
  player: p,
  step,
  run,
}: {
  player: AdminPlayer;
  step: Step;
  run: (action: AdminAction, confirmText?: string) => void;
}) {
  return (
    <div className="space-y-2 border border-ink/30 p-2.5">
      <div className="flex items-center justify-between gap-2">
        <span className="inline-flex min-w-0 items-center gap-1.5 font-bold">
          <OnlineDot online={p.online} />
          <Tip label="Namen ändern">
            <Button
              variant="link"
              className="min-w-0 truncate text-left font-bold decoration-dotted"
              onClick={() => {
                const name = window.prompt(`Neuer Name für ${p.name}:`, p.name);
                if (name && name.trim() !== p.name) {
                  run({ action: 'rename', playerId: p.id, name });
                }
              }}
            >
              {p.name}
            </Button>
          </Tip>
        </span>
        <span className="shrink-0 tabular-nums">{p.victoryPoints} SP</span>
      </div>
      <Tip label="E-Mail für den Login ändern">
        <Button
          variant="link"
          className="max-w-full truncate text-left text-xs decoration-dotted"
          onClick={() => {
            const email = window.prompt(`Login-E-Mail für ${p.name}:`, p.email ?? '');
            if (email) run({ action: 'setEmail', playerId: p.id, email });
          }}
        >
          {p.email ?? 'keine E-Mail — setzen'}
        </Button>
      </Tip>
      <div className="space-y-1.5">
        <AdjustRow
          icon={<SoldiersIcon color={TROOP_COLOR} size={20} />}
          label="Truppen"
          value={p.homeTroops}
          extra={
            p.troopsAway > 0 && (
              <span className="text-xs text-ink-soft"> · {p.troopsAway} unterwegs</span>
            )
          }
          step={step}
          onAdjust={(amount) => run({ action: 'grantTroops', playerId: p.id, amount })}
        />
        {RESOURCES.map((r) => (
          <AdjustRow
            key={r}
            icon={<ResourceIcon resource={r} size={18} />}
            label={RESOURCE_NAMES[r]}
            value={p.resources[r]}
            step={step}
            onAdjust={(amount) => run({ action: 'grant', playerId: p.id, resource: r, amount })}
          />
        ))}
        <AdjustRow
          icon={<TrophyIcon size={18} />}
          label="Trophäen"
          value={p.trophies}
          step={step}
          onAdjust={(amount) => run({ action: 'grantTrophies', playerId: p.id, amount })}
        />
      </div>
      <div className="text-xs text-ink-soft">
        Karten: {p.cards.map((c) => CARDS[c].name).join(', ') || '—'}
      </div>
      <div className="flex justify-end">
        <Button
          size="sm"
          variant="danger"
          className="h-9 sm:h-7"
          onClick={() => run({ action: 'kick', playerId: p.id }, `${p.name} entfernen?`)}
        >
          Entfernen
        </Button>
      </div>
    </div>
  );
}

/** "Mi, 11.11.2026" for a `YYYY-MM-DD` calendar day. */
function formatDay(date: string): string {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y!, m! - 1, d!)).toLocaleDateString('de-DE', {
    weekday: 'short',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

/** Calendar days without a gameday (e.g. a holiday): the game clock stands still all day. */
function BreakDays({
  days,
  run,
}: {
  days: string[];
  run: (action: AdminAction, confirmText?: string) => void;
}) {
  const [date, setDate] = useState('');
  return (
    <Panel title="Pausentage">
      <p className="mb-2 text-xs text-ink-soft">
        An einem Pausentag steht die Spieluhr den ganzen Tag still und kein neuer Spieltag beginnt —
        wie am Wochenende. Die Karawane vom Vorabend kommt am nächsten Spieltag an.
      </p>
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (!date) return;
          run({ action: 'setBreakDay', date, on: true });
          setDate('');
        }}
      >
        <Input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          aria-label="Datum des Pausentags"
          className="h-10 w-44 sm:h-7"
        />
        <Button type="submit" className="h-10 sm:h-7" disabled={!date}>
          Hinzufügen
        </Button>
      </form>
      {days.length > 0 ? (
        <ul className="mt-2 divide-y divide-ink/15">
          {days.map((day) => (
            <li key={day} className="flex items-center justify-between gap-2 py-1">
              <span className="tabular-nums">{formatDay(day)}</span>
              <Button
                size="sm"
                className="h-9 sm:h-7"
                onClick={() =>
                  run(
                    { action: 'setBreakDay', date: day, on: false },
                    `Pausentag ${formatDay(day)} aufheben?`,
                  )
                }
              >
                Aufheben
              </Button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-ink-soft">Keine Pausentage geplant.</p>
      )}
    </Panel>
  );
}

/** Admin panel at `/?admin`: close registration, control the clock, manage players. */
export function AdminPanel() {
  const [token, setToken] = useState(storedToken);
  const [input, setInput] = useState('');
  const [state, setState] = useState<AdminState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [swap, setSwap] = useState<{ a: string; b: string }>({ a: '', b: '' });
  const [step, setStep] = useState<Step>(1);

  useEffect(() => {
    if (!token) return;
    let active = true;
    const load = () =>
      api
        .adminState(token)
        .then((s) => {
          if (!active) return;
          setState(s);
          setError(null);
        })
        .catch((e: Error) => active && setError(e.message));
    void load();
    const timer = setInterval(load, POLL_MS);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [token]);

  const run = useCallback(
    (action: AdminAction, confirmText?: string) => {
      if (confirmText && !window.confirm(confirmText)) return;
      api
        .adminAction(token, action)
        .then((s) => {
          setState(s);
          setError(null);
        })
        .catch((e: Error) => setError(e.message));
    },
    [token],
  );

  if (!token) {
    return (
      <div className="flex h-full items-center justify-center p-4">
        <Panel title="Admin" className="w-full max-w-sm">
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              try {
                localStorage.setItem(TOKEN_KEY, input);
              } catch {
                // Session-only login is fine.
              }
              setToken(input);
            }}
          >
            <Input
              type="password"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Admin-Token"
              aria-label="Admin-Token"
              className="h-9 flex-1 sm:h-7"
            />
            <Button type="submit" variant="primary">
              Login
            </Button>
          </form>
        </Panel>
      </div>
    );
  }

  const running = state?.phase === 'running';
  const clockText = (clock: AdminState['clock']) =>
    clock.paused
      ? 'pausiert'
      : clock.breakToday
        ? 'Pausentag'
        : clock.running
          ? 'läuft'
          : 'außerhalb Spielzeit';
  // Bigger tap targets on phones, the usual compact size from `sm` up.
  const tap = 'h-10 sm:h-7';

  return (
    <div className="mx-auto h-full max-w-5xl space-y-3 overflow-y-auto p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:p-4">
      <div className="flex items-center justify-between gap-2">
        <h1 className="truncate text-xl font-bold italic sm:text-2xl">Vectoria · Admin</h1>
        <Button
          className={tap}
          onClick={() => {
            try {
              localStorage.removeItem(TOKEN_KEY);
            } catch {
              // Nothing stored.
            }
            setToken('');
            setState(null);
          }}
        >
          Logout
        </Button>
      </div>
      {error && <Panel className="border-seal/60 text-seal">{error}</Panel>}

      {state && (
        <>
          <Panel title="Spiel">
            <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-ink sm:grid-cols-4">
              <Fact label="Phase">{PHASE_NAMES[state.phase]}</Fact>
              <Fact label="Spieler:innen">{state.players.length}</Fact>
              {state.mapSize && (
                <Fact label="Karte">
                  {state.mapSize}×{state.mapSize}
                </Fact>
              )}
              {state.phase !== 'registration' && (
                <>
                  <Fact label="Gameday">{state.clock.gameday}</Fact>
                  <Fact label="Uhr">
                    {formatGameDuration(state.clock.clock)} · {clockText(state.clock)}
                  </Fact>
                  <Fact label="Modus">
                    {state.clock.mode}, {state.clock.timeScale}×
                  </Fact>
                  <Fact label="Züge · Truhen">
                    {state.armies} · {state.chests}
                  </Fact>
                  <Fact label="Stützpunkte">{state.outposts}</Fact>
                </>
              )}
            </dl>
            <div className="mt-3 grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
              {state.phase === 'registration' && (
                <Button
                  variant="primary"
                  className={`col-span-2 ${tap}`}
                  disabled={state.players.length === 0}
                  onClick={() =>
                    run(
                      { action: 'start' },
                      `Anmeldung schließen und Spiel mit ${state.players.length} Spieler:innen starten?`,
                    )
                  }
                >
                  Anmeldung schließen & starten
                </Button>
              )}
              {running && (
                <>
                  {state.clock.paused ? (
                    <Button className={tap} onClick={() => run({ action: 'resume' })}>
                      Fortsetzen
                    </Button>
                  ) : (
                    <Button className={tap} onClick={() => run({ action: 'pause' })}>
                      Pausieren
                    </Button>
                  )}
                  <Button className={tap} onClick={() => run({ action: 'advanceClock', hours: 1 })}>
                    +1 h Spielzeit
                  </Button>
                  <Button className={tap} onClick={() => run({ action: 'newGameday' })}>
                    Neuer Gameday
                  </Button>
                  <Button className={tap} onClick={() => run({ action: 'spawnChest' })}>
                    Truhe spawnen
                  </Button>
                  <Button
                    variant="danger"
                    className={tap}
                    onClick={() =>
                      run({ action: 'end' }, 'Spiel jetzt beenden? Höchste SP gewinnt.')
                    }
                  >
                    Spiel beenden
                  </Button>
                </>
              )}
              {state.phase !== 'registration' && (
                <Button
                  variant="danger"
                  className={tap}
                  onClick={() =>
                    run(
                      { action: 'reset' },
                      'Zurück zur Anmeldung? Spielstand wird gelöscht, Anmeldungen bleiben.',
                    )
                  }
                >
                  Zurücksetzen
                </Button>
              )}
            </div>
          </Panel>

          {state.phase !== 'ended' && <BreakDays days={state.clock.breakDays} run={run} />}

          {running && state.players.length > 1 && (
            <Panel title="Hauptburgen tauschen">
              <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 sm:flex sm:flex-wrap">
                {(['a', 'b'] as const).map((side, i) => (
                  <span key={side} className="contents">
                    {i === 1 && (
                      <span aria-hidden className="text-center">
                        ⇄
                      </span>
                    )}
                    <Select
                      value={swap[side] || undefined}
                      onValueChange={(value) => setSwap({ ...swap, [side]: value })}
                    >
                      <SelectTrigger
                        className="h-10 w-full min-w-0 text-ink sm:h-7 sm:w-44"
                        aria-label={i === 0 ? 'Erste Burg' : 'Zweite Burg'}
                      >
                        <SelectValue placeholder="— wählen —" />
                      </SelectTrigger>
                      <SelectContent>
                        {state.players.map((p) => (
                          <SelectItem key={p.id} value={p.id}>
                            {p.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </span>
                ))}
                <Button
                  className={`col-span-3 ${tap}`}
                  disabled={!swap.a || !swap.b || swap.a === swap.b}
                  onClick={() => {
                    const name = (id: string) => state.players.find((p) => p.id === id)?.name;
                    run(
                      { action: 'swapCastles', playerId: swap.a, otherId: swap.b },
                      `Burgen von ${name(swap.a)} und ${name(swap.b)} tauschen? Nur die Orte wechseln, alles andere bleibt bei den Spieler:innen.`,
                    );
                  }}
                >
                  Tauschen
                </Button>
              </div>
            </Panel>
          )}

          <Panel title="Spieler:innen">
            <div className="mb-3 flex items-center gap-2 text-ink-soft">
              <span>Schritt</span>
              <div className="flex gap-1" role="group" aria-label="Schrittweite für − und +">
                {STEPS.map((s) => (
                  <Button
                    key={s}
                    size="sm"
                    variant={s === step ? 'selected' : 'default'}
                    className="h-9 min-w-12 text-sm sm:h-7 sm:min-w-11 sm:text-xs"
                    aria-pressed={s === step}
                    onClick={() => setStep(s)}
                  >
                    {s}
                  </Button>
                ))}
              </div>
            </div>
            {state.players.length === 0 ? (
              <p className="text-ink-soft">Noch niemand angemeldet.</p>
            ) : (
              <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                {state.players.map((p) => (
                  <PlayerCard key={p.id} player={p} step={step} run={run} />
                ))}
              </div>
            )}
          </Panel>
        </>
      )}
    </div>
  );
}
