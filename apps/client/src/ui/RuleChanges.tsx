import {
  CHESTS_PER_GAMEDAY,
  LOADED_SPEED,
  VICTORY_POINT_BASE_COST,
  victoryPointCost,
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
import { formatPercent, formatResources } from '../game/format';
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
    id: 'loaded-transfer-speed',
    date: '2026-11-04',
    title: 'Auch Transporte sind beladen langsamer',
    body: (
      <>
        Wer Ressourcen zwischen eigenen Burgen und Stützpunkten verlagert, marschiert jetzt
        ebenfalls nur mit <b>{formatPercent(LOADED_SPEED)} Tempo</b> — wie Züge, die vom Vorkommen
        heimkehren. Ohne Ladung bleibt es beim normalen Tempo.
      </>
    ),
  },
  {
    id: 'loaded-return-speed',
    date: '2026-11-04',
    title: 'Beladene Züge sind langsamer',
    body: (
      <>
        Züge, die Ressourcen heimbringen, marschieren nur noch mit{' '}
        <b>{formatPercent(LOADED_SPEED)} Tempo</b>. Wer seine Ladung bei einem Überfall verliert,
        läuft wieder normal schnell. Truhenträger und Züge ohne Ladung sind nicht betroffen.
      </>
    ),
  },
  {
    id: 'three-chests',
    date: '2026-11-04',
    title: `${CHESTS_PER_GAMEDAY} Truhen pro Spieltag`,
    body: (
      <>
        Jeden Spieltag erscheinen <b>{CHESTS_PER_GAMEDAY} Truhen</b> statt einer. Gleichzeitig
        liegen höchstens so viele auf der Karte, wie Spieler:innen mitspielen — mindestens aber{' '}
        {CHESTS_PER_GAMEDAY}.
      </>
    ),
  },
  {
    id: 'rising-vp-cost',
    date: '2026-11-04',
    title: 'Siegpunkte werden teurer',
    body: (
      <>
        Der erste Siegpunkt kostet {formatResources(VICTORY_POINT_BASE_COST)}, jeder weitere{' '}
        <b>1 Ressource mehr</b> als der vorige (abwechselnd Stein, Holz, Gold). Der zehnte kostet{' '}
        {formatResources(victoryPointCost(9))}.
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
