import type { LobbyInfo } from '@vectoria/shared';
import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { api } from '../net/api';
import { useGameStore } from '../state/store';
import { Button, Panel } from './Panel';

const LOBBY_POLL_MS = 3_000;

function useLobby(): LobbyInfo | null {
  const [lobby, setLobby] = useState<LobbyInfo | null>(null);
  useEffect(() => {
    let active = true;
    const load = () =>
      api
        .lobby()
        .then((info) => active && setLobby(info))
        .catch(() => {});
    void load();
    const timer = setInterval(load, LOBBY_POLL_MS);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, []);
  return lobby;
}

function PlayerList({ names }: { names: string[] }) {
  return (
    <ul className="mt-2 flex flex-wrap gap-1.5">
      {names.map((name) => (
        <li key={name} className="rounded bg-slate-800 px-2 py-0.5 text-slate-200">
          {name}
        </li>
      ))}
    </ul>
  );
}

function Centered({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-full items-center justify-center p-4">
      <div className="w-full max-w-md space-y-3">{children}</div>
    </div>
  );
}

/** Registration form; shown when there is no session token. */
export function JoinScreen() {
  const lobby = useLobby();
  const setToken = useGameStore((s) => s.setToken);
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    api
      .join(name)
      .then(({ token }) => setToken(token))
      .catch((e: Error) => setError(e.message))
      .finally(() => setBusy(false));
  };

  const open = lobby?.phase === 'registration';
  return (
    <Centered>
      <Panel className="px-5 py-4">
        <h1 className="text-xl font-semibold tracking-wide">Vectoria</h1>
        {lobby && !open ? (
          <p className="mt-2 text-slate-300">
            Die Anmeldung ist geschlossen — das Spiel läuft bereits mit {lobby.players.length}{' '}
            Spieler:innen.
          </p>
        ) : (
          <form onSubmit={submit} className="mt-3 space-y-2">
            <label className="block text-slate-300" htmlFor="name">
              Dein Name
            </label>
            <input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={24}
              autoFocus
              className="w-full rounded border border-white/10 bg-slate-800 px-2 py-1.5 outline-none focus:border-amber-400"
            />
            {error && <p className="text-rose-400">{error}</p>}
            <Button type="submit" variant="primary" disabled={busy || name.trim().length < 2}>
              Anmelden
            </Button>
          </form>
        )}
      </Panel>
      {lobby && lobby.players.length > 0 && (
        <Panel title={`Angemeldet (${lobby.players.length})`}>
          <PlayerList names={lobby.players} />
        </Panel>
      )}
    </Centered>
  );
}

/** Shown after joining while the admin hasn't started the game yet. */
export function Lobby() {
  const view = useGameStore((s) => s.view);
  if (!view) {
    return (
      <Centered>
        <Panel>Verbinde…</Panel>
      </Centered>
    );
  }
  return (
    <Centered>
      <Panel className="px-5 py-4">
        <h1 className="text-xl font-semibold tracking-wide">Willkommen, {view.self.name}</h1>
        <p className="mt-2 text-slate-300">
          Du bist angemeldet. Sobald die Anmeldung schließt, wird die Karte für alle Teilnehmenden
          erzeugt und das Spiel startet.
        </p>
        <p className="mt-2 text-slate-400">
          Spielzeit: Montag–Freitag, 10–18 Uhr. Ziel: {view.victoryPointsToWin} Siegpunkte.
        </p>
      </Panel>
      <Panel title={`Angemeldet (${view.players.length})`}>
        <PlayerList names={view.players.map((p) => p.name)} />
      </Panel>
    </Centered>
  );
}
