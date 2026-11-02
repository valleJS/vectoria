import type { LobbyInfo } from '@vectoria/shared';
import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { api } from '../net/api';
import type { LoginLink } from '../net/loginLink';
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
        <li key={name} className="border border-ink/40 bg-parchment-dark px-2 py-0.5 text-ink">
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

const INPUT =
  'w-full border border-ink/50 bg-parchment-dark px-2 py-1.5 outline-none focus:border-seal';

type Step = 'email' | 'name' | 'code';

/**
 * Passwordless login and registration: email → (name, if new and registration is open) →
 * emailed 6-digit code. A login link from the email skips straight to verifying.
 */
export function JoinScreen({ link, onDone }: { link?: LoginLink | null; onDone?: () => void }) {
  const lobby = useLobby();
  const setToken = useGameStore((s) => s.setToken);
  const [step, setStep] = useState<Step>(link ? 'code' : 'email');
  const [email, setEmail] = useState(link?.email ?? '');
  const [name, setName] = useState('');
  const [code, setCode] = useState(link?.code ?? '');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(Boolean(link));

  const verify = (verifyEmail: string, verifyCode: string) =>
    api
      .authVerify({ email: verifyEmail, code: verifyCode })
      .then(({ token }) => {
        setToken(token);
        onDone?.();
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setBusy(false));

  // Login link: verify once on mount.
  useEffect(() => {
    if (link) void verify(link.email, link.code);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const requestCode = (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    api
      .authStart({ email, ...(step === 'name' ? { name } : {}) })
      .then(({ status }) => setStep(status === 'needsName' ? 'name' : 'code'))
      .catch((e: Error) => setError(e.message))
      .finally(() => setBusy(false));
  };

  const submitCode = (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    void verify(email, code);
  };

  const open = lobby?.phase === 'registration';
  return (
    <Centered>
      <Panel className="px-5 py-4">
        <h1 className="text-2xl font-bold italic">Vectoria</h1>
        {step === 'code' ? (
          <form onSubmit={submitCode} className="mt-3 space-y-2">
            <p className="text-ink">
              Wir haben dir einen Code an <b>{email}</b> geschickt.
            </p>
            <label className="block text-ink" htmlFor="code">
              Anmeldecode
            </label>
            <input
              id="code"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={8}
              autoFocus
              className={`${INPUT} text-center text-xl tracking-[0.4em] tabular-nums`}
            />
            {error && <p className="text-seal">{error}</p>}
            <div className="flex items-center justify-between gap-2">
              <Button type="submit" variant="primary" disabled={busy || code.trim().length < 6}>
                Anmelden
              </Button>
              <button
                type="button"
                className="text-ink-soft underline hover:text-seal"
                onClick={() => {
                  setStep('email');
                  setCode('');
                  setError(null);
                }}
              >
                Andere E-Mail / neuer Code
              </button>
            </div>
          </form>
        ) : (
          <form onSubmit={requestCode} className="mt-3 space-y-2">
            <label className="block text-ink" htmlFor="email">
              Deine E-Mail
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                if (step === 'name') setStep('email');
              }}
              autoComplete="email"
              autoFocus={step === 'email'}
              className={INPUT}
            />
            {step === 'name' && (
              <>
                <p className="text-ink-soft">Neu hier? Wähle einen Namen für dein Reich.</p>
                <label className="block text-ink" htmlFor="name">
                  Dein Name
                </label>
                <input
                  id="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  maxLength={24}
                  autoFocus
                  className={INPUT}
                />
              </>
            )}
            {lobby && !open && step === 'email' && (
              <p className="text-ink-soft">
                Das Spiel läuft mit {lobby.players.length} Spieler:innen — Anmeldung geschlossen,
                Login für Teilnehmende per E-Mail.
              </p>
            )}
            {error && <p className="text-seal">{error}</p>}
            <Button
              type="submit"
              variant="primary"
              disabled={busy || !email.includes('@') || (step === 'name' && name.trim().length < 2)}
            >
              {step === 'name' ? 'Anmelden & Code senden' : 'Code per E-Mail senden'}
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
        <h1 className="text-2xl font-bold italic">Willkommen, {view.self.name}</h1>
        <p className="mt-2 text-ink">
          Du bist angemeldet. Sobald die Anmeldung schließt, wird die Karte für alle Teilnehmenden
          erzeugt und das Spiel startet.
        </p>
        <p className="mt-2 text-ink-soft">
          Spielzeit: Montag–Freitag, 10–18 Uhr. Ziel: {view.victoryPointsToWin} Siegpunkte.
        </p>
      </Panel>
      <Panel title={`Angemeldet (${view.players.length})`}>
        <PlayerList names={view.players.map((p) => p.name)} />
      </Panel>
    </Centered>
  );
}
