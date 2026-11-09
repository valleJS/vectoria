import {
  CARDS,
  DEFENSE_KINDS,
  type AdminPlayer,
  type AdminState,
  type AttackCounts,
  type AttackKind,
  type CardType,
  type DefenseKind,
  type PlayerStats,
} from '@vectoria/shared';
import type { ReactNode } from 'react';
import { formatResources } from '../game/format';
import { OnlineDot } from './icons';
import { Button, Panel, Tip } from './Panel';

/** Attack columns in display order, with the names players use. */
const ATTACKS: { kind: AttackKind; label: string; hint: string }[] = [
  { kind: 'raid', label: 'Überfälle', hint: 'Überfälle auf fremde Züge' },
  { kind: 'outpost', label: 'Angriffe Stützpunkt', hint: 'Angriffe auf fremde Stützpunkte' },
  { kind: 'castle', label: 'Angriffe Basis', hint: 'Angriffe auf fremde Hauptburgen' },
  { kind: 'duo', label: 'Duo-Angriffe', hint: 'Zugesagte Duo-Angriffe (beide Seiten zählen)' },
  { kind: 'ruin', label: 'Ruinen', hint: 'Leere Ruinen eingenommen' },
];

const DEFENSE_NAMES: Record<DefenseKind, string> = {
  castle: 'Basis',
  outpost: 'Stützpunkt',
  convoy: 'Zug',
};

/** "3 h 05 min", "12 min", "< 1 min". */
function formatOnline(ms: number): string {
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 1) return ms > 0 ? '< 1 min' : '—';
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h > 0 ? `${h} h ${m.toString().padStart(2, '0')} min` : `${m} min`;
}

/** "gerade", "vor 5 min", "vor 3 h", else the date. */
function formatAgo(at: number | null, now: number): string {
  if (at === null) return '—';
  const minutes = Math.floor((now - at) / 60_000);
  if (minutes < 1) return 'gerade';
  if (minutes < 60) return `vor ${minutes} min`;
  if (minutes < 24 * 60) return `vor ${Math.floor(minutes / 60)} h`;
  return new Date(at).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' });
}

function share(part: number, whole: number): string {
  return whole > 0 ? `${Math.round((part / whole) * 100)} %` : '—';
}

/** Online days so far; the average per day counts only days the player was on. */
function onlineDays(stats: PlayerStats): number {
  return Object.values(stats.onlineByDay).filter((ms) => ms > 0).length;
}

function cardsPlayed(stats: PlayerStats): number {
  return Object.values(stats.cardsPlayed).reduce((sum, n) => sum + (n ?? 0), 0);
}

function cardList(stats: PlayerStats): string {
  const entries = Object.entries(stats.cardsPlayed) as [CardType, number][];
  return entries.map(([card, n]) => `${CARDS[card].name} ×${n}`).join(', ') || 'keine';
}

/** "3 / 5" executed of started, with the wins below. */
function AttackCell({ counts }: { counts: AttackCounts }) {
  if (counts.started === 0 && counts.executed === 0) {
    return <span className="text-ink-soft">—</span>;
  }
  return (
    <>
      <b className="tabular-nums">
        {counts.executed} / {counts.started}
      </b>
      <div className="text-xs text-ink-soft tabular-nums">{counts.won} gewonnen</div>
    </>
  );
}

function Th({ children, hint }: { children: ReactNode; hint?: string }) {
  const label = <span className={hint ? 'underline decoration-dotted' : ''}>{children}</span>;
  return (
    <th scope="col" className="px-2 py-1 text-left align-bottom font-normal text-ink-soft">
      {hint ? <Tip label={hint}>{label}</Tip> : label}
    </th>
  );
}

function Td({ children }: { children: ReactNode }) {
  return <td className="px-2 py-1.5 align-top whitespace-nowrap">{children}</td>;
}

