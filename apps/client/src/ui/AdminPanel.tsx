import {
  CARDS,
  RESOURCE_NAMES,
  RESOURCES,
  type AdminAction,
  type AdminState,
  type ResourceType,
} from '@vectoria/shared';
import { useCallback, useEffect, useState } from 'react';
import { formatGameDuration } from '../game/format';
import { api } from '../net/api';
import { Button, Panel } from './Panel';

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

/** Admin panel at `/?admin`: close registration, control the clock, manage players. */
export function AdminPanel() {
  const [token, setToken] = useState(storedToken);
  const [input, setInput] = useState('');
  const [state, setState] = useState<AdminState | null>(null);
  const [error, setError] = useState<string | null>(null);
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
            <input
              type="password"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Admin-Token"
              className="flex-1 border border-ink/50 bg-parchment-dark px-2 py-1"
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
    <div className="mx-auto h-full max-w-5xl space-y-3 overflow-y-auto p-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold italic">Vectoria · Admin</h1>
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
                  {state.chests} Truhen
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
            <div className="mb-2 flex items-center gap-2 text-ink-soft">
              Gutschrift:
              <input
                type="number"
                value={grant.amount}
                onChange={(e) => setGrant({ ...grant, amount: Math.trunc(Number(e.target.value)) })}
                className="w-16 border border-ink/50 bg-parchment-dark px-2 py-0.5"
              />
              <select
                value={grant.resource}
                onChange={(e) => setGrant({ ...grant, resource: e.target.value as ResourceType })}
                className="border border-ink/50 bg-parchment-dark px-2 py-0.5"
              >
                {RESOURCES.map((r) => (
                  <option key={r} value={r}>
                    {RESOURCE_NAMES[r]}
                  </option>
                ))}
              </select>
            </div>
            <table className="w-full text-left tabular-nums">
              <thead className="text-ink-soft">
                <tr>
                  <th className="py-1">Name</th>
                  <th>SP</th>
                  <th>Truppen (Haus / weg)</th>
                  <th>Ressourcen</th>
                  <th>Karten</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {state.players.map((p) => (
                  <tr key={p.id} className="border-t border-ink/20">
                    <td className="py-1">
                      <span className={p.online ? 'text-moss' : ''}>{p.name}</span>
                    </td>
                    <td>{p.victoryPoints}</td>
                    <td>
                      {p.homeTroops} / {p.troopsAway}
                    </td>
                    <td>{RESOURCES.map((r) => p.resources[r]).join(' / ')}</td>
                    <td className="text-xs">
                      {p.cards.map((c) => CARDS[c].name).join(', ') || '—'}
                    </td>
                    <td className="space-x-1 text-right">
                      <Button onClick={() => run({ action: 'grant', playerId: p.id, ...grant })}>
                        +{grant.amount} {RESOURCE_NAMES[grant.resource]}
                      </Button>
                      <Button
                        variant="danger"
                        onClick={() =>
                          run({ action: 'kick', playerId: p.id }, `${p.name} entfernen?`)
                        }
                      >
                        Entfernen
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Panel>
        </>
      )}
    </div>
  );
}
