import {
  CASTLE_PLUNDER_SHARE,
  HOUR_MS,
  SPOT_BALANCE_TOLERANCE_HOURS,
  SPOT_FAR_HOURS,
} from '@vectoria/shared';
import { useEffect, type ReactNode } from 'react';
import { formatGameDuration, formatPercent } from '../game/format';
import { useGameStore } from '../state/store';

interface RuleChange {
  /** Stable id; remembered per browser once shown. Never reuse or rename. */
  id: string;
  /** Day the change went live, `YYYY-MM-DD`. */
  date: string;
  title: string;
  body: ReactNode;
}

/**
 * Game-changing rule changes during a running game, newest first. Only changes that alter how the
 * game plays (balance, rules) belong here — not UI polish. Add an entry with every such change.
 */
const RULE_CHANGES: RuleChange[] = [
  {
    id: 'raidable-transfers',
    date: '2026-11-05',
    title: 'Transporte sind überfallbar',
    body: (
      <>
        Auch wer Ressourcen zwischen eigenen Burgen bewegt (etwa „Heimholen“), kann jetzt unterwegs{' '}
        <b>überfallen</b> werden. Ausgeraubt läuft der Transport leer zu seinem Ziel weiter.
        Ausnahme: Ist deine Burg gefallen, sind alle deine Züge auf dem Rückzug <b>unantastbar</b>,
        bis alle daheim sind.
      </>
    ),
  },
  {
    id: 'balanced-spots',
    date: '2026-11-05',
    title: 'Rohstoff-Vorkommen neu verteilt',
    body: (
      <>
        Alle Vorkommen liegen jetzt an neuen Orten, damit niemand im Vorteil ist: Der Weg zum
        nächsten Holz, Stein und Gold zusammen ist <b>für alle etwa gleich lang</b> (höchstens{' '}
        {formatGameDuration(SPOT_BALANCE_TOLERANCE_HOURS * HOUR_MS)} Unterschied). Dafür liegt bei
        jedem eine der drei mindestens <b>{SPOT_FAR_HOURS} Stunden</b> entfernt. Züge auf dem Weg zu
        einem Vorkommen laufen zum nächsten neuen Vorkommen derselben Ressource weiter — die schon
        gelaufene Zeit zählt mit. Wer gerade lud, lädt am neuen Vorkommen mit derselben Restzeit
        fertig.
      </>
    ),
  },
  {
    id: 'castle-fall-rout',
    date: '2026-11-04',
    title: 'Gestürmte Burg: Truhe für den Sieger, Rückzug für den Verlierer',
    body: (
      <>
        Wer eine Burg stürmt, erbeutet wie bisher {formatPercent(CASTLE_PLUNDER_SHARE)} der
        Ressourcen — und bekommt jetzt <b>eine Truhe</b> dazu. Die Truhe kann ihm auf dem Heimweg
        niemand rauben, die Ressourcen schon. Wer seine Burg verliert, ruft{' '}
        <b>sofort alle Züge heim</b>, gibt alle Stützpunkte auf (sie werden wieder Ruinen, die
        Besatzung zieht mit dem Lager heim) und ist <b>handlungsunfähig</b>, bis alle Truppen daheim
        sind.
      </>
    ),
  },
];

const DATE_FORMAT = new Intl.DateTimeFormat('de-DE', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
});

function formatDate(date: string): string {
  return DATE_FORMAT.format(new Date(`${date}T12:00:00`));
}

/** Rule changes this browser has not shown yet. */
function useUnseenCount(): number {
  const seen = useGameStore((s) => s.seenRuleChanges);
  return RULE_CHANGES.filter((c) => !seen.includes(c.id)).length;
}

/** Rolled notice with a wax seal; the rule-changes button. */
function ScrollGlyph({ size = 40 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden>
      <ellipse cx="24" cy="44" rx="17" ry="2.4" fill="#3b2a18" opacity=".25" />
      <rect x="10" y="8" width="28" height="32" fill="#f3e6c4" stroke="#3b2a18" strokeWidth="2" />
      <rect
        x="7"
        y="5"
        width="34"
        height="6"
        rx="3"
        fill="#e3d2a4"
        stroke="#3b2a18"
        strokeWidth="2"
      />
      <rect
        x="7"
        y="37"
        width="34"
        height="6"
        rx="3"
        fill="#e3d2a4"
        stroke="#3b2a18"
        strokeWidth="2"
      />
      <path
        d="M15 17h18M15 22h18M15 27h12"
        stroke="#6b5434"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
      <circle cx="32" cy="31" r="5" fill="#a3311f" stroke="#3b2a18" strokeWidth="1.5" />
    </svg>
  );
}

