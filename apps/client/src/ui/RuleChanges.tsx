import {
  ASSAULT_LOCK_MS,
  BAREFOOT_SPEED,
  BRIBE_RANGE_HOURS,
  CASTLE_PLUNDER_SHARE,
  HOUR_MS,
  LOADED_SPEED,
  MAX_ARMIES,
  MAX_CARGO_RAIDS,
  SPOT_BALANCE_TOLERANCE_HOURS,
  SPOT_FAR_HOURS,
  SPOT_MAX_HOURS,
  SPOT_NEAR_HOURS,
  OUTPOST_DAILY_INCOME,
  TROPHY_VP_INTERVAL,
  VICTORY_POINTS_PER_GAMEDAY,
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
    id: 'raid-limit-army-cap-assault-lock',
    date: '2026-11-09',
    title: 'Beute-Grenze, höchstens 10 Züge, Abzugssperre',
    body: (
      <>
        <b>Überfälle</b>: Dieselbe Beute lässt sich höchstens {MAX_CARGO_RAIDS}-mal rauben — einmal
        geraubt, einmal zurückgeraubt, danach ist sie sicher. <b>Züge</b>: Jede*r kann höchstens{' '}
        {MAX_ARMIES} Züge gleichzeitig unterwegs haben. <b>Abzugssperre</b>: Ist ein sichtbarer
        Angriff auf eine Burg oder einen Stützpunkt nur noch {formatGameDuration(ASSAULT_LOCK_MS)}{' '}
        entfernt, kann dort niemand mehr abziehen. Und wie bisher: Wer einen Kampf gewinnt, verliert
        nie mehr Truppen, als die Gegenseite hatte.
      </>
    ),
  },
  {
    id: 'cards-pickpocket-bribe',
    date: '2026-11-08',
    title: 'Zwei neue Karten: Langfinger und Bestechung',
    body: (
      <>
        <b>Langfinger</b>: Du siehst, wer wie viele Karten hat — aber nicht welche — und ziehst
        jemandem blind eine davon. <b>Bestechung</b> (seltener): Ein fremder Zug ohne Ladung und
        Truhe, höchstens {formatGameDuration(BRIBE_RANGE_HOURS * HOUR_MS)} Marsch (Luftlinie) von
        einem deiner Züge entfernt, läuft zu dir über. Beim Ausspielen leuchten auf der Karte alle
        Züge, die gerade in Reichweite sind. Die Übergelaufenen stoßen auf dem schnellsten Weg zu
        deinem Zug; schaffen sie es nicht vor seinem Ziel, wartet dein Zug vor einem Angriff auf
        sie. Zieht dein Zug heim, gehen sie direkt in dieselbe Burg. Details im Handbuch unter
        „Karten“.
      </>
    ),
  },
  {
    id: 'trophies',
    date: '2026-11-07',
    title: 'Trophäen für jeden 4. Siegpunkt',
    body: (
      <>
        Für jeden {TROPHY_VP_INTERVAL}. Siegpunkt brauchst du jetzt <b>Trophäen</b>: für den{' '}
        {TROPHY_VP_INTERVAL}. eine, den {TROPHY_VP_INTERVAL * 2}. drei, den {TROPHY_VP_INTERVAL * 3}
        . sechs usw. Trophäen werden dabei <b>nicht verbraucht</b> – sie sind dein Ruf und stehen
        für alle sichtbar in der Rangliste. Eine Trophäe gibt es für jeden Sieg über andere: einen
        geglückten Überfall, einen eroberten Stützpunkt oder eine gestürmte Burg. Sie landet sofort
        auf deinem Konto und muss nicht heimgetragen werden.
      </>
    ),
  },
  {
    id: 'route-cards',
    date: '2026-11-07',
    title: 'Nebel, Tarnung und Seeweg: hin und zurück',
    body: (
      <>
        <b>Seeweg</b> und <b>Tarnung</b> wirken jetzt auch auf dem Rückweg – ein getarnter Zug
        bringt seine Ressourcen also sicher heim. <b>Nebel</b> verbirgt zusätzlich die Truppenzahl
        der Burg oder des Stützpunkts, aus dem der Zug aufbrach. Alle drei gelten nur, solange der
        Zug auf seiner ursprünglichen Route bleibt: <b>wer umleitet, beendet den Effekt</b>.
      </>
    ),
  },
  {
    id: 'caravans-public',
    date: '2026-11-06',
    title: 'Karawanen sind für alle sichtbar',
    body: (
      <>
        Nachts siehst du jetzt <b>die Karawanen aller Spieler</b> auf der Karte, jede in der Farbe
        ihres Besitzers. Ein Klick auf einen Wagen zeigt seine Ladung, so wie man tagsüber das Lager
        jedes Stützpunkts sieht. Überfallen lässt sich eine Karawane weiterhin nicht.
      </>
    ),
  },
  {
    id: 'victory-points-per-gameday',
    date: '2026-11-05',
    title: 'Höchstens 3 Siegpunkte pro Spieltag',
    body: (
      <>
        Pro Spieltag lassen sich nur noch <b>{VICTORY_POINTS_PER_GAMEDAY} Siegpunkte</b> kaufen. Die
        Grenze gilt vom Spieltagbeginn um 10 Uhr bis zum nächsten, Abend und Nacht eingeschlossen.
      </>
    ),
  },
  {
    id: 'spots-spread-out',
    date: '2026-11-05',
    title: 'Vorkommen gleichmäßig verteilt',
    body: (
      <>
        Die Vorkommen wurden noch einmal neu verteilt, diesmal <b>über die ganze Karte</b>: keine
        Häufungen mehr und keine leeren Gegenden. Von deiner Burg aus liegen Stein, Händler und
        eines von Holz und Gold <b>unter {SPOT_FAR_HOURS} Stunden</b> entfernt, nur das andere von
        Holz und Gold liegt {SPOT_FAR_HOURS} bis {SPOT_MAX_HOURS} Stunden weit weg. Keins liegt
        näher als {SPOT_NEAR_HOURS} Stunde an einer Burg. Züge auf dem Weg zu einem Vorkommen laufen
        zum nächsten neuen derselben Art weiter, wer gerade lud, lädt dort mit derselben Restzeit
        fertig.
      </>
    ),
  },
  {
    id: 'duo-attacks',
    date: '2026-11-05',
    title: 'Neu: Duo-Angriffe',
    body: (
      <>
        Greift zu zweit an: Wähle eine fremde Burg oder einen Stützpunkt und dann{' '}
        <b>„Duo-Angreifen“</b>. Dein Partner bekommt den Plan in den neuen <b>Posteingang</b> (unter
        dem Liveticker, am Handy oben im Ticker) und kann annehmen oder ablehnen. Eure Züge treffen
        sich auf kürzestem Weg, erst dann wird das Ziel sichtbar. Beute und Truhe teilt ihr nach
        Truppen. Abbrechen geht nur, wenn <b>beide</b> zustimmen.
      </>
    ),
  },
  {
    id: 'trader',
    date: '2026-11-05',
    title: 'Neu: der Händler',
    body: (
      <>
        Auf der Karte stehen jetzt <b>Händler</b>. Dort tauschst du{' '}
        <b>Stein 1:1 gegen Gold und Holz</b>, die Aufteilung wählst du selbst. Schick Truppen mit
        Stein hin: Der Handel geht sofort, ohne Ladezeit. Hin und zurück sind sie beladen, also nur{' '}
        {formatPercent(LOADED_SPEED)} Tempo und überfallbar. Dafür wurden die Vorkommen noch einmal
        neu verteilt: Der Weg zu Holz, Stein, Gold und Händler zusammen ist für alle etwa gleich
        lang, keins liegt näher als {SPOT_NEAR_HOURS} Stunde an einer Burg, eins mindestens{' '}
        {SPOT_FAR_HOURS} Stunden entfernt.
      </>
    ),
  },
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
        <b>+{OUTPOST_DAILY_INCOME} Holz, Stein und Gold</b> direkt in deine Basis.{' '}
        <b>Manuelle Transporte gibt es nicht mehr.</b> Dafür bricht <b>um 18 Uhr eine Karawane</b>{' '}
        mit dem ganzen Lager aller Stützpunkte auf, am nächsten Morgen liegt es in der Basis.
        Truppen abziehen geht weiter jederzeit, die Ressourcen bleiben dann im Stützpunkt. Sammler
        bringen ihre Ladung wie bisher zu ihrer Burg und lassen sich jetzt unterwegs zu jedem
        eigenen Lager umleiten.
      </>
    ),
  },
  {
    id: 'universal-colors',
    date: '2026-11-05',
    title: 'Feste Farben für alle',
    body: (
      <>
        Jede Person hat jetzt bei allen <b>dieselbe Farbe</b> — Burg, Züge und Wege sehen überall
        gleich aus, du bist also nicht mehr automatisch rot. Deine eigene Burg erkennst du am{' '}
        <b>goldenen Stern</b> im Namensschild und am farbigen Sockel. Wege tragen immer die Farbe
        ihres Zuges, auch mit Ladung; die Striche zeigen spitz in Laufrichtung.
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
