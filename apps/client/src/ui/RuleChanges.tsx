import {
  BAREFOOT_SPEED,
  CASTLE_PLUNDER_SHARE,
  HOUR_MS,
  SPOT_BALANCE_TOLERANCE_HOURS,
  SPOT_FAR_HOURS,
  SPOT_NEAR_HOURS,
  OUTPOST_DAILY_INCOME,
} from '@vectoria/shared';
import { useEffect, type ReactNode } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button, Tip } from './Panel';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
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
    id: 'fallen-castle-protected',
    date: '2026-11-05',
    title: 'Gefallene Burg ist geschützt',
    body: (
      <>
        Fällt eine Burg, drehen <b>alle anderen Angriffe</b> auf sie sofort um. Bis ihr Besitzer
        wieder handlungsfähig ist, also bis alle Truppen daheim sind, kann{' '}
        <b>niemand sie angreifen</b>. Damit gibt es keine zweite Truhe mehr für eine Burg, die schon
        gefallen ist.
      </>
    ),
  },
  {
    id: 'outpost-income-night-caravan',
    date: '2026-11-05',
    title: 'Stützpunkte: Einkommen und Nachtkarawane',
    body: (
      <>
        Jeder eigene Stützpunkt bringt zu Beginn jedes Spieltags{' '}
        <b>+{OUTPOST_DAILY_INCOME} Holz, Stein und Gold</b> direkt in deine Basis. Ressourcen lassen
        sich <b>tagsüber nicht mehr</b> zwischen deinen Burgen verlagern. Dafür bringt{' '}
        <b>über Nacht eine Karawane</b> das ganze Lager aller Stützpunkte in die Basis, am Morgen
        kannst du es ausgeben. Truppen abziehen geht weiter jederzeit, die Ressourcen bleiben dann
        im Stützpunkt. Sammler bringen ihre Ladung wie bisher zu ihrer Burg.
      </>
    ),
  },
  {
    id: 'spots-min-distance',
    date: '2026-11-05',
    title: 'Vorkommen mit Mindestabstand',
    body: (
      <>
        Die Rohstoff-Vorkommen wurden noch einmal neu verteilt: <b>Kein Vorkommen</b> liegt jetzt
        näher als <b>{SPOT_NEAR_HOURS} Stunde</b> an einer Burg. Der Weg zum nächsten Holz, Stein
        und Gold zusammen bleibt für alle etwa gleich lang, und eine der drei liegt mindestens{' '}
        <b>{SPOT_FAR_HOURS} Stunden</b> entfernt. Laufende Züge und Sammler ziehen wie beim letzten
        Mal zum nächsten neuen Vorkommen derselben Ressource weiter.
      </>
    ),
  },
  {
    id: 'cards-sea-harvest-shoes-relocate',
    date: '2026-11-05',
    title: 'Vier neue Karten',
    body: (
      <>
        In Truhen liegen jetzt auch: <b>Seeweg</b> (der nächste Zug läuft schnurgerade, auch übers
        Wasser), <b>Füllhorn</b> (3 Spieltage lang je +1 Holz, Stein und Gold extra),{' '}
        <b>Schuhe klauen</b> (die Züge einer gewählten Person laufen einen Spieltag lang mit{' '}
        {formatPercent(BAREFOOT_SPEED)} Tempo) und — seltener — <b>Hofumzug</b> (Burg und ein
        Stützpunkt tauschen die Plätze). Details im Handbuch unter „Karten“.
      </>
    ),
  },
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
        jedem eine der drei mindestens <b>2,5 Stunden</b> entfernt. Züge auf dem Weg zu einem
        Vorkommen laufen zum nächsten neuen Vorkommen derselben Ressource weiter — die schon
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
    <Badge className="absolute -top-1 -right-1 h-5 min-w-5 border-ink text-xs font-bold not-italic">
      {count}
    </Badge>
  );
}

/** Rule-changes button: the scroll with a label (wide HUD corner) or just the scroll (phones). */
export function RuleChangesButton({ compact = false }: { compact?: boolean }) {
  const setRuleChanges = useGameStore((s) => s.setRuleChanges);
  const unseen = useUnseenCount();
  const label = unseen > 0 ? `Regeländerungen (${unseen} neu)` : 'Regeländerungen';
  if (compact) {
    return (
      <Tip label={label}>
        <Button
          variant="plain"
          onClick={() => setRuleChanges(true)}
          aria-label={label}
          className="relative -my-1 shrink-0"
        >
          <ScrollGlyph size={30} />
          <UnseenBadge count={unseen} />
        </Button>
      </Tip>
    );
  }
  return (
    <Button
      variant="plain"
      onClick={() => setRuleChanges(true)}
      aria-label={label}
      className="pointer-events-auto relative mb-1 flex-col transition-transform hover:-translate-y-1"
    >
      <ScrollGlyph />
      <Badge variant="plate">Neuerungen</Badge>
      <UnseenBadge count={unseen} />
    </Button>
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

  function close() {
    markSeen(RULE_CHANGES.map((c) => c.id));
    setRuleChanges(false);
  }

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? setRuleChanges(true) : close())}>
      <DialogContent className="max-h-[min(36rem,85dvh)] max-w-md">
        <DialogHeader className="flex-row items-center gap-3">
          <ScrollGlyph size={36} />
          <div>
            <DialogTitle>Regeländerungen</DialogTitle>
            <DialogDescription>
              Was sich an den Spielregeln geändert hat — das Neueste zuerst.
            </DialogDescription>
          </div>
        </DialogHeader>
        <ol className="min-h-0 flex-1 divide-y divide-ink/20 overflow-y-auto px-4">
          {RULE_CHANGES.map((change) => (
            <li key={change.id} className="py-2.5">
              <div className="flex items-baseline gap-2">
                <b className="italic">{change.title}</b>
                {!seen.includes(change.id) && <Badge variant="outline">Neu</Badge>}
                <span className="ml-auto shrink-0 text-xs text-ink-soft tabular-nums">
                  {formatDate(change.date)}
                </span>
              </div>
              <p className="mt-0.5 text-sm leading-snug">{change.body}</p>
            </li>
          ))}
        </ol>
      </DialogContent>
    </Dialog>
  );
}