/** Seal-red count of unseen changes, pinned to a button's corner. */
function UnseenBadge({ count }: { count: number }) {
  if (count === 0) return null;
  return (
    <span className="absolute -top-1 -right-1 flex h-5 min-w-5 items-center justify-center rounded-full border border-ink bg-seal px-1 text-xs font-bold text-parchment not-italic">
      {count}
    </span>
  );
}

/** Rule-changes button: the scroll with a label (wide HUD corner) or just the scroll (phones). */
export function RuleChangesButton({ compact = false }: { compact?: boolean }) {
  const setRuleChanges = useGameStore((s) => s.setRuleChanges);
  const unseen = useUnseenCount();
  const label = unseen > 0 ? `Regeländerungen (${unseen} neu)` : 'Regeländerungen';
  if (compact) {
    return (
      <button
        type="button"
        onClick={() => setRuleChanges(true)}
        title={label}
        aria-label={label}
        className="relative -my-1 shrink-0"
      >
        <ScrollGlyph size={30} />
        <UnseenBadge count={unseen} />
      </button>
    );
  }
  return (
    <button
      type="button"
      onClick={() => setRuleChanges(true)}
      title={label}
      className="pointer-events-auto relative mb-1 flex flex-col items-center transition-transform hover:-translate-y-1"
    >
      <ScrollGlyph />
      <span className="border border-ink bg-parchment px-1.5 text-xs italic shadow-[1px_2px_0_rgba(59,42,24,0.35)]">
        Neuerungen
      </span>
      <UnseenBadge count={unseen} />
    </button>
  );
}

/**
 * The rule-changes notice: what changed in the rules since the game began, newest first. Opens by
 * itself once when there are changes this browser has not shown yet.
 */
export function RuleChanges() {
  const open = useGameStore((s) => s.ruleChanges);
  const setRuleChanges = useGameStore((s) => s.setRuleChanges);
  const seen = useGameStore((s) => s.seenRuleChanges);
  const markSeen = useGameStore((s) => s.markRuleChangesSeen);
  const unseen = useUnseenCount();

  // Mount only: a fresh change pops up once when the game is entered.
  useEffect(() => {
    if (unseen > 0) setRuleChanges(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  if (!open) return null;
  function close() {
    markSeen(RULE_CHANGES.map((c) => c.id));
    setRuleChanges(false);
  }

  return (
    <div
      className="pointer-events-auto fixed inset-0 z-30 flex items-center justify-center bg-ink/55 p-4 max-md:p-3"
      onClick={close}
    >
      <div
        role="dialog"
        aria-label="Regeländerungen"
        onClick={(e) => e.stopPropagation()}
        className="relative flex max-h-[min(36rem,85dvh)] w-full max-w-md flex-col border-2 border-ink bg-parchment p-[3px] text-ink shadow-[6px_8px_0_rgba(59,42,24,0.45)]"
      >
        <button
          type="button"
          onClick={close}
          aria-label="Regeländerungen schließen"
          className="absolute -top-3 -right-3 z-10 h-8 w-8 rounded-full border-2 border-ink bg-parchment text-lg leading-none hover:bg-seal hover:text-parchment"
        >
          ×
        </button>
        <div className="flex min-h-0 flex-col border border-ink/40 px-4 py-3">
          <div className="flex items-center gap-3 border-b-[3px] border-double border-ink pb-2">
            <ScrollGlyph size={36} />
            <div>
              <h2 className="text-xl leading-tight italic">Regeländerungen</h2>
              <p className="text-xs text-ink-soft">
                Was sich an den Spielregeln geändert hat — das Neueste zuerst.
              </p>
            </div>
          </div>
          <ol className="min-h-0 flex-1 divide-y divide-ink/20 overflow-y-auto">
            {RULE_CHANGES.map((change) => (
              <li key={change.id} className="py-2.5">
                <div className="flex items-baseline gap-2">
                  <b className="italic">{change.title}</b>
                  {!seen.includes(change.id) && (
                    <span className="border border-seal px-1 text-[10px] font-bold tracking-wider text-seal uppercase">
                      Neu
                    </span>
                  )}
                  <span className="ml-auto shrink-0 text-xs text-ink-soft tabular-nums">
                    {formatDate(change.date)}
                  </span>
                </div>
                <p className="mt-0.5 text-sm leading-snug">{change.body}</p>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </div>
  );
}