/** One CSV row per player with every counter; `;`-separated for German spreadsheet apps. */
function toCsv(players: AdminPlayer[], today: string): string {
  const header = [
    'Name',
    'E-Mail',
    'Online gesamt (min)',
    'Online in Spielzeit (min)',
    'Online heute (min)',
    'Online-Tage',
    'Sitzungen',
    'Zuletzt online',
    'Befehle',
    'Zuletzt aktiv',
    ...ATTACKS.flatMap(({ label }) => [
      `${label} gestartet`,
      `${label} durchgeführt`,
      `${label} gewonnen`,
    ]),
    ...DEFENSE_KINDS.flatMap((k) => [
      `Verteidigung ${DEFENSE_NAMES[k]} angegriffen`,
      `Verteidigung ${DEFENSE_NAMES[k]} gehalten`,
    ]),
    'Duo-Angebote gesendet',
    'Duo-Angebote erhalten',
    'Truppen verloren',
    'Truppen besiegt',
    'Truppen gekauft',
    'Siegpunkte gekauft',
    'Sammelzüge gestartet',
    'Sammelzüge heim',
    'Gesammelt Holz',
    'Gesammelt Stein',
    'Gesammelt Gold',
    'Beute Holz',
    'Beute Stein',
    'Beute Gold',
    'Handel',
    'Truhen geborgen',
    'Truhen geöffnet',
    'Karten gespielt',
  ];
  const minutes = (ms: number) => Math.round(ms / 60_000);
  const time = (at: number | null) => (at === null ? '' : new Date(at).toISOString());
  const rows = players.map(({ name, email, stats: s }) => [
    name,
    email ?? '',
    minutes(s.onlineMs),
    minutes(s.onlineInHoursMs),
    minutes(s.onlineByDay[today] ?? 0),
    onlineDays(s),
    s.sessions,
    time(s.lastSeenAt),
    s.commands,
    time(s.lastActionAt),
    ...ATTACKS.flatMap(({ kind }) => [
      s.attacks[kind].started,
      s.attacks[kind].executed,
      s.attacks[kind].won,
    ]),
    ...DEFENSE_KINDS.flatMap((k) => [s.defenses[k].attacked, s.defenses[k].held]),
    s.duoOffers.sent,
    s.duoOffers.received,
    s.troopsLost,
    s.troopsKilled,
    s.troopsBought,
    s.victoryPointsBought,
    s.gathers.started,
    s.gathers.completed,
    s.gathered.wood,
    s.gathered.stone,
    s.gathered.gold,
    s.plunder.wood,
    s.plunder.stone,
    s.plunder.gold,
    s.trades,
    s.chests.recovered,
    s.chests.opened,
    cardList(s),
  ]);
  const cell = (value: string | number) => {
    const text = String(value);
    return /[";\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  return [header, ...rows].map((row) => row.map(cell).join(';')).join('\r\n');
}

function downloadCsv(state: AdminState): void {
  // BOM so Excel reads the umlauts as UTF-8.
  const blob = new Blob(['﻿', toCsv(state.players, state.today)], {
    type: 'text/csv;charset=utf-8',
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `vectoria-statistik-${state.today}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

/** Per-player online time and action counts for the current round, with a CSV export. */
export function AdminStats({ state }: { state: AdminState }) {
  const now = state.serverTime;
  return (
    <Panel title="Statistik">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-ink-soft">
          Angriffe: <b>durchgeführt / gestartet</b> — gestartet zählt jeden Marschbefehl (auch
          umgeleitete und zurückgerufene), durchgeführt nur, wenn es zum Kampf kam. Gilt für diese
          Runde; „Zurücksetzen“ leert sie.
        </p>
        <Button
          className="h-10 sm:h-7"
          disabled={state.players.length === 0}
          onClick={() => downloadCsv(state)}
        >
          CSV exportieren
        </Button>
      </div>
      {state.players.length === 0 ? (
        <p className="text-ink-soft">Noch niemand angemeldet.</p>
      ) : (
        <div className="-mx-1 overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead className="border-b border-ink/30">
              <tr>
                <Th>Spieler:in</Th>
                <Th hint="Gesamt · davon in der Spielzeit (Mo–Fr 10–18 Uhr, Uhr läuft)">Online</Th>
                <Th hint="Heute · Durchschnitt pro Tag mit Login">Heute · Ø</Th>
                <Th hint="Logins (erste offene Verbindung) · zuletzt verbunden">Sitzungen</Th>
                <Th hint="Gesendete Befehle (Marsch, Kauf, Karte, Duo …) · letzter Befehl">
                  Befehle
                </Th>
                {ATTACKS.map(({ kind, label, hint }) => (
                  <Th key={kind} hint={hint}>
                    {label}
                  </Th>
                ))}
                <Th hint="Gehalten / angegriffen, je Basis, Stützpunkt und Zug">Verteidigt</Th>
                <Th hint="Gegnerische besiegt · eigene gefallen · gekauft">Truppen</Th>
                <Th hint="Heimgekehrt / losgeschickt · Gesamtertrag">Sammeln</Th>
                <Th hint="Aus Überfällen, Angriffen und Duos">Beute</Th>
                <Th hint="Geborgen · geöffnet">Truhen</Th>
                <Th hint="Tausch beim Händler">Handel</Th>
                <Th hint="Ausgespielte Karten">Karten</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink/15">
              {state.players.map((p) => {
                const s = p.stats;
                const days = onlineDays(s);
                const defended = DEFENSE_KINDS.reduce((sum, k) => sum + s.defenses[k].held, 0);
                const attacked = DEFENSE_KINDS.reduce((sum, k) => sum + s.defenses[k].attacked, 0);
                return (
                  <tr key={p.id}>
                    <Td>
                      <span className="inline-flex items-center gap-1.5 font-bold">
                        <OnlineDot online={p.online} />
                        {p.name}
                      </span>
                    </Td>
                    <Td>
                      <b className="tabular-nums">{formatOnline(s.onlineMs)}</b>
                      <div className="text-xs text-ink-soft tabular-nums">
                        {share(s.onlineInHoursMs, s.onlineMs)} in Spielzeit
                      </div>
                    </Td>
                    <Td>
                      <b className="tabular-nums">
                        {formatOnline(s.onlineByDay[state.today] ?? 0)}
                      </b>
                      <div className="text-xs text-ink-soft tabular-nums">
                        Ø {days > 0 ? formatOnline(s.onlineMs / days) : '—'} · {days} Tag
                        {days === 1 ? '' : 'e'}
                      </div>
                    </Td>
                    <Td>
                      <b className="tabular-nums">{s.sessions}</b>
                      <div className="text-xs text-ink-soft">
                        {p.online ? 'online' : formatAgo(s.lastSeenAt, now)}
                      </div>
                    </Td>
                    <Td>
                      <b className="tabular-nums">{s.commands}</b>
                      <div className="text-xs text-ink-soft">{formatAgo(s.lastActionAt, now)}</div>
                    </Td>
                    {ATTACKS.map(({ kind }) => (
                      <Td key={kind}>
                        <AttackCell counts={s.attacks[kind]} />
                        {kind === 'duo' && s.duoOffers.sent + s.duoOffers.received > 0 && (
                          <div className="text-xs text-ink-soft tabular-nums">
                            Angebote {s.duoOffers.sent}↑ {s.duoOffers.received}↓
                          </div>
                        )}
                      </Td>
                    ))}
                    <Td>
                      {attacked === 0 ? (
                        <span className="text-ink-soft">—</span>
                      ) : (
                        <Tip
                          label={DEFENSE_KINDS.map(
                            (k) =>
                              `${DEFENSE_NAMES[k]} ${s.defenses[k].held}/${s.defenses[k].attacked}`,
                          ).join(' · ')}
                        >
                          <b className="tabular-nums underline decoration-dotted">
                            {defended} / {attacked}
                          </b>
                        </Tip>
                      )}
                    </Td>
                    <Td>
                      <b className="tabular-nums">{s.troopsKilled} besiegt</b>
                      <div className="text-xs text-ink-soft tabular-nums">
                        {s.troopsLost} verloren · {s.troopsBought} gekauft
                      </div>
                    </Td>
                    <Td>
                      <b className="tabular-nums">
                        {s.gathers.completed} / {s.gathers.started}
                      </b>
                      <div className="text-xs text-ink-soft">
                        {formatResources(s.gathered, '—')}
                      </div>
                    </Td>
                    <Td>{formatResources(s.plunder, '—')}</Td>
                    <Td>
                      <span className="tabular-nums">
                        {s.chests.recovered} · {s.chests.opened}
                      </span>
                    </Td>
                    <Td>
                      <span className="tabular-nums">{s.trades}</span>
                    </Td>
                    <Td>
                      {cardsPlayed(s) === 0 ? (
                        <span className="text-ink-soft">—</span>
                      ) : (
                        <Tip label={cardList(s)}>
                          <b className="tabular-nums underline decoration-dotted">
                            {cardsPlayed(s)}
                          </b>
                        </Tip>
                      )}
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  );
}
