import {
  CARD_TYPES,
  CARDS,
  CASTLE_PLUNDER_SHARE,
  CHEST_TROOPS_MAX,
  CHEST_TROOPS_MIN,
  CHESTS_PER_GAMEDAY,
  COMBAT,
  CROSS_MAP_HOURS,
  DAILY_ACTIVITY_INCOME,
  DAILY_BASE_INCOME,
  FORTIFY_MULTIPLIER,
  GAMEDAY_HOURS,
  GATHER_DURATION_MS,
  GATHER_YIELD_PER_100_TROOPS,
  RESOURCE_NAMES,
  RESOURCES,
  STARTING_RESOURCES,
  STARTING_TROOPS,
  TROOP_BATCH_COST,
  TROOP_BATCH_SIZE,
  VICTORY_POINT_BASE_COST,
} from '@vectoria/shared';
import { useEffect, useState, type ReactNode } from 'react';
import { compassRose, dataUrl } from '../art/svg';
import { formatGameDuration, formatResources } from '../game/format';
import { useGameStore } from '../state/store';
import { CardFace } from './CardFace';
import { CardArt } from './icons';

const COMPASS_URL = dataUrl(compassRose());
const INK = '#3b2a18';
const pct = (share: number) => `${Math.round(share * 100)} %`;

/** Leather-bound book with a gold clasp; the handbook's button. */
function BookGlyph({ size = 44 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden>
      <ellipse cx="24" cy="44" rx="18" ry="2.6" fill={INK} opacity=".25" />
      <path
        d="M9 7h28a3 3 0 0 1 3 3v29a3 3 0 0 1-3 3H9z"
        fill="#f6eedb"
        stroke={INK}
        strokeWidth={2}
      />
      <path d="M11 38h27M11 35h27" stroke="#c9b68c" strokeWidth={1.2} />
      <path
        d="M7 5h28a3 3 0 0 1 3 3v26a3 3 0 0 1-3 3H7z"
        fill="#7a2a1c"
        stroke={INK}
        strokeWidth={2}
        strokeLinejoin="round"
      />
      <path d="M11 5v32" stroke="#5a1d12" strokeWidth={2.4} />
      <rect x="17" y="12" width="16" height="11" fill="none" stroke="#e0b84a" strokeWidth={1.3} />
      <path d="M25 14.5l1.6 3h-3.2z M21 20h8" stroke="#e0b84a" strokeWidth={1.2} fill="#e0b84a" />
      <path d="M35 17h5v6h-5" fill="#f2c230" stroke={INK} strokeWidth={1.5} />
    </svg>
  );
}

/** Running text helpers so chapters read like a printed manual. */
function P({ children }: { children: ReactNode }) {
  return <p className="mb-2 leading-relaxed">{children}</p>;
}

function H({ children }: { children: ReactNode }) {
  return <h3 className="mt-3 mb-1 text-base font-bold italic">{children}</h3>;
}

function List({ items }: { items: ReactNode[] }) {
  return (
    <ul className="mb-2 list-['❧_'] space-y-1 pl-5 leading-relaxed marker:text-seal">
      {items.map((item, i) => (
        <li key={i}>{item}</li>
      ))}
    </ul>
  );
}

