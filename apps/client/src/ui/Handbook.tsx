import {
  CARD_TYPES,
  CARDS,
  cardChance,
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
  HOUR_MS,
  LOADED_SPEED,
  SPOT_BALANCE_TOLERANCE_HOURS,
  SPOT_FAR_HOURS,
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
import { formatGameDuration, formatPercent, formatResources } from '../game/format';
import { useGameStore } from '../state/store';
import { CardFace } from './CardFace';
import { CardArt } from './icons';
import { Button, Tip } from './Panel';
import { Badge } from '@/components/ui/badge';
import { ChevronLeftIcon, ChevronRightIcon, MenuIcon } from 'lucide-react';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';

const COMPASS_URL = dataUrl(compassRose());
const INK = '#3b2a18';

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

/** "Im Detail": the special and edge cases after a chapter's general part. */
function Details({ items }: { items: ReactNode[] }) {
  return (
    <section className="mt-4 border-t border-ink/30 pt-2">
      <h3 className="mb-1 text-xs font-bold tracking-[0.2em] text-seal uppercase">Im Detail</h3>
      <List items={items} />
    </section>
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
        <Details
          items={[
            'Das Spiel endet sofort, wenn jemand das Siegziel erreicht — auch mitten im Spieltag.',
            'Kaufst du mehrere Siegpunkte auf einmal, zahlst du die Summe der einzelnen, steigenden Preise.',
            'Siegpunkte gehen nie verloren, auch nicht, wenn deine Burg gestürmt wird.',
            'Beendet der Admin das Spiel bei Gleichstand, gewinnt, wer sich früher angemeldet hat.',
          ]}
        />
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
            `${CHESTS_PER_GAMEDAY} neue Truhen erscheinen auf der Karte.`,
          ]}
        />
        <Details
          items={[
            'Ein Spieltag beginnt mit dem ersten Moment Spielzeit eines Werktags (10 Uhr).',
            'Auch Laden, Bollwerk und alle anderen Dauern pausieren nachts: Ein Zug, der um 17:30 Uhr noch 1 Stunde braucht, kommt am nächsten Werktag um 10:30 Uhr an.',
            'Was nachts ankommen würde, kommt nicht an — Kämpfe, Überfälle und Ankünfte passieren nur während der Spielzeit, dann aber exakt in der Reihenfolge ihrer Ankunftszeiten.',
            'Pausiert der Admin die Uhr, steht alles still wie in der Nacht.',
            'War der Server länger aus, holt die Uhr die verpasste Spielzeit nach; Einkommen gibt es dabei nur einmal, nicht für jeden verpassten Tag.',
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
          {GATHER_YIELD_PER_100_TROOPS} Einheiten zurück — zu der Burg, aus der sie kamen. Beladen
          marschieren sie heim nur mit <b>{formatPercent(LOADED_SPEED)} Tempo</b> und sind unterwegs
          angreifbar.
        </P>
        <P>
          Die Vorkommen sind fair verteilt: Der Weg zum nächsten Holz, Stein und Gold zusammen ist
          für alle etwa gleich lang (höchstens{' '}
          {formatGameDuration(SPOT_BALANCE_TOLERANCE_HOURS * HOUR_MS)} Unterschied). Dafür liegt bei
          jedem eine der drei Ressourcen mindestens {SPOT_FAR_HOURS} Stunden entfernt.
        </P>
        <P>
          Solange Truppen sammeln, bleibt das Vorkommen auf der Karte sichtbar; ein kleines
          Truppenabzeichen mit der Truppenzahl oben rechts daneben zeigt, wer dort gerade lädt.
        </P>
        <Details
          items={[
            'Das Einkommen landet immer in der Basis — auch während deine Burg gefallen ist.',
            `Ohne gewählte Basisaktivität gibt es nur +${DAILY_BASE_INCOME} jeder Ressource. Wählst du mehrmals am Tag, zählt die letzte Wahl.`,
            `Die Ausbeute wird abgerundet: Unter 100 Truppen gibt es entsprechend weniger, unter ${Math.ceil(100 / GATHER_YIELD_PER_100_TROOPS)} Truppen gar nichts.`,
            'Vorkommen erschöpfen sich nie; beliebig viele Züge — auch verschiedener Spieler — können gleichzeitig am selben Vorkommen laden. Dort kämpft niemand.',
            'Ladende Züge können nicht angegriffen werden. Erst auf dem Heimweg mit Ladung sind sie angreifbar.',
            'Rufst du einen ladenden Zug zurück oder leitest ihn um, bricht er das Laden ab und hat nichts dabei.',
            'Die Ladung geht an die Burg, aus der der Zug losgezogen ist — ist dieser Stützpunkt inzwischen verloren, an die Basis.',
            'Die faire Verteilung der Vorkommen ist ab deiner Heimatburg gemessen, nicht ab Stützpunkten.',
          ]}
        />
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
            `Zwischen eigenen Burgen lassen sich beliebig viele Ressourcen mitnehmen — beladen aber nur mit ${formatPercent(LOADED_SPEED)} Tempo.`,
            'Fällt ein Stützpunkt, gehört er samt Lager dem Eroberer; die Überlebenden fliehen heim. Deine Züge, die gerade dorthin unterwegs sind, kehren sofort zur Burg um — mit ihrer Ladung.',
            'Züge kehren zu der Burg zurück, aus der sie kamen — ist sie verloren, zur Basis.',
          ]}
        />
        <Details
          items={[
            'Eine Ruine hat keine Verteidiger: Schon 1 Truppe nimmt sie ein, ganz ohne Verluste. Liegt noch ein Lager darin, gehört es dir.',
            'Dasselbe gilt für einen eigenen Stützpunkt, aus dem du alle Truppen abgezogen hast — leer ist er für jeden mit 1 Truppe zu haben.',
            'Wer einen Stützpunkt erobert, bleibt mit allen überlebenden Truppen als Besatzung dort; der Zug kehrt nicht heim.',
            'Das Bollwerk schützt nur die Basis, nie einen Stützpunkt.',
            'Truppen kaufen und Ressourcen ausgeben geht nur in der Basis. Ein Stützpunkt ist Lager und Absprungpunkt, sonst nichts.',
            'Ressourcen mitnehmen geht nur zu einer eigenen Burg. Solche Transporte (z. B. „Heimholen“) sind beladen langsamer und können unterwegs überfallen werden.',
            'Truppen zu der Burg schicken, in der sie schon stehen, geht nicht.',
            'Fällt ein Stützpunkt, laufen deine Züge, die von dort aufgebrochen sind, später zur Basis statt dorthin zurück.',
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
              <b>Umleiten:</b> ein Zug ohne Ladung (auch auf dem Heimweg) kann im Feld ein neues
              Ziel bekommen — wähle das Ziel auf der Karte, unter „Zug im Feld umleiten“ stehen
              deine Züge.
            </>,
            <>
              <b>Heimweg:</b> immer für alle sichtbar, auch wenn der Hinweg getarnt war. Mit
              Ressourcen im Gepäck geht es nur mit {formatPercent(LOADED_SPEED)} Tempo heim.
            </>,
          ]}
        />
        <Details
          items={[
            'Zurückgerufen wird von der aktuellen Position aus, zur Burg, aus der der Zug kam.',
            'Wer schon heimkehrt, kann nicht zurückgerufen werden — ohne Ladung aber umgeleitet.',
            'Umleiten geht nicht mit Ladung oder Truhe. Ein umgeleiteter Zug behält Nebel, Tarnung und Eilmarsch.',
            'Truppen in Zügen und Stützpunkten verteidigen die Basis nicht. Die Basis verteidigen nur die Truppen, die gerade daheim stehen.',
            'Die Truppenzahl eines Zuges ändert sich nur durch Kämpfe; unterwegs kann niemand dazustoßen.',
            'Truhenträger ohne Ladung marschieren normal schnell, nur Ressourcen bremsen.',
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
              formatPercent(COMBAT.attackerWinsAttackerLoss),
              formatPercent(COMBAT.attackerWinsDefenderLoss),
            ],
            [
              'Verteidiger hält',
              formatPercent(COMBAT.defenderWinsAttackerLoss),
              formatPercent(COMBAT.defenderWinsDefenderLoss),
            ],
          ]}
        />
        <H>Beute</H>
        <List
          items={[
            `Burg: ${formatPercent(CASTLE_PLUNDER_SHARE)} aller Ressourcen in der Basis und eine Truhe.`,
            'Stützpunkt / Ruine: der Stützpunkt selbst samt ganzem Lager.',
            'Überfallener Zug: die ganze Ladung.',
          ]}
        />
        <P>Mit der Karte Bollwerk verteidigt die Burg mit ×{FORTIFY_MULTIPLIER} Stärke.</P>
        <H>Gefallene Burg</H>
        <P>
          Wer seine Basis verliert, ruft <b>sofort alle Truppen heim</b>: Jeder Zug kehrt zur Burg
          um. Alle Stützpunkte werden <b>aufgegeben</b> und verfallen wieder zu Ruinen; ihre
          Besatzung zieht samt Lager nach Hause (ohne Besatzung bleibt das Lager in der Ruine). Bis
          die letzten Truppen daheim sind, kannst du <b>nichts tun</b> — nichts kaufen, niemanden
          losschicken, keine Karte spielen.
        </P>
        <H>Rechenbeispiele</H>
        <Table
          head={['Kampf', 'Ausgang', 'Verluste']}
          rows={[
            ['100 gegen 60', 'Angreifer siegt', 'Angreifer 25, Verteidiger 30'],
            [
              '100 gegen 10',
              'Angreifer siegt',
              'Angreifer nur 10 (nie mehr, als die Gegenseite hatte), Verteidiger 5',
            ],
            [
              '60 gegen 60',
              'Verteidiger hält (Gleichstand reicht nicht)',
              'Angreifer 60, Verteidiger 15',
            ],
            ['1 gegen 60', 'Verteidiger hält', 'Angreifer 1, Verteidiger 1'],
            ['1 gegen 0', 'Angreifer siegt', 'niemand'],
            [
              `100 gegen 70 mit Bollwerk`,
              `Verteidiger hält (70 × ${FORTIFY_MULTIPLIER} = 105)`,
              'Angreifer 100, Verteidiger 18',
            ],
          ]}
        />
        <Details
          items={[
            'Verluste werden aufgerundet. Ein siegreicher Zug behält aber immer mindestens 1 Truppe.',
            'Ein verlorener Angriff kostet den ganzen Zug.',
            'Das Bollwerk zählt nur beim Vergleich der Stärke; die Verluste rechnen mit den echten Truppenzahlen.',
            'Die Burg selbst wechselt nie den Besitzer. Der Sieger nimmt Beute und Truhe und zieht heim — mit Beute beladen langsamer und überfallbar.',
            `Die Beute wird je Ressource abgerundet: Wer nur 1 Holz daheim hat, verliert es nicht. Auch wer gar nichts hat, wird gestürmt — die Truhe gibt es trotzdem.`,
            'Die Truhe entsteht neu; ungeöffnete Truhen und Karten des Verlierers bleiben, wo sie sind.',
            'Kommen mehrere Angreifer an, wird nacheinander gekämpft, in der Reihenfolge ihrer Ankunft. Jeder Kampf sieht die Verteidigung, die der vorige übrig gelassen hat.',
            'Eine gefallene Burg lässt sich erneut stürmen — jeder weitere Sieg bringt eine weitere Truhe.',
          ]}
        />
        <H>Gefallene Burg im Detail</H>
        <List
          items={[
            'Alle Züge drehen um: Hinmärsche, Angriffe, Überfälle, Truhenbergungen und Transporte. Ladung und Truhen nehmen sie mit.',
            'Ladende Züge brechen ab und kommen ohne Ladung heim.',
            'Stützpunkte werden zu Ruinen. Die Besatzung trägt das ganze Lager heim (beladen, also langsamer).',
            'Während des Rückzugs sind alle deine Züge unantastbar: Niemand kann sie überfallen, auch Überfälle, die schon unterwegs sind, gehen ins Leere. Deine Basis kann aber weiter gestürmt werden.',
            'Stehen gerade keine Truppen außerhalb, gibt es keine Sperre; die Stützpunkte sind trotzdem aufgegeben.',
            'Während der Sperre läuft das Einkommen weiter, du kannst aber auch keine Truhe öffnen und die Basisaktivität nicht wechseln.',
            'Du kannst in der Zeit weiter angegriffen und überfallen werden; heimkehrende Truppen verstärken die Basis, sobald sie ankommen.',
            'Die Sperre endet in dem Moment, in dem der letzte Zug daheim ankommt.',
          ]}
        />
      </>
    ),
  },
  {
    id: 'raids',
    title: 'Überfälle',
    body: () => (
      <>
        <P>
          Ein Zug, der <b>Ressourcen</b> trägt, lässt sich abfangen — auf dem Heimweg ebenso wie als
          Transport zwischen eigenen Burgen. Wähle ihn auf der Karte an und schicke Truppen aus
          einer Burg los oder leite einen Zug im Feld um. Der Treffpunkt wird vorausberechnet —
          erreicht der Zug sein Ziel vorher, geht es nicht. Beladene Züge laufen nur mit{' '}
          {formatPercent(LOADED_SPEED)} Tempo und sind daher leichter einzuholen; nach einem
          verlorenen Überfall ziehen sie ohne Ladung wieder normal schnell weiter.
        </P>
        <P>
          Züge ohne Ladung können nicht überfallen werden. Eine Truhe lässt sich nie rauben — trägt
          ihr Zug auch Ressourcen, kann man ihm aber die Ressourcen abnehmen. Ein Truhenträger
          behält dabei immer mindestens eine Truppe, die Truhe kommt also sicher heim.
        </P>
        <P>
          Ein Zug, der selbst Ressourcen heimbringt, kann niemanden überfallen: Wer Ladung trägt,
          lässt sich weder umleiten noch mit Ressourcen auf einen Überfall schicken.
        </P>
        <Details
          items={[
            'Überfallbar ist jeder marschierende Zug mit Ressourcen: Heimkehrer vom Vorkommen, Sieger mit Beute, Transporte zwischen eigenen Burgen. Nicht überfallbar: Züge ohne Ressourcen und ladende Züge.',
            'Ausnahme Rückzug: Ist die Burg eines Spielers gefallen, sind alle seine Züge unantastbar, bis alle daheim sind. Ein Überfall, der schon unterwegs ist, geht dann ins Leere.',
            'Ein ausgeraubter Transport läuft leer und wieder normal schnell zu seinem Ziel weiter.',
            'Gewinnt der Überfall, nimmt der Räuber die ganze Ladung und trägt sie selbst heim — beladen, also langsamer und seinerseits überfallbar.',
            'Der Überfallene zieht danach ohne Ladung weiter, wieder in normalem Tempo und mit seinen Verlusten.',
            'Scheitert der Überfall, fällt der ganze Räuberzug; der Überfallene verliert nur ein Viertel.',
            'Wird ein Zug ganz aufgerieben, ist er weg. Ausnahme: Ein Truhenträger behält immer mindestens 1 Truppe.',
            'Der Räuber kommt exakt zum geplanten Zeitpunkt am Treffpunkt an. Ist der Zug dann nicht mehr da (schon daheim, oder ein anderer hat ihn schon ausgeraubt und er ist schneller geworden), geht der Überfall ins Leere und der Räuber kehrt leer um.',
            'Wurde der Zug vorher schon von jemand anderem ausgeraubt, gibt es nichts mehr zu holen — ein leerer Zug wird nicht überfallen.',
            'Eilmarsch auf dem Räuberzug macht ihn schneller und erlaubt einen früheren Treffpunkt. Mit Nebel sieht das Opfer nicht, wie stark der Räuber ist.',
            'Eigene Züge kannst du nicht überfallen.',
          ]}
        />
      </>
    ),
  },
  {
    id: 'chests',
    title: 'Truhen',
    body: () => (
      <>
        <P>
          Jeden Spieltag erscheinen {CHESTS_PER_GAMEDAY} Truhen auf der Karte. Gleichzeitig liegen
          dort höchstens so viele, wie Spieler:innen mitspielen — mindestens aber{' '}
          {CHESTS_PER_GAMEDAY}. Um eine Truhe zu öffnen, braucht es eine bestimmte Zahl Truppen (
          {CHEST_TROOPS_MIN}–{CHEST_TROOPS_MAX}); sie steht auf der Karte neben der Truhe.
        </P>
        <List
          items={[
            'Wer zuerst mit genug Truppen ankommt, birgt die Truhe.',
            'Die Truppen bringen sie sofort heim; die Truhe kann ihnen niemand rauben.',
            'Wer eine Burg stürmt, bekommt zusätzlich zur Beute eine Truhe.',
            'Zu wenige Truppen kehren mit leeren Händen um.',
            'Daheim wartet die Truhe auf dich. Erst beim Öffnen zeigt sich, welche Karte darin liegt.',
          ]}
        />
        <Details
          items={[
            'Mit zu wenigen Truppen kannst du gar nicht erst zu einer Truhe aufbrechen oder umleiten.',
            'Kommen zwei Züge an, gewinnt, wer zuerst da ist. Der zweite findet nichts und kehrt leer um.',
            'Ist die Karte schon voll (so viele Truhen wie Spieler, mindestens drei), erscheinen am neuen Spieltag entsprechend weniger.',
            'Truhen erscheinen möglichst weit weg von Burgen, Stützpunkten, Vorkommen und anderen Truhen.',
            'Ein Truhenträger kann nicht umgeleitet werden und kehrt immer heim — zu der Burg, aus der er kam. Auch über einen Stützpunkt landet die Truhe bei dir: Truhen gehören dem Spieler, nicht der Burg.',
            'Eine normal geborgene Truhe ist nie überfallbar, weil ihr Zug keine Ressourcen trägt. Nur eine Truhe aus einem Burgsturm reist zusammen mit Beute — dann kann man die Beute rauben, die Truhe nie.',
            'Ungeöffnete Truhen daheim kann dir niemand nehmen, auch nicht beim Sturm auf deine Burg.',
            `Welche Karte in einer Truhe liegt, ist Zufall: ${CARD_TYPES.map((c) => `${CARDS[c].name} ${formatPercent(cardChance(c))}`).join(', ')}.`,
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
        <Details
          items={[
            'Eine scharf geschaltete Marschkarte bleibt in deiner Hand, bis ein Zug sie mitnimmt. Du kannst sie wieder entschärfen oder durch eine andere ersetzen.',
            'Beim Losschicken entscheidest du, ob die scharfe Karte mitgeht. Umleiten verbraucht keine Karte.',
            'Nebel gilt für das ganze Leben des Zuges, auch auf dem Heimweg: Andere sehen nur „?“, auch im Liveticker.',
            'Tarnung verbirgt Ziel und Route nur auf dem Hinweg (auch nach Umleiten). Der Heimweg ist immer offen.',
            'Eilmarsch halbiert nur den Hinweg (auch nach Umleiten). Heim geht es normal schnell.',
            'Mehrere Bollwerke hintereinander verlängern die Wirkung jeweils um einen weiteren Spieltag. Die Dauer läuft in Spielzeit, pausiert also nachts.',
            'Seeweg führt den Hinweg schnurgerade zum Ziel, auch übers Wasser. Heim geht es wieder über Land. Wer umleitet, verlässt den Seeweg; für Überfälle taugt er nicht. Einen Zug auf dem Wasser kann niemand abfangen.',
            'Füllhorn zahlt an den nächsten drei Spieltag-Anfängen je +1 Holz, Stein und Gold zusätzlich in deine Burg. Mehrere Füllhörner verlängern um je drei Spieltage.',
            'Schuhe klauen trifft alle Züge, die die gewählte Person in den nächsten 8 Stunden Spielzeit losschickt (auch Heimwege und Umleitungen): 75 % Tempo, beladen also nur noch etwa 56 %. Schon laufende Züge behalten ihr Tempo.',
            'Hofumzug tauscht die Orte deiner Burg und eines deiner Stützpunkte. Truppen und Lager bleiben, wo sie hingehören: Die Burg nimmt ihre mit, der Stützpunkt seine. Züge auf dem Weg zu einer der beiden laufen zum neuen Ort weiter. Hofumzug ist seltener als die anderen Karten.',
            'Karten können nicht gestohlen werden und gehen beim Sturm auf deine Burg nicht verloren.',
          ]}
        />
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
        <P>
          In der Rangliste zeigt ein <b>grüner Punkt</b> neben dem Namen, wer gerade online ist; ein
          leerer Kreis heißt offline.
        </P>
        <P>
          Ändern sich während des Spiels die Regeln, steht das unter <b>Neuerungen</b> (Schriftrolle
          neben dem Handbuch). Neue Änderungen erscheinen dort einmal von selbst.
        </P>
        <Details
          items={[
            'Ladungen sind immer für alle sichtbar, auch unter Nebel oder Tarnung.',
            'Der Liveticker zeigt die letzten 60 Ereignisse, deine Chronik die letzten 30 Einträge.',
            'Der Liveticker schreibt mit, was alle sehen: Unter Nebel steht dort „?“ statt der Truppenzahl, unter Tarnung „unbekanntes Ziel“.',
          ]}
        />
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

  // Escape and outside clicks close the dialog (radix); arrows turn the pages.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') setIndex((i) => Math.min(CHAPTERS.length - 1, i + 1));
      if (e.key === 'ArrowLeft') setIndex((i) => Math.max(0, i - 1));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const page =
    'bg-parchment bg-[radial-gradient(ellipse_at_center,rgba(255,255,255,0.35),transparent_70%)]';

  return (
    <Dialog open onOpenChange={(open) => (open ? undefined : onClose())}>
      <DialogContent
        bare
        aria-describedby={undefined}
        className="h-[min(44rem,90vh)] max-h-none w-[calc(100vw-2rem)] max-w-5xl flex-row rounded-md border-2 border-ink bg-[#6e2618] p-2.5 text-ink shadow-[6px_8px_0_rgba(59,42,24,0.45)] max-md:h-[calc(100dvh-1.5rem)] max-md:w-[calc(100vw-1.5rem)] max-md:flex-col max-md:p-1.5"
      >
        <DialogTitle className="sr-only">Handbuch</DialogTitle>

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
                <Button
                  variant="ghost"
                  onClick={() => go(i)}
                  aria-current={i === index ? 'page' : undefined}
                  className={`h-auto w-full items-baseline justify-start gap-1.5 rounded-sm px-1 py-0.5 text-left text-base font-normal max-md:py-1.5 ${
                    i === index ? 'bg-accent/70 font-bold text-seal' : 'hover:text-seal'
                  }`}
                >
                  <span className="w-9 shrink-0 text-right text-ink-soft tabular-nums">
                    {toRoman(i + 1)}.
                  </span>
                  <span className="shrink-0 italic">{c.title}</span>
                  <span className="min-w-2 flex-1 translate-y-[-3px] border-b border-dotted border-ink/50" />
                  <span className="shrink-0 text-xs text-ink-soft tabular-nums">{i * 2 + 3}</span>
                </Button>
              </li>
            ))}
          </ol>
          <div className="mt-auto flex justify-center gap-1.5 pt-3">
            {CARD_TYPES.map((card) => (
              <Tip key={card} label={CARDS[card].name}>
                <Button
                  variant="plain"
                  aria-label={CARDS[card].name}
                  onClick={() => go(CHAPTERS.findIndex((c) => c.id === 'catalog'))}
                  className="block w-10 rounded-[2px] border border-ink/60 bg-card p-[1px] hover:-translate-y-0.5"
                >
                  <CardArt card={card} className="h-6 w-full" />
                </Button>
              </Tip>
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
            <Button size="sm" onClick={() => setToc(true)} className="not-italic md:hidden">
              <MenuIcon /> Inhalt
            </Button>
          </div>
          <h2 className="mt-1 mb-3 border-b border-ink/40 pb-1 text-2xl italic">{chapter.title}</h2>
          <div
            key={chapter.id}
            className="min-h-0 flex-1 overflow-y-auto pr-2 text-[15px] [&>p:first-child]:first-letter:float-left [&>p:first-child]:first-letter:mr-1.5 [&>p:first-child]:first-letter:text-5xl [&>p:first-child]:first-letter:leading-[0.9] [&>p:first-child]:first-letter:text-seal"
          >
            {chapter.body({ victoryPointsToWin })}
          </div>
          <footer className="mt-3 flex items-center justify-between border-t border-ink/30 pt-2 text-sm">
            <Button
              variant="ghost"
              size="sm"
              disabled={index === 0}
              onClick={() => setIndex(index - 1)}
              className="text-sm italic hover:text-seal disabled:opacity-30"
            >
              <ChevronLeftIcon />
              <span className="max-md:hidden">{CHAPTERS[index - 1]?.title ?? ''}</span>
              <span className="md:hidden">Zurück</span>
            </Button>
            <span className="text-xs text-ink-soft tabular-nums">— {index * 2 + 3} —</span>
            <Button
              variant="ghost"
              size="sm"
              disabled={index === CHAPTERS.length - 1}
              onClick={() => setIndex(index + 1)}
              className="text-sm italic hover:text-seal disabled:opacity-30"
            >
              <span className="max-md:hidden">{CHAPTERS[index + 1]?.title ?? ''}</span>
              <span className="md:hidden">Weiter</span>
              <ChevronRightIcon />
            </Button>
          </footer>
        </article>
      </DialogContent>
    </Dialog>
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
      <Button
        variant="plain"
        onClick={() => setOpen(true)}
        className="flex w-full items-center justify-start gap-3 rounded-sm border-2 border-ink bg-card px-4 py-2 text-left font-normal whitespace-normal shadow-[3px_4px_0_rgba(59,42,24,0.35)] transition-transform hover:-translate-y-0.5"
      >
        <BookGlyph size={40} />
        <span className="leading-tight">
          <b className="block italic">Handbuch lesen</b>
          <span className="text-sm text-ink-soft">Regeln, Kampf, Truhen & Karten</span>
        </span>
      </Button>
      {open && <Book victoryPointsToWin={victoryPointsToWin} onClose={() => setOpen(false)} />}
    </>
  );
}

/** Small book button for the phone top bar. */
export function HandbookButton() {
  const setHandbook = useGameStore((s) => s.setHandbook);
  return (
    <Tip label="Handbuch öffnen">
      <Button
        variant="plain"
        onClick={() => setHandbook(true)}
        aria-label="Handbuch öffnen"
        className="-my-1 shrink-0"
      >
        <BookGlyph size={32} />
      </Button>
    </Tip>
  );
}

/** Bottom-left corner: the compass rose with the handbook beside it; either opens the book. */
export function HandbookCorner() {
  const setHandbook = useGameStore((s) => s.setHandbook);
  const open = () => setHandbook(true);
  return (
    <div className="pointer-events-auto flex items-end gap-1">
      <Tip label="Handbuch öffnen">
        <Button
          variant="plain"
          onClick={open}
          aria-label="Handbuch öffnen"
          className="transition-transform hover:-rotate-6"
        >
          <img src={COMPASS_URL} alt="" className="h-24 w-auto" draggable={false} />
        </Button>
      </Tip>
      <Button
        variant="plain"
        onClick={open}
        className="mb-1 flex-col transition-transform hover:-translate-y-1"
      >
        <BookGlyph />
        <Badge variant="plate">Handbuch</Badge>
      </Button>
    </div>
  );
}
