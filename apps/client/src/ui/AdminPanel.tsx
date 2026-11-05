import {
  CARDS,
  RESOURCE_NAMES,
  RESOURCES,
  type AdminAction,
  type AdminState,
  type ResourceType,
} from '@vectoria/shared';
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { formatGameDuration } from '../game/format';
import { api } from '../net/api';
import { OnlineDot, ResourceIcon } from './icons';
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

/** A value with − and + buttons that change it by `step`. */
function AdjustRow({
  label,
  step,
  onAdjust,
}: {
  label: ReactNode;
  step: number;
  onAdjust: (amount: number) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="min-w-0">{label}</span>
      <span className="flex shrink-0 gap-1">
        <Button size="sm" className="min-w-11" onClick={() => onAdjust(-step)}>
          −{step}
        </Button>
        <Button size="sm" className="min-w-11" onClick={() => onAdjust(step)}>
          +{step}
        </Button>
      </span>
    </div>
  );
}

/** Admin panel at `/?admin`: close registration, control the clock, manage players. */
export function AdminPanel() {
  const [token, setToken] = useState(storedToken);
  const [input, setInput] = useState('');
  const [state, setState] = useState<AdminState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [swap, setSwap] = useState<{ a: string; b: string }>({ a: '', b: '' });
  const [grant, setGrant] = useState<{ resource: ResourceType; amount: number }>({
    resource: 'wood',
    amount: 5,
  });

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
              className="h-7 flex-1"
            />
            <Button type="submit" variant="primary">
              Login
            </Button>
          </form>
        </Panel>
      </div>
    );
  }

  return (
    <div className="mx-auto h-full max-w-5xl space-y-3 overflow-y-auto p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:p-4">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-xl font-bold italic sm:text-2xl">Vectoria · Admin</h1>
        <Button
          onClick={() => {
            localStorage.removeItem(TOKEN_KEY);
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
            <div className="text-ink">
              Phase: <b>{PHASE_NAMES[state.phase]}</b> · {state.players.length} Spieler:innen
              {state.mapSize && ` · Karte ${state.mapSize}×${state.mapSize}`}
              {state.phase !== 'registration' && (
                <>
                  {' '}
                  · Gameday {state.clock.gameday} · Uhr {formatGameDuration(state.clock.clock)} ·{' '}
                  {state.clock.paused
                    ? 'pausiert'
                    : state.clock.running
                      ? 'läuft'
                      : 'außerhalb Spielzeit'}{' '}
                  · Modus {state.clock.mode}, {state.clock.timeScale}× · {state.armies} Züge ·{' '}
                  {state.chests} Truhen · {state.outposts} Stützpunkte
                </>
              )}
            </div>
            <div className="mt-2 flex flex-wrap gap-2">
              {state.phase === 'registration' && (
                <Button
                  variant="primary"
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
              {state.phase === 'running' && (
                <>
                  {state.clock.paused ? (
                    <Button onClick={() => run({ action: 'resume' })}>Fortsetzen</Button>
                  ) : (
                    <Button onClick={() => run({ action: 'pause' })}>Pausieren</Button>
                  )}
                  <Button onClick={() => run({ action: 'advanceClock', hours: 1 })}>
                    +1 h Spielzeit
                  </Button>
                  <Button onClick={() => run({ action: 'newGameday' })}>
                    Neuer Gameday (Auszahlung)
                  </Button>
                  <Button onClick={() => run({ action: 'spawnChest' })}>Truhe spawnen</Button>
                  <Button
                    variant="danger"
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

          <Panel title="Spieler:innen">
            <div className="mb-2 flex flex-wrap items-center gap-2 text-ink-soft">
              Gutschrift:
              <Input
                type="number"
                value={grant.amount}
                onChange={(e) => setGrant({ ...grant, amount: Math.trunc(Number(e.target.value)) })}
                aria-label="Menge"
                className="h-7 w-16"
              />
              <Select
                value={grant.resource}
                onValueChange={(value) => setGrant({ ...grant, resource: value as ResourceType })}
              >
                <SelectTrigger className="h-7 w-28" aria-label="Rohstoff">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {RESOURCES.map((r) => (
                    <SelectItem key={r} value={r}>
                      {RESOURCE_NAMES[r]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {state.phase === 'running' && state.players.length > 1 && (
              <div className="mb-2 flex flex-wrap items-center gap-2 text-ink-soft">
                Hauptburgen tauschen:
                {(['a', 'b'] as const).map((side, i) => (
                  <span key={side} className="contents">
                    {i === 1 && <span aria-hidden>⇄</span>}
                    <Select
                      value={swap[side] || undefined}
                      onValueChange={(value) => setSwap({ ...swap, [side]: value })}
                    >
                      <SelectTrigger
                        className="h-7 w-40 text-ink"
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
            )}
            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
              {state.players.map((p) => (
                <div key={p.id} className="space-y-1.5 border border-ink/30 p-2 tabular-nums">
                  <div className="flex items-center justify-between gap-2">
                    <span className="inline-flex min-w-0 items-center gap-1.5 font-bold">
                      <OnlineDot online={p.online} />
                      <span className="truncate">{p.name}</span>
                    </span>
                    <span className="shrink-0">{p.victoryPoints} SP</span>
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
                  <AdjustRow
                    label={
                      <>
                        Truppen <b>{p.homeTroops}</b>
                        <span className="text-ink-soft"> · {p.troopsAway} unterwegs</span>
                      </>
                    }
                    step={10}
                    onAdjust={(amount) => run({ action: 'grantTroops', playerId: p.id, amount })}
                  />
                  <AdjustRow
                    label={
                      <span className="inline-flex flex-wrap items-center gap-x-2">
                        {RESOURCES.map((r) => (
                          <span key={r} className="inline-flex items-center gap-0.5">
                            <ResourceIcon resource={r} size={16} title={RESOURCE_NAMES[r]} />
                            <b>{p.resources[r]}</b>
                          </span>
                        ))}
                      </span>
                    }
                    step={1}
                    onAdjust={(amount) => run({ action: 'grantAll', playerId: p.id, amount })}
                  />
                  <div className="text-xs text-ink-soft">
                    Karten: {p.cards.map((c) => CARDS[c].name).join(', ') || '—'}
                  </div>
                  <div className="flex flex-wrap justify-end gap-1">
                    <Button
                      size="sm"
                      onClick={() => run({ action: 'grant', playerId: p.id, ...grant })}
                    >
                      +{grant.amount} {RESOURCE_NAMES[grant.resource]}
                    </Button>
                    <Button
                      size="sm"
                      variant="danger"
                      onClick={() =>
                        run({ action: 'kick', playerId: p.id }, `${p.name} entfernen?`)
                      }
                    >
                      Entfernen
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </Panel>
        </>
      )}
    </div>
  );
}