function Table({ head, rows }: { head: string[]; rows: ReactNode[][] }) {
  return (
    <table className="mb-2 w-full border-collapse text-[13px]">
      <thead>
        <tr>
          {head.map((h) => (
            <th
              key={h}
              className="border-b-2 border-double border-ink px-1.5 py-0.5 text-left italic"
            >
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, i) => (
          <tr key={i}>
            {row.map((cell, j) => (
              <td key={j} className="border-b border-ink/20 px-1.5 py-1 align-top">
                {cell}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

interface Chapter {
  id: string;
  title: string;
  body: (ctx: { victoryPointsToWin: number }) => ReactNode;
}

const CHAPTERS: Chapter[] = [
  {
    id: 'goal',
    title: 'Ziel des Spiels',
    body: ({ victoryPointsToWin }) => (
      <>
        <P>
          Vectoria ist ein langsames Strategiespiel über viele Tage. Jeder Spieler herrscht über
          eine Burg auf derselben Karte. Wer zuerst <b>{victoryPointsToWin} Siegpunkte</b> besitzt,
          gewinnt. Beendet der Admin das Spiel vorher, gewinnt, wer die meisten hat.
        </P>
        <P>
          Siegpunkte kauft man in der eigenen Burg. Der erste kostet{' '}
          {formatResources(VICTORY_POINT_BASE_COST)}, jeder weitere 1 Ressource mehr als der vorige
          — abwechselnd Stein, Holz, Gold. Der aktuelle Preis steht im Laden deiner Burg. Siegpunkte
          können nie gestohlen werden — Ressourcen und Truppen dagegen schon.
        </P>
        <P>
          Du beginnst mit {STARTING_TROOPS} Truppen und {formatResources(STARTING_RESOURCES)}.
        </P>
      </>
    ),
  },
  {
    id: 'time',
    title: 'Spielzeit & Spieltage',
    body: () => (
      <>
        <P>
          Die Spieluhr läuft nur <b>montags bis freitags von 10 bis 18 Uhr</b>. Nachts und am
          Wochenende ruht alles: Züge bleiben stehen, nichts kommt an. Alle Dauern im Spiel sind in
          dieser Spielzeit gemessen.
        </P>
        <P>Jeder Spieltag ({GAMEDAY_HOURS} Stunden) beginnt mit:</P>
        <List
          items={[
            `Einkommen: +${DAILY_BASE_INCOME} jeder Ressource, +${DAILY_ACTIVITY_INCOME} der gewählten Basisaktivität.`,
            'Die tags zuvor gewählte Basisaktivität tritt in Kraft.',
            `${CHESTS_PER_GAMEDAY === 1 ? 'Eine neue Truhe erscheint' : `${CHESTS_PER_GAMEDAY} neue Truhen erscheinen`} auf der Karte.`,
          ]}
        />
      </>
    ),
  },
  {
    id: 'resources',
    title: 'Ressourcen & Basisaktivität',
    body: () => (
      <>
        <P>
          Es gibt drei Ressourcen: {RESOURCES.map((r) => RESOURCE_NAMES[r]).join(', ')}. Ausgeben
          lässt sich nur, was <b>in der Basis</b> (deiner Heimatburg) lagert.
        </P>
        <H>Basisaktivität</H>
        <P>
          Wähle jederzeit, worauf sich deine Burg konzentriert. Die Wahl gilt ab dem nächsten
          Spieltag und bringt dann täglich {DAILY_ACTIVITY_INCOME} statt {DAILY_BASE_INCOME} dieser
          Ressource. Wählst du nichts Neues, bleibt die alte.
        </P>
        <H>Sammeln</H>
        <P>
          Schicke Truppen zu einem Vorkommen. Dort laden sie{' '}
          {formatGameDuration(GATHER_DURATION_MS)} lang und bringen je 100 Truppen{' '}
          {GATHER_YIELD_PER_100_TROOPS} Einheiten zurück — zu der Burg, aus der sie kamen. Auf dem
          Heimweg sind sie mit Ladung angreifbar.
        </P>
      </>
    ),
  },
  {
    id: 'bases',
    title: 'Basis & Stützpunkte',
    body: () => (
      <>
        <P>
          Deine <b>Basis</b> ist die Heimatburg: Hier kaufst du Truppen und Siegpunkte, hier wird
          Beute sicher.
        </P>
        <P>
          Zwischen den Burgen liegen <b>Ruinen</b>. Wer eine Ruine mit Truppen einnimmt, baut sie
          wieder auf — sie heißt dann „Stützpunkt“ mit deinem Namen. Ein Stützpunkt ist ein
          vorgeschobenes Lager: Truppen können dort stehen, von dort losziehen und Ressourcen
          lagern.
        </P>
        <List
          items={[
            'Ressourcen im Stützpunkt kannst du nicht ausgeben; bring sie erst heim („Heimholen“).',
            'Zwischen eigenen Burgen lassen sich beliebig viele Ressourcen mitnehmen.',
            'Fällt ein Stützpunkt, gehört er samt Lager dem Eroberer; die Überlebenden fliehen heim.',
            'Züge kehren zu der Burg zurück, aus der sie kamen — ist sie verloren, zur Basis.',
          ]}
        />
      </>
    ),
  },
  {
    id: 'troops',
    title: 'Truppen & Heerzüge',
    body: () => (
      <>
        <P>
          Es gibt eine Sorte Truppen. {TROOP_BATCH_SIZE} Truppen kosten{' '}
          {formatResources(TROOP_BATCH_COST)} und erscheinen sofort in der Basis.
        </P>
        <P>
          Klicke ein Ziel auf der Karte an, wähle die Burg, aus der du losschickst, und die Zahl der
          Truppen. Züge laufen nur über Land; einmal quer über die Karte dauert etwa{' '}
          {CROSS_MAP_HOURS} Spielstunden.
        </P>
        <List
          items={[
            <>
              <b>Zurückrufen:</b> jederzeit, solange der Zug nicht schon heimkehrt.
            </>,
            <>
              <b>Umleiten:</b> ein Zug ohne Ladung kann im Feld ein neues Ziel bekommen.
            </>,
            <>
              <b>Heimweg:</b> immer für alle sichtbar, auch wenn der Hinweg getarnt war.
            </>,
          ]}
        />
      </>
    ),
  },
  {
    id: 'combat',
    title: 'Kampf',
    body: () => (
      <>
        <P>
          Ein Kampf entscheidet sich an der Truppenstärke: Der Angreifer gewinnt nur mit{' '}
          <b>echt mehr</b> Truppen als der Verteidiger. Niemand verliert mehr Truppen, als die
          Gegenseite mitgebracht hat.
        </P>
        <Table
          head={['Ausgang', 'Angreifer verliert', 'Verteidiger verliert']}
          rows={[
            [
              'Angreifer siegt',
              pct(COMBAT.attackerWinsAttackerLoss),
              pct(COMBAT.attackerWinsDefenderLoss),
            ],
            [
              'Verteidiger hält',
              pct(COMBAT.defenderWinsAttackerLoss),
              pct(COMBAT.defenderWinsDefenderLoss),
            ],
          ]}
        />
        <H>Beute</H>
        <List
          items={[
            `Burg: ${pct(CASTLE_PLUNDER_SHARE)} aller Ressourcen in der Basis.`,
            'Stützpunkt / Ruine: der Stützpunkt selbst samt ganzem Lager.',
            'Überfallener Zug: die ganze Ladung.',
          ]}
        />
        <P>Mit der Karte Bollwerk verteidigt die Burg mit ×{FORTIFY_MULTIPLIER} Stärke.</P>
      </>
    ),
  },
  {
    id: 'raids',
    title: 'Überfälle',
    body: () => (
      <>
        <P>
          Ein heimkehrender Zug, der <b>Ressourcen</b> trägt, lässt sich abfangen. Wähle ihn auf der
          Karte an und schicke Truppen aus einer Burg los oder leite einen Zug im Feld um. Der
          Treffpunkt wird vorausberechnet — erreicht der Zug seine Burg vorher, geht es nicht.
        </P>
        <P>
          Züge, die eine Truhe heimbringen, und Züge ohne Ladung können nicht überfallen werden.
        </P>
      </>
    ),
  },
  {
    id: 'chests',
    title: 'Truhen',
    body: () => (
      <>
        <P>
          Jeden Spieltag erscheint eine Truhe. Um sie zu öffnen, braucht es eine bestimmte Zahl
          Truppen ({CHEST_TROOPS_MIN}–{CHEST_TROOPS_MAX}); sie steht auf der Karte neben der Truhe.
        </P>
        <List
          items={[
            'Wer zuerst mit genug Truppen ankommt, birgt die Truhe.',
            'Die Truppen bringen sie sofort heim und können dabei nicht überfallen werden.',
            'Zu wenige Truppen kehren mit leeren Händen um.',
            'Daheim wartet die Truhe auf dich. Erst beim Öffnen zeigt sich, welche Karte darin liegt.',
          ]}
        />
      </>
    ),
  },
  {
    id: 'cards',
    title: 'Karten',
    body: () => (
      <>
        <P>
          Karten gehören dir, nicht einer Burg. Klicke eine Karte an, um ihr Profil zu sehen und sie
          zu <b>aktivieren</b>. Es kann immer nur eine Karte aktiv sein.
        </P>
        <List
          items={[
            <>
              <b>Sofortkarten</b> wirken im Moment der Aktivierung.
            </>,
            <>
              <b>Marschkarten</b> werden scharf geschaltet und gehen mit dem nächsten Zug mit, den
              du losschickst. Danach sind sie verbraucht.
            </>,
          ]}
        />
        <P>Alle Karten findest du im Kartenkatalog.</P>
      </>
    ),
  },
  {
    id: 'catalog',
    title: 'Kartenkatalog',
    body: () => (
      <>
        <P>Alle Karten, die in Truhen liegen können:</P>
        <div className="flex flex-col items-center gap-4 py-2">
          {CARD_TYPES.map((card) => (
            <CardFace key={card} card={card} />
          ))}
        </div>
      </>
    ),
  },
  {
    id: 'view',
    title: 'Sicht & Liveticker',
    body: () => (
      <>
        <P>
          Auf der Karte ist alles für alle sichtbar: Burgen, Truppen, Lager und Züge — außer Karten
          verbergen etwas (Nebel: Truppenzahl, Tarnung: Ziel).
        </P>
        <P>
          Der Liveticker oben links meldet öffentliche Ereignisse: Aufbrüche, Kämpfe, geborgene
          Truhen, eroberte Stützpunkte, neue Spieltage. Deine eigene Chronik findest du in der
          Seitenleiste.
        </P>
      </>
    ),
  },
];

/** Two-page handbook: contents on the left, the chosen chapter on the right. */
function Book({
  victoryPointsToWin,
  onClose,
}: {
  victoryPointsToWin: number;
  onClose: () => void;
}) {
  const [index, setIndex] = useState(0);
  // Phones show one page at a time: the contents page only while `toc` is open.
  const [toc, setToc] = useState(false);
  const chapter = CHAPTERS[index]!;
  const go = (i: number) => {
    setIndex(i);
    setToc(false);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowRight') setIndex((i) => Math.min(CHAPTERS.length - 1, i + 1));
      if (e.key === 'ArrowLeft') setIndex((i) => Math.max(0, i - 1));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const page =
    'bg-parchment bg-[radial-gradient(ellipse_at_center,rgba(255,255,255,0.35),transparent_70%)]';

  return (
    <div
      className="pointer-events-auto fixed inset-0 z-30 flex items-center justify-center bg-ink/55 p-4 max-md:p-3"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-label="Handbuch"
        onClick={(e) => e.stopPropagation()}
        className="relative flex h-[min(44rem,90vh)] w-full max-w-5xl rounded-md border-2 border-ink bg-[#6e2618] p-2.5 text-ink shadow-[6px_8px_0_rgba(59,42,24,0.45)] max-md:h-[calc(100dvh-1.5rem)] max-md:flex-col max-md:p-1.5"
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Handbuch schließen"
          className="absolute -top-3 -right-3 z-10 h-8 w-8 rounded-full border-2 border-ink bg-parchment text-lg leading-none hover:bg-seal hover:text-parchment"
        >
          ×
        </button>

        {/* Left page: contents */}
        <nav
          className={`${page} flex min-h-0 w-[38%] flex-col border border-ink/60 px-6 py-5 shadow-[inset_-18px_0_24px_-14px_rgba(59,42,24,0.45)] max-md:w-full max-md:px-4 ${toc ? 'max-md:flex-1' : 'max-md:hidden'}`}
        >
          <div className="text-center text-xs tracking-[0.3em] text-ink-soft uppercase">
            Vectoria
          </div>
          <h2 className="mt-1 mb-3 border-b-[3px] border-double border-ink pb-1 text-center text-2xl italic">
            Handbuch
          </h2>
          <ol className="min-h-0 space-y-0.5 overflow-y-auto">
            {CHAPTERS.map((c, i) => (
              <li key={c.id}>
                <button
                  type="button"
                  onClick={() => go(i)}
                  className={`flex w-full items-baseline gap-1.5 px-1 py-0.5 text-left max-md:py-1.5 ${
                    i === index ? 'bg-parchment-deep/70 font-bold text-seal' : 'hover:text-seal'
                  }`}
                >
                  <span className="w-9 shrink-0 text-right text-ink-soft tabular-nums">
                    {toRoman(i + 1)}.
                  </span>
                  <span className="shrink-0 italic">{c.title}</span>
                  <span className="min-w-2 flex-1 translate-y-[-3px] border-b border-dotted border-ink/50" />
                  <span className="shrink-0 text-xs text-ink-soft tabular-nums">{i * 2 + 3}</span>
                </button>
              </li>
            ))}
          </ol>
          <div className="mt-auto flex justify-center gap-1.5 pt-3">
            {CARD_TYPES.map((card) => (
              <button
                key={card}
                type="button"
                title={CARDS[card].name}
                onClick={() => go(CHAPTERS.findIndex((c) => c.id === 'catalog'))}
                className="w-10 border border-ink/60 bg-parchment p-[1px] hover:-translate-y-0.5"
              >
                <CardArt card={card} className="h-6 w-full" />
              </button>
            ))}
          </div>
        </nav>

        {/* Spine */}
        <div className="w-1.5 bg-gradient-to-r from-ink/60 via-ink/20 to-ink/60 max-md:hidden" />

        {/* Right page: chapter */}
        <article
          className={`${page} flex min-h-0 flex-1 flex-col border border-ink/60 px-7 py-5 shadow-[inset_18px_0_24px_-14px_rgba(59,42,24,0.45)] max-md:px-4 max-md:py-3 ${toc ? 'max-md:hidden' : ''}`}
        >
          <div className="flex items-center justify-between text-xs text-ink-soft italic">
            <span>Kapitel {toRoman(index + 1)}</span>
            <span className="max-md:hidden">Handbuch von Vectoria</span>
            <button
              type="button"
              onClick={() => setToc(true)}
              className="border border-ink/50 bg-parchment-deep/60 px-2 py-1 not-italic text-ink md:hidden"
            >
              ☰ Inhalt
            </button>
          </div>
          <h2 className="mt-1 mb-3 border-b border-ink/40 pb-1 text-2xl italic">{chapter.title}</h2>
          <div
            key={chapter.id}
            className="min-h-0 flex-1 overflow-y-auto pr-2 text-[15px] [&>p:first-child]:first-letter:float-left [&>p:first-child]:first-letter:mr-1.5 [&>p:first-child]:first-letter:text-5xl [&>p:first-child]:first-letter:leading-[0.9] [&>p:first-child]:first-letter:text-seal"
          >
            {chapter.body({ victoryPointsToWin })}
          </div>
          <footer className="mt-3 flex items-center justify-between border-t border-ink/30 pt-2 text-sm">
            <button
              type="button"
              disabled={index === 0}
              onClick={() => setIndex(index - 1)}
              className="italic hover:text-seal disabled:opacity-30"
            >
              ← <span className="max-md:hidden">{CHAPTERS[index - 1]?.title ?? ''}</span>
              <span className="md:hidden">Zurück</span>
            </button>
            <span className="text-xs text-ink-soft tabular-nums">— {index * 2 + 3} —</span>
            <button
              type="button"
              disabled={index === CHAPTERS.length - 1}
              onClick={() => setIndex(index + 1)}
              className="italic hover:text-seal disabled:opacity-30"
            >
              <span className="max-md:hidden">{CHAPTERS[index + 1]?.title ?? ''}</span>
              <span className="md:hidden">Weiter</span> →
            </button>
          </footer>
        </article>
      </div>
    </div>
  );
}

function toRoman(n: number): string {
  const numerals: [number, string][] = [
    [10, 'X'],
    [9, 'IX'],
    [5, 'V'],
    [4, 'IV'],
    [1, 'I'],
  ];
  let out = '';
  for (const [value, numeral] of numerals) {
    while (n >= value) {
      out += numeral;
      n -= value;
    }
  }
  return out;
}

/** The open handbook, wherever it was opened from (compass corner or the phone top bar). */
export function Handbook() {
  const open = useGameStore((s) => s.handbook);
  const setHandbook = useGameStore((s) => s.setHandbook);
  const victoryPointsToWin = useGameStore((s) => s.view?.victoryPointsToWin ?? 0);
  return open ? (
    <Book victoryPointsToWin={victoryPointsToWin} onClose={() => setHandbook(false)} />
  ) : null;
}

/**
 * Handbook entry on the join screen, before there is a game view: lets people read the rules
 * while registration is still open.
 */
export function HandbookInvite({ victoryPointsToWin }: { victoryPointsToWin: number }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex w-full items-center gap-3 border-2 border-ink bg-parchment px-4 py-2 text-left shadow-[3px_4px_0_rgba(59,42,24,0.35)] transition-transform hover:-translate-y-0.5"
      >
        <BookGlyph size={40} />
        <span className="leading-tight">
          <b className="block italic">Handbuch lesen</b>
          <span className="text-sm text-ink-soft">Regeln, Kampf, Truhen & Karten</span>
        </span>
      </button>
      {open && <Book victoryPointsToWin={victoryPointsToWin} onClose={() => setOpen(false)} />}
    </>
  );
}

/** Small book button for the phone top bar. */
export function HandbookButton() {
  const setHandbook = useGameStore((s) => s.setHandbook);
  return (
    <button
      type="button"
      onClick={() => setHandbook(true)}
      title="Handbuch öffnen"
      aria-label="Handbuch öffnen"
      className="-my-1 shrink-0"
    >
      <BookGlyph size={32} />
    </button>
  );
}

/** Bottom-left corner: the compass rose with the handbook beside it; either opens the book. */
export function HandbookCorner() {
  const setHandbook = useGameStore((s) => s.setHandbook);
  const open = () => setHandbook(true);
  return (
    <div className="pointer-events-auto flex items-end gap-1">
      <button
        type="button"
        onClick={open}
        title="Handbuch öffnen"
        aria-label="Handbuch öffnen"
        className="transition-transform hover:-rotate-6"
      >
        <img src={COMPASS_URL} alt="" className="h-24 w-auto" draggable={false} />
      </button>
      <button
        type="button"
        onClick={open}
        title="Handbuch öffnen"
        className="mb-1 flex flex-col items-center transition-transform hover:-translate-y-1"
      >
        <BookGlyph />
        <span className="border border-ink bg-parchment px-1.5 text-xs italic shadow-[1px_2px_0_rgba(59,42,24,0.35)]">
          Handbuch
        </span>
      </button>
    </div>
  );
}
