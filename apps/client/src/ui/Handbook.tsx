import {
  ASSAULT_LOCK_MS,
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
  OUTPOST_LEVEL_GAMEDAYS,
  OUTPOST_MAX_LEVEL,
  OUTPOST_STONE_PER_LEVEL,
  OUTPOST_UPKEEP_RELIEF_PER_LEVEL,
  FORTIFY_MULTIPLIER,
  GAMEDAY_HOURS,
  GATHER_DURATION_MS,
  GATHER_YIELD_PER_100_TROOPS,
  HOUR_MS,
  LOADED_SPEED,
  MAX_ARMIES,
  MAX_CARGO_RAIDS,
  SPOT_BALANCE_TOLERANCE_HOURS,
  SPOT_FAR_HOURS,
  SPOT_GAP_HOURS,
  SPOT_HOLE_HOURS,
  SPOT_MAX_HOURS,
  SPOT_NEAR_HOURS,
  SPOT_SAME_GAP_HOURS,
  RESOURCE_NAMES,
  RESOURCES,
  STARTING_RESOURCES,
  STARTING_TROOPS,
  TROOP_BATCH_COST,
  TROOP_BATCH_SIZE,
  TROPHY_VP_INTERVAL,
  UPKEEP_DESERTERS_PER_UNIT,
  VP_TROOP_FACTOR_MIN,
  VP_TROOP_REFERENCE,
  VP_TROOP_SNAPSHOTS,
  VICTORY_POINTS_PER_GAMEDAY,
  type ResourceType,
  type Resources,
} from '@vectoria/shared';
import { useEffect, useState, type ReactNode } from 'react';
import { formatGameDuration, formatPercent } from '../game/format';
import { HERALDRY } from '../theme/tokens';
import { useGameStore } from '../state/store';
import { CardFace } from './CardFace';
import {
  AlarmIcon,
  CaravanIcon,
  CardArt,
  CastleIcon,
  ChestIcon,
  DepositIcon,
  DuoIcon,
  GatherBadgeIcon,
  OnlineDot,
  OutpostIcon,
  ResourceIcon,
  ShipIcon,
  SoldiersIcon,
  SpotIcon,
  StarIcon,
  TrophyIcon,
  SunIcon,
  TentIcon,
} from './icons';
import { Button, Tip } from './Panel';
import { SourceLink } from './SourceLink';
import { Badge } from '@/components/ui/badge';
import { ChevronLeftIcon, ChevronRightIcon, MenuIcon } from 'lucide-react';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';

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

/** A folded parchment map with a dotted route (chapter icon of the map legend). */
function MapGlyph({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden>
      <path
        d="M2 5l6.5-2 7 2L22 3v16l-6.5 2-7-2L2 21z"
        fill="#f6eedb"
        stroke={INK}
        strokeWidth={1.4}
        strokeLinejoin="round"
      />
      <path d="M8.5 3v16M15.5 5v16" stroke={INK} strokeWidth={1} opacity=".45" />
      <path
        d="M5 16c2-1 3-4 6-4s3-4 7-5"
        fill="none"
        stroke="#9e2a1a"
        strokeWidth={1.4}
        strokeDasharray="1.6 1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

/** Example colours for the pictures: you, an opponent, a partner. */
const YOU = HERALDRY[0]!;
const FOE = HERALDRY[1]!;
const ALLY = HERALDRY[2]!;

/** Running text helpers so chapters read like a printed manual. */
function P({ children }: { children: ReactNode }) {
  return <p className="mb-2 leading-relaxed">{children}</p>;
}

function H({ icon, children }: { icon?: ReactNode; children: ReactNode }) {
  return (
    <h3 className="mt-4 mb-1.5 flex items-center gap-2 text-base font-bold italic">
      {icon}
      {children}
    </h3>
  );
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

/** Numbered steps: how something is done, one action per line. */
function Steps({ items }: { items: ReactNode[] }) {
  return (
    <ol className="mb-2 space-y-1.5">
      {items.map((item, i) => (
        <li key={i} className="flex gap-2 leading-relaxed">
          <span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full border border-ink bg-seal text-xs font-bold text-parchment not-italic">
            {i + 1}
          </span>
          <span>{item}</span>
        </li>
      ))}
    </ol>
  );
}

/** The one thing to remember from a chapter: a boxed note with a seal-red edge. */
function Remember({ children }: { children: ReactNode }) {
  return (
    <div className="my-3 border border-ink/30 border-l-4 border-l-seal bg-parchment-dark px-3 py-2 leading-relaxed">
      <b className="mr-1 text-seal italic">Merke:</b>
      {children}
    </div>
  );
}

/** Pictures with captions: map art on the left, what it means on the right. */
function Legend({ items }: { items: { art: ReactNode; title: string; text: ReactNode }[] }) {
  return (
    <div className="mb-3 grid gap-2 sm:grid-cols-2">
      {items.map((item) => (
        <div
          key={item.title}
          className="flex items-center gap-3 rounded-[3px] border border-ink/20 bg-parchment-dark/60 px-2 py-1.5"
        >
          <span className="grid w-12 shrink-0 place-items-center">{item.art}</span>
          <span className="leading-snug">
            <b className="block italic">{item.title}</b>
            <span className="text-sm">{item.text}</span>
          </span>
        </div>
      ))}
    </div>
  );
}

/** "Genau genommen": the special and edge cases after a chapter's general part. */
function Details({ items }: { items: ReactNode[] }) {
  return (
    <section className="mt-5 border-t border-ink/30 pt-2">
      <h3 className="mb-1 text-xs font-bold tracking-[0.2em] text-seal uppercase">
        Genau genommen
      </h3>
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

/** The load roundel as on the map: a parchment disc with the icons of what a convoy carries. */
function CargoRoundel({ resources, size = 36 }: { resources: ResourceType[]; size?: number }) {
  const icon = resources.length > 1 ? size * 0.36 : size * 0.56;
  return (
    <span
      className="inline-flex shrink-0 items-center justify-center gap-px rounded-full border-2 border-ink bg-parchment"
      style={{ width: size, height: size, borderWidth: size < 24 ? 1.5 : 2 }}
    >
      {resources.map((r) => (
        <ResourceIcon key={r} resource={r} size={icon} />
      ))}
    </span>
  );
}

/** A resource amount with its icon, inline in running text. */
function Res({ resource, children }: { resource: ResourceType; children?: ReactNode }) {
  return (
    <span className="inline-flex items-baseline gap-0.5 whitespace-nowrap">
      <ResourceIcon resource={resource} size={15} />
      {children ?? RESOURCE_NAMES[resource]}
    </span>
  );
}

/** A cost or stock ("1 Holz, 2 Stein, 1 Gold") with resource icons. */
function Cost({ resources }: { resources: Resources }) {
  const parts = RESOURCES.filter((r) => resources[r] > 0);
  return (
    <span className="whitespace-nowrap">
      {parts.map((r, i) => (
        <span key={r}>
          {i > 0 && ', '}
          <Res resource={r}>
            {resources[r]} {RESOURCE_NAMES[r]}
          </Res>
        </span>
      ))}
    </span>
  );
}

interface Chapter {
  id: string;
  title: string;
  /** Small picture for the contents and the chapter heading. */
  icon: ReactNode;
  body: (ctx: { victoryPointsToWin: number }) => ReactNode;
}

const CHAPTERS: Chapter[] = [
  {
    id: 'goal',
    title: 'Ziel des Spiels',
    icon: <StarIcon size={20} />,
    body: ({ victoryPointsToWin }) => (
      <>
        <P>
          Vectoria ist ein langsames Strategiespiel, das über viele Tage läuft. Jeder Spieler hat
          eine eigene Burg auf derselben Karte. Wer zuerst <b>{victoryPointsToWin} Siegpunkte</b>{' '}
          besitzt, gewinnt. Beendet der Admin das Spiel vorher, gewinnt, wer die meisten hat.
        </P>
        <H icon={<StarIcon size={18} />}>Siegpunkte kaufen</H>
        <P>
          Siegpunkte kaufst du in deiner Burg. Der erste kostet je 1 Holz, Stein und Gold, der
          zweite je 2, der dritte je 3 und so weiter. Den aktuellen Preis siehst du im Laden deiner
          Burg.
        </P>
        <P>
          Auf diesen Preis kommt dein <b>Truppenfaktor</b>: Je größer deine Armee, desto teurer
          werden Siegpunkte. Mit {VP_TROOP_REFERENCE} Truppen zahlst du den Grundpreis, mit doppelt
          so vielen gut ein Viertel mehr, mit wenigen Truppen nur die Hälfte (mindestens{' '}
          {formatPercent(VP_TROOP_FACTOR_MIN)}). Gezählt werden alle deine Truppen – in der Burg, in
          Stützpunkten und unterwegs – jeweils zu Spieltagsbeginn, im Schnitt der letzten{' '}
          {VP_TROOP_SNAPSHOTS} Spieltage. Der Preis steht also den ganzen Tag fest. Wer viel mit
          wenigen Truppen erwirtschaftet, kommt billiger an Siegpunkte.
        </P>
        <P>
          Pro Spieltag kannst du höchstens <b>{VICTORY_POINTS_PER_GAMEDAY} Siegpunkte</b> kaufen.
        </P>
        <H icon={<TrophyIcon size={18} />}>Trophäen</H>
        <P>
          Für jeden {TROPHY_VP_INTERVAL}. Siegpunkt brauchst du <b>Trophäen</b>: für den{' '}
          {TROPHY_VP_INTERVAL}. eine, den {TROPHY_VP_INTERVAL * 2}. drei, den{' '}
          {TROPHY_VP_INTERVAL * 3}. sechs und so weiter. Trophäen werden dabei{' '}
          <b>nicht verbraucht</b> – sie sind dein Ruf und stehen für alle sichtbar in der Rangliste.
          Eine Trophäe bekommst du für jeden <b>Sieg</b> über andere: einen geglückten Überfall,
          einen eroberten Stützpunkt oder eine gestürmte Burg (auch im Duo, dann jeder von euch).
          Trophäen landen sofort auf deinem Konto – sie müssen nicht heimgetragen werden und lassen
          sich nicht stehlen.
        </P>
        <Remember>
          Siegpunkte kann dir niemand wegnehmen. Ressourcen und Truppen dagegen schon.
        </Remember>
        <P>
          Zum Start hast du <b>{STARTING_TROOPS} Truppen</b> und{' '}
          <Cost resources={STARTING_RESOURCES} />.
        </P>
        <Details
          items={[
            'Das Spiel endet sofort, wenn jemand das Ziel erreicht – auch mitten am Spieltag.',
            'Kaufst du mehrere Siegpunkte auf einmal, zahlst du die Summe der einzelnen, steigenden Preise.',
            `Die Grenze von ${VICTORY_POINTS_PER_GAMEDAY} Siegpunkten gilt von einem Spieltagbeginn (10 Uhr) bis zum nächsten. Abend und Nacht gehören also noch zum alten Tag.`,
            'Siegpunkte gehen nie verloren, auch nicht, wenn deine Burg gestürmt wird.',
            'Eine leere Ruine wieder aufzubauen bringt keine Trophäe – nur ein Sieg über einen anderen Spieler zählt. Wer verliert, verliert keine Trophäen.',
            'Jeder Stützpunkt bringt dir nur einmal eine Trophäe: Eroberst du denselben Stützpunkt später noch einmal, gibt es keine weitere. Für andere Spieler zählt er weiter.',
            'Beendet der Admin das Spiel bei Gleichstand, gewinnt, wer sich früher angemeldet hat.',
          ]}
        />
      </>
    ),
  },
  {
    id: 'map',
    title: 'Die Karte auf einen Blick',
    icon: <MapGlyph />,
    body: () => (
      <>
        <P>
          Alles, was du auf der Karte siehst, kannst du anklicken. In der Seitenleiste (am Handy
          unten) steht dann, was es ist und was du damit tun kannst. Liegen mehrere Dinge
          übereinander, klickst du einfach noch einmal auf dieselbe Stelle.
        </P>
        <H>Orte</H>
        <Legend
          items={[
            {
              art: <CastleIcon color={YOU} size={44} />,
              title: 'Deine Burg (Basis)',
              text: 'Dein Zuhause, mit Stern im Namen und farbigem Sockel. Hier kaufst und lagerst du.',
            },
            {
              art: <CastleIcon color={FOE} style={1} size={44} />,
              title: 'Fremde Burg',
              text: 'Die Burg eines anderen Spielers, in seiner Farbe. Du kannst sie angreifen.',
            },
            {
              art: <OutpostIcon color={YOU} size={38} />,
              title: 'Stützpunkt',
              text: 'Ein Turm in der Farbe seines Besitzers: ein vorgeschobenes Lager.',
            },
            {
              art: <OutpostIcon color={null} size={38} />,
              title: 'Ruine',
              text: 'Gehört niemandem. Wer sie einnimmt, baut sie zum Stützpunkt auf.',
            },
            {
              art: <DepositIcon kind="wood" size={44} />,
              title: 'Vorkommen',
              text: (
                <>
                  Hier sammeln deine Truppen <Res resource="wood" />, <Res resource="stone" /> oder{' '}
                  <Res resource="gold" />.
                </>
              ),
            },
            {
              art: <DepositIcon kind="trader" size={44} />,
              title: 'Händler',
              text: 'Tauscht Stein gegen Gold und Holz.',
            },
            {
              art: <ChestIcon size={34} />,
              title: 'Truhe',
              text: 'Enthält eine Karte. Darunter steht, wie viele Truppen du zum Bergen brauchst.',
            },
          ]}
        />
        <H>Truppen unterwegs</H>
        <Legend
          items={[
            {
              art: <SoldiersIcon color={YOU} size={40} />,
              title: 'Heerzug',
              text: 'Truppen auf dem Marsch. Das Schild darunter zeigt, wie viele es sind.',
            },
            {
              art: <GatherBadgeIcon color={YOU} size={26} />,
              title: 'Am Sammeln',
              text: 'Ein Wappenschild mit der Truppenzahl rund um ein Vorkommen.',
            },
            {
              art: <TentIcon color={YOU} size={36} />,
              title: 'Nachtlager',
              text: 'Nachts schlagen marschierende Züge ein Zelt auf und stehen still.',
            },
            {
              art: <ShipIcon color={YOU} size={42} />,
              title: 'Auf See',
              text: 'Ein Zug mit der Karte Seeweg, der gerade übers Wasser fährt.',
            },
            {
              art: <CargoRoundel resources={['wood', 'stone', 'gold']} />,
              title: 'Ladung',
              text: 'Das runde Abzeichen am Zug zeigt, was er trägt. Wer etwas trägt, kann überfallen werden.',
            },
            {
              art: <CaravanIcon color={YOU} size={40} />,
              title: 'Karawane',
              text: 'Bringt abends das Lager deiner Stützpunkte heim. Nur du siehst deine.',
            },
            {
              art: <DuoIcon left={YOU} right={ALLY} size={40} />,
              title: 'Duo-Zug',
              text: 'Zwei Spieler greifen gemeinsam an. Das Namensschild trägt beide Farben.',
            },
            {
              art: <AlarmIcon size={30} />,
              title: 'Angriff naht',
              text: 'Gekreuzte Schwerter und ein roter Ring: Ein Gegner marschiert auf diesen Ort zu. Rauch heißt: Hier wurde gerade gekämpft.',
            },
          ]}
        />
        <Remember>
          Die gestrichelte Linie vor einem Zug ist sein restlicher Weg. Die Striche wandern in
          Richtung Ziel.
        </Remember>
      </>
    ),
  },
  {
    id: 'time',
    title: 'Spielzeit & Spieltage',
    icon: <SunIcon size={20} />,
    body: () => (
      <>
        <P>
          Die Spieluhr läuft nur <b>montags bis freitags von 10 bis 18 Uhr</b>. Nachts und am
          Wochenende ruht alles: Züge stehen still, nichts kommt an. Alle Zeiten im Spiel zählen nur
          diese Spielzeit.
        </P>
        <Legend
          items={[
            {
              art: <SunIcon size={30} />,
              title: 'Tag',
              text: 'Die Uhr läuft, Züge marschieren.',
            },
            {
              art: <TentIcon color={YOU} size={36} />,
              title: 'Nachtruhe',
              text: 'Die Karte wird dunkel, marschierende Züge schlafen im Zelt.',
            },
          ]}
        />
        <P>Jeder Spieltag dauert {GAMEDAY_HOURS} Stunden. Zu Beginn passiert Folgendes:</P>
        <Steps
          items={[
            <>
              <b>Einkommen</b>: +{DAILY_BASE_INCOME} von jeder Ressource, +{DAILY_ACTIVITY_INCOME}{' '}
              statt +{DAILY_BASE_INCOME} von deiner Basisaktivität, dazu das Einkommen deiner
              Stützpunkte (je nach Stufe). Alles landet direkt in der Basis. Danach ist der{' '}
              <b>Sold</b> für deine Truppen fällig.
            </>,
            <>
              Die <b>Karawane</b> vom Vorabend kommt an: Was um 18 Uhr aus deinen Stützpunkten
              losgefahren ist, liegt jetzt in der Basis.
            </>,
            'Die Basisaktivität, die du am Vortag gewählt hast, gilt ab jetzt.',
            `${CHESTS_PER_GAMEDAY} neue Truhen erscheinen auf der Karte.`,
          ]}
        />
        <Details
          items={[
            'Ein Spieltag beginnt mit dem ersten Moment Spielzeit eines Werktags, also um 10 Uhr.',
            'Auch Laden, Bollwerk und alle anderen Dauern pausieren nachts. Beispiel: Ein Zug, der um 17:30 Uhr noch 1 Stunde braucht, kommt am nächsten Werktag um 10:30 Uhr an.',
            'Nachts kommt nichts an. Kämpfe, Überfälle und Ankünfte gibt es nur während der Spielzeit – dann aber genau in der Reihenfolge ihrer Ankunftszeiten.',
            'Pausiert der Admin die Uhr, steht alles still wie in der Nacht.',
            'War der Server länger aus, holt die Uhr die verpasste Spielzeit nach. Einkommen gibt es dabei nur einmal, nicht für jeden verpassten Tag.',
          ]}
        />
      </>
    ),
  },
  {
    id: 'resources',
    title: 'Ressourcen & Sammeln',
    icon: <ResourceIcon resource="wood" size={20} />,
    body: () => (
      <>
        <P>
          Es gibt drei Ressourcen: <Res resource="wood" />, <Res resource="stone" /> und{' '}
          <Res resource="gold" />. Damit kaufst du Truppen und Siegpunkte.
        </P>
        <Remember>
          Ausgeben kannst du nur, was <b>in deiner Basis</b> (deiner Heimatburg) liegt.
        </Remember>
        <H>Basisaktivität</H>
        <P>
          Du wählst jederzeit, worauf sich deine Burg konzentriert: Holz, Stein oder Gold. Ab dem
          nächsten Spieltag bekommst du davon täglich {DAILY_ACTIVITY_INCOME} statt{' '}
          {DAILY_BASE_INCOME}. Wählst du nichts Neues, bleibt es bei der alten Wahl.
        </P>
        <H icon={<DepositIcon kind="stone" size={30} />}>Sammeln</H>
        <Steps
          items={[
            'Klicke auf ein Vorkommen und schicke Truppen hin.',
            <>
              Dort laden sie {formatGameDuration(GATHER_DURATION_MS)} lang. Je 100 Truppen bringen{' '}
              {GATHER_YIELD_PER_100_TROOPS} Einheiten mit.
            </>,
            <>
              Dann ziehen sie zurück zu der Burg, aus der sie kamen. Beladen gehen sie nur mit{' '}
              <b>{formatPercent(LOADED_SPEED)} Tempo</b> und können unterwegs überfallen werden.
            </>,
          ]}
        />
        <Legend
          items={[
            {
              art: <GatherBadgeIcon color={YOU} size={26} />,
              title: 'Wer lädt hier?',
              text: 'Jeder Zug am Vorkommen zeigt sich als Wappenschild mit seiner Truppenzahl.',
            },
            {
              art: <CargoRoundel resources={['stone']} />,
              title: 'Auf dem Heimweg',
              text: 'Das Abzeichen am Zug zeigt die Ladung. Die genaue Menge steht in der Auswahl.',
            },
          ]}
        />
        <H>Wo die Vorkommen liegen</H>
        <P>Die Vorkommen sind für alle gleich fair verteilt:</P>
        <List
          items={[
            `Von jeder Burg aus liegen Stein, Händler und eines von Holz und Gold näher als ${SPOT_FAR_HOURS} Stunden. Das andere liegt ${SPOT_FAR_HOURS} bis ${SPOT_MAX_HOURS} Stunden entfernt.`,
            `Kein Vorkommen liegt näher als ${SPOT_NEAR_HOURS} Stunde an einer Burg.`,
            `Der Weg zu allen vier zusammen ist für alle etwa gleich lang (Ziel: höchstens ${formatGameDuration(SPOT_BALANCE_TOLERANCE_HOURS * HOUR_MS)} Unterschied).`,
            `Vorkommen liegen mindestens ${SPOT_GAP_HOURS} Stunde auseinander, gleiche Sorten mindestens ${SPOT_SAME_GAP_HOURS} Stunden. Nirgends ist man weiter als ${formatGameDuration(SPOT_HOLE_HOURS * HOUR_MS)} vom nächsten Vorkommen, Stützpunkt oder einer Burg entfernt.`,
          ]}
        />
        <Details
          items={[
            'Das Einkommen landet immer in der Basis – auch während deine Burg gefallen ist.',
            `Ohne gewählte Basisaktivität gibt es nur +${DAILY_BASE_INCOME} von jeder Ressource. Wählst du mehrmals am Tag, zählt die letzte Wahl.`,
            `Die Ausbeute wird abgerundet: Unter 100 Truppen gibt es entsprechend weniger, unter ${Math.ceil(100 / GATHER_YIELD_PER_100_TROOPS)} Truppen gar nichts.`,
            'Vorkommen werden nie leer. Beliebig viele Züge – auch von verschiedenen Spielern – können gleichzeitig am selben Vorkommen laden. Dort kämpft niemand.',
            'Ladende Züge können nicht angegriffen werden. Erst auf dem Heimweg mit Ladung sind sie angreifbar.',
            'Rufst du einen ladenden Zug zurück oder leitest ihn um, bricht er das Laden ab und hat nichts dabei.',
            'Die Ladung geht an die Burg, aus der der Zug losgezogen ist. Ist dieser Stützpunkt inzwischen verloren, geht sie an die Basis.',
            'Die faire Verteilung der Vorkommen ist ab deiner Heimatburg gemessen, nicht ab Stützpunkten.',
          ]}
        />
      </>
    ),
  },
  {
    id: 'trader',
    title: 'Der Händler',
    icon: <SpotIcon kind="trader" size={20} />,
    body: () => (
      <>
        <P>
          Der Händler tauscht <b>Stein 1:1 gegen Gold und Holz</b>. Wie viel davon Gold und wie viel
          Holz wird, bestimmst du selbst: Aus x Stein werden y Gold und z Holz, mit x = y + z.
        </P>
        <Legend
          items={[
            {
              art: <DepositIcon kind="trader" size={46} />,
              title: 'Beispiel',
              text: (
                <>
                  10 <Res resource="stone">Stein</Res> → 6 <Res resource="gold">Gold</Res> + 4{' '}
                  <Res resource="wood">Holz</Res>
                </>
              ),
            },
          ]}
        />
        <Steps
          items={[
            'Klicke auf den Händler. In der Mitte öffnet sich das Handelsmenü.',
            'Wähle links, wie viel Stein du tauschst und wie viel davon Gold und Holz wird.',
            'Wähle rechts, aus welcher Burg die Truppen den Stein tragen und wie viele mitgehen.',
            'Mit „Handeln“ ziehen sie los. Der Tausch passiert sofort bei der Ankunft, ohne Wartezeit. Dann tragen sie Gold und Holz zurück.',
          ]}
        />
        <Remember>
          Hin und zurück sind deine Träger beladen: nur {formatPercent(LOADED_SPEED)} Tempo, und sie
          können überfallen werden.
        </Remember>
        <Details
          items={[
            'Zum Händler geht nur ein Zug, der Stein mitnimmt. Stein ist die einzige Ladung, die du aus einer Burg mitschicken kannst.',
            'Ein Zug auf dem Weg zum Händler lässt sich nicht umleiten, nur zurückrufen. Dann bringt er den Stein zurück.',
            'Wird er auf dem Hinweg ausgeraubt, kehrt er sofort leer und wieder normal schnell heim.',
            'Gold und Holz gehen an die Burg, aus der der Zug losgezogen ist. Unterwegs kannst du sie wie jede Ladung zu einem anderen eigenen Lager umleiten.',
          ]}
        />
      </>
    ),
  },
  {
    id: 'bases',
    title: 'Basis, Stützpunkte & Karawane',
    icon: <OutpostIcon color={YOU} size={20} />,
    body: () => (
      <>
        <P>
          Deine <b>Basis</b> ist deine Heimatburg. Nur hier kaufst du Truppen und Siegpunkte, und
          nur was hier liegt, kannst du ausgeben. Unterwegs kann man Beute überfallen – ist sie in
          der Basis angekommen, nicht mehr.
        </P>
        <H icon={<OutpostIcon color={null} size={30} />}>Ruinen werden Stützpunkte</H>
        <P>
          Zwischen den Burgen liegen <b>Ruinen</b>. Schickst du Truppen in eine Ruine, baust du sie
          wieder auf. Sie wird zu deinem <b>Stützpunkt</b>, einem Lager weiter draußen:
        </P>
        <List
          items={[
            'Truppen können dort stehen und von dort losziehen.',
            'Was Sammler dorthin bringen, lagert dort.',
            <>
              Jeder Stützpunkt bringt dir zu Beginn jedes Spieltags Einkommen direkt in die Basis:
              je Stufe 1 Holz, {OUTPOST_STONE_PER_LEVEL} Stein und 1 Gold.
            </>,
            <>
              Jede Stufe versorgt außerdem {OUTPOST_UPKEEP_RELIEF_PER_LEVEL} deiner Truppen – für
              sie zahlst du keinen Sold.
            </>,
          ]}
        />
        <P>
          Ein Stützpunkt <b>wächst</b>, solange du ihn hältst: Er beginnt auf Stufe 1 und steigt
          alle {OUTPOST_LEVEL_GAMEDAYS} Spieltage um eine Stufe, bis Stufe {OUTPOST_MAX_LEVEL}. Auf
          Stufe {OUTPOST_MAX_LEVEL} bringt er {OUTPOST_MAX_LEVEL} Holz,{' '}
          {OUTPOST_MAX_LEVEL * OUTPOST_STONE_PER_LEVEL} Stein und {OUTPOST_MAX_LEVEL} Gold am Tag
          und versorgt {OUTPOST_MAX_LEVEL * OUTPOST_UPKEEP_RELIEF_PER_LEVEL} Truppen. Wer ihn
          erobert, übernimmt ihn <b>eine Stufe niedriger</b>. Fällt er zur Ruine zurück, beginnt er
          wieder bei Stufe 1.
        </P>
        <H icon={<CaravanIcon color={YOU} size={34} />}>Die Karawane</H>
        <P>
          Was in einem Stützpunkt liegt, kannst du nicht ausgeben. Von Hand lässt es sich auch nicht
          zwischen deinen Burgen verschieben. Dafür gibt es die Karawane:
        </P>
        <Steps
          items={[
            'Um 18 Uhr fährt aus jedem Stützpunkt ein Wagen mit dem ganzen Lager los.',
            'Über Nacht rollen die Wagen zu deiner Basis. Klicke einen an, um seine Ladung zu sehen.',
            'Am nächsten Morgen liegt alles in der Basis und lässt sich ausgeben.',
          ]}
        />
        <Remember>
          Was ein Lager erreicht hat, bleibt dort: in der Basis, bis du es ausgibst, im Stützpunkt
          bis zur Karawane um 18 Uhr.
        </Remember>
        <List
          items={[
            'Truppen kannst du jederzeit aus einem Stützpunkt abziehen („Heimholen“). Die Ressourcen bleiben dann im Stützpunkt.',
            'Fällt ein Stützpunkt, gehört er samt Lager dem Eroberer. Die Überlebenden fliehen heim. Deine Züge, die gerade dorthin unterwegs sind, kehren sofort mit ihrer Ladung zur Burg um.',
            'Züge kehren zu der Burg zurück, aus der sie kamen. Ist diese verloren, gehen sie zur Basis.',
          ]}
        />
        <Details
          items={[
            'Eine Ruine hat keine Verteidiger: Schon 1 Truppe nimmt sie ein, ganz ohne Verluste. Liegt noch ein Lager darin, gehört es dir.',
            'Dasselbe gilt für einen eigenen Stützpunkt, aus dem du alle Truppen abgezogen hast: Leer kann ihn jeder mit 1 Truppe nehmen.',
            'Wer einen Stützpunkt erobert, bleibt mit allen überlebenden Truppen als Besatzung dort. Der Zug kehrt nicht heim.',
            'Das Bollwerk schützt nur die Basis, nie einen Stützpunkt.',
            'Truppen kaufen und Ressourcen ausgeben geht nur in der Basis. Ein Stützpunkt ist Lager und Startpunkt, sonst nichts.',
            'Die Karawane braucht keine Truppen und kann nicht überfallen oder geplündert werden: Nachts ruht die Spieluhr. Was vor 18 Uhr mit einem Stützpunkt erobert wird, gehört aber dem Eroberer.',
            'Die Karawanen sind für alle sichtbar, samt Ladung, so wie das Lager eines Stützpunkts. Klicke einen fremden Wagen an, um zu sehen, was er heimbringt.',
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
    icon: <SoldiersIcon color={YOU} size={22} />,
    body: () => (
      <>
        <P>
          Es gibt nur eine Sorte Truppen. {TROOP_BATCH_SIZE} Truppen kosten{' '}
          <Cost resources={TROOP_BATCH_COST} />. Die Ausbildung dauert eine Spielstunde, danach
          stehen sie in deiner Burg. Bis dahin verteidigen sie nicht und können nicht losziehen. Auf
          dem Namensschild deiner Burg stehen sie in Klammern hinter den Verteidigern, und ein Klick
          auf die Burg zeigt, wann jede Ausbildung fertig ist.
        </P>
        <P>
          Truppen wollen <b>Sold</b>: Zu jedem Spieltagsbeginn zahlst du Unterhalt in Stein aus
          deiner Burg, und der wächst schneller als deine Armee – 100 Truppen kosten 1 Stein am Tag,
          200 schon 4, 300 sogar 9. Fehlt Stein, desertieren je fehlendem Stein{' '}
          {UPKEEP_DESERTERS_PER_UNIT} Truppen aus deiner Burg. Sind dort zu wenige, bleibt der Rest
          als <b>Schulden</b> stehen und wird am nächsten Spieltag zusätzlich fällig. Solange du
          Schulden hast, kannst du weder Truppen noch Siegpunkte kaufen – der nächste Kauf zahlt sie
          zuerst ab.
        </P>
        <H icon={<SoldiersIcon color={YOU} size={30} />}>Losschicken</H>
        <Steps
          items={[
            'Klicke ein Ziel auf der Karte an.',
            'Wähle, aus welcher Burg die Truppen losziehen, und wie viele.',
            'Schicke sie los. Du siehst vorher, wann sie ankommen.',
          ]}
        />
        <P>
          Züge laufen nur über Land. Einmal quer über die Karte dauert etwa {CROSS_MAP_HOURS}{' '}
          Spielstunden.
        </P>
        <Remember>
          Du kannst höchstens {MAX_ARMIES} Züge gleichzeitig unterwegs haben – sammelnde und
          wartende mitgezählt. Erst wenn einer ankommt, darf ein neuer los.
        </Remember>
        <P>
          Ist ein Angriff auf eine deiner Burgen oder Stützpunkte nur noch{' '}
          {formatGameDuration(ASSAULT_LOCK_MS)} oder weniger entfernt (oder wartet er schon vor dem
          Tor), kann dort <b>niemand mehr abziehen</b>. Die Besatzung muss sich dem Kampf stellen.
        </P>
        <H>Unterwegs</H>
        <List
          items={[
            <>
              <b>Zurückrufen:</b> geht jederzeit, solange der Zug nicht schon heimkehrt.
            </>,
            <>
              <b>Umleiten:</b> Ein Zug ohne Ladung (auch auf dem Heimweg) kann ein neues Ziel
              bekommen. Wähle das neue Ziel auf der Karte; unter „Zug im Feld umleiten“ stehen deine
              Züge. Ein beladener Zug (Sammler, Beute, Truhe) kann jederzeit zu einem anderen
              eigenen Lager: Wähle ihn an, dann „Abliefern in“.
            </>,
            <>
              <b>Heimweg:</b> Nebel, Tarnung und Seeweg gelten auch auf dem Heimweg – bis du den Zug
              umleitest. Mit Ressourcen geht es nur mit {formatPercent(LOADED_SPEED)} Tempo heim.
            </>,
          ]}
        />
        <Details
          items={[
            'Zurückgerufen wird von der aktuellen Position aus, zur Burg, aus der der Zug kam.',
            'Wer schon heimkehrt, kann nicht zurückgerufen werden – ohne Ladung aber umgeleitet.',
            'Mit Ladung oder Truhe geht Umleiten nur zu einer eigenen Burg (Basis oder Stützpunkt). Umleiten beendet Nebel, Tarnung und Seeweg; Eilmarsch bleibt.',
            'Truppen in Zügen und Stützpunkten verteidigen die Basis nicht. Die Basis verteidigen nur die Truppen, die gerade daheim stehen.',
            'Die Truppenzahl eines Zuges ändert sich nur durch Kämpfe. Unterwegs kann niemand dazustoßen.',
            'Truhenträger ohne Ladung marschieren normal schnell. Nur Ressourcen bremsen.',
            'Die Abzugssperre zählt nur Angriffe, die du sehen kannst: Ein getarnter Angriff sperrt nichts. Auch Duo-Gruppen auf dem Weg zum Treffpunkt zählen erst, wenn sie vereint gegen dich ziehen.',
            'Die Sperre gilt für jeden Abzug aus dieser Burg: Angriffe, Sammelzüge, Überfälle, Duo-Truppen. Züge, die schon unterwegs sind, kannst du weiter umleiten oder heimkehren lassen.',
          ]}
        />
      </>
    ),
  },
  {
    id: 'combat',
    title: 'Kampf',
    icon: <AlarmIcon size={20} />,
    body: () => (
      <>
        <P>
          Im Kampf zählt nur die Truppenzahl. Der Angreifer gewinnt nur, wenn er <b>mehr</b> Truppen
          hat als der Verteidiger – Gleichstand reicht nicht.
        </P>
        <div className="my-3 flex items-center justify-center gap-3 text-sm">
          <span className="flex flex-col items-center">
            <SoldiersIcon color={YOU} size={44} />
            <b>100</b>
          </span>
          <span className="text-lg italic">gegen</span>
          <span className="flex flex-col items-center">
            <CastleIcon color={FOE} size={44} />
            <b>60</b>
          </span>
          <span className="text-lg">→</span>
          <span className="italic">Angreifer siegt</span>
        </div>
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
        <Remember>Niemand verliert mehr Truppen, als die Gegenseite mitgebracht hat.</Remember>
        <H>Beute</H>
        <List
          items={[
            `Burg: ${formatPercent(CASTLE_PLUNDER_SHARE)} aller Ressourcen in der Basis und eine Truhe.`,
            'Stützpunkt oder Ruine: der Stützpunkt selbst samt ganzem Lager.',
            'Überfallener Zug: die ganze Ladung.',
          ]}
        />
        <P>Mit der Karte Bollwerk verteidigt deine Burg mit ×{FORTIFY_MULTIPLIER} Stärke.</P>
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
        <H icon={<CastleIcon color={YOU} size={30} />}>Wenn deine Burg fällt</H>
        <P>Verlierst du deine Basis, passiert sofort Folgendes:</P>
        <Steps
          items={[
            <>
              Alle deine Truppen werden <b>heimgerufen</b>: Jeder Zug kehrt zur Burg um.
            </>,
            <>
              Alle deine Stützpunkte werden <b>aufgegeben</b> und zu Ruinen. Ihre Besatzung trägt
              das Lager nach Hause. Ohne Besatzung bleibt das Lager in der Ruine.
            </>,
            <>
              Bis die letzten Truppen daheim sind, kannst du <b>nichts tun</b>: nichts kaufen,
              niemanden losschicken, keine Karte spielen.
            </>,
          ]}
        />
        <Details
          items={[
            'Verluste werden aufgerundet. Ein siegreicher Zug behält aber immer mindestens 1 Truppe.',
            'Ein verlorener Angriff kostet den ganzen Zug.',
            'Das Bollwerk zählt nur beim Vergleich der Stärke. Die Verluste rechnen mit den echten Truppenzahlen.',
            'Die Burg selbst wechselt nie den Besitzer. Der Sieger nimmt Beute und Truhe und zieht heim – mit Beute beladen langsamer und überfallbar.',
            'Die Beute wird je Ressource abgerundet: Wer nur 1 Holz daheim hat, verliert es nicht. Auch wer gar nichts hat, kann gestürmt werden – die Truhe gibt es trotzdem.',
            'Die Truhe entsteht neu. Ungeöffnete Truhen und Karten des Verlierers bleiben, wo sie sind.',
            'Kommen mehrere Angreifer an, wird nacheinander gekämpft, in der Reihenfolge ihrer Ankunft. Jeder Kampf trifft auf die Verteidigung, die der vorige übrig gelassen hat.',
            'Gekämpft wird, bis die Burg fällt. Ab dann drehen alle übrigen Angriffe auf sie sofort um.',
            'Eine gefallene Burg ist geschützt, bis ihr Besitzer wieder handeln kann: So lange kann niemand sie angreifen.',
            'Beim Fall drehen alle Züge um: Hinmärsche, Angriffe, Überfälle, Truhenbergungen und Transporte. Alle Züge – auch die, die schon heimkehren – verlieren ihre Ladung an Ressourcen. Truhen nehmen sie mit.',
            'Ladende Züge brechen ab und kommen ohne Ladung heim.',
            'Die Besatzung der aufgegebenen Stützpunkte zieht ohne Ladung heim. Das Lager bleibt in der Ruine.',
            'Während des Rückzugs sind alle deine Züge unantastbar: Niemand kann sie überfallen, auch Überfälle, die schon unterwegs sind, gehen ins Leere. Auch deine Basis kann in dieser Zeit niemand stürmen.',
            'Stehen gerade keine Truppen außerhalb, gibt es keine Sperre und damit auch keinen Schutz: Die Basis ist gleich wieder angreifbar. Die Stützpunkte sind trotzdem aufgegeben.',
            'Während der Sperre läuft das Einkommen weiter. Du kannst aber keine Truhe öffnen und die Basisaktivität nicht wechseln.',
            'Heimkehrende Truppen verstärken die Basis, sobald sie ankommen. Mit dem letzten Zug daheim ist die Basis wieder angreifbar.',
            'Die Sperre endet in dem Moment, in dem der letzte Zug daheim ankommt.',
          ]}
        />
      </>
    ),
  },
  {
    id: 'raids',
    title: 'Überfälle',
    icon: <CargoRoundel resources={['gold']} size={19} />,
    body: () => (
      <>
        <P>
          Ein Zug, der <b>Ressourcen</b> trägt, lässt sich abfangen und ausrauben – zum Beispiel auf
          dem Heimweg vom Vorkommen oder mit Beute. Du erkennst ihn am runden Abzeichen.
        </P>
        <Legend
          items={[
            {
              art: <CargoRoundel resources={['wood', 'gold']} />,
              title: 'Überfallbar',
              text: 'Trägt Ressourcen.',
            },
            {
              art: <SoldiersIcon color={FOE} size={40} />,
              title: 'Nicht überfallbar',
              text: 'Ohne Ladung kann man einen Zug nicht ausrauben.',
            },
          ]}
        />
        <Steps
          items={[
            'Klicke den beladenen Zug auf der Karte an.',
            'Schicke Truppen aus einer Burg los oder leite einen deiner Züge im Feld um.',
            'Das Spiel berechnet den Treffpunkt im Voraus. Ist der Zug vorher am Ziel, geht es nicht.',
          ]}
        />
        <P>
          Beladene Züge laufen nur mit {formatPercent(LOADED_SPEED)} Tempo und sind daher leichter
          einzuholen. Nach einem verlorenen Überfall ziehen sie ohne Ladung wieder normal schnell
          weiter.
        </P>
        <Remember>
          Eine Truhe lässt sich nie rauben. Trägt ihr Zug auch Ressourcen, kann man ihm aber die
          Ressourcen abnehmen. Ein Truhenträger behält immer mindestens eine Truppe – die Truhe
          kommt also sicher heim.
        </Remember>
        <Remember>
          Dieselbe Ladung lässt sich höchstens {MAX_CARGO_RAIDS}-mal rauben: einmal geraubt, einmal
          zurückgeraubt. Danach ist der Zug mit dieser Beute nicht mehr überfallbar.
        </Remember>
        <P>
          Ein Zug, der selbst Ressourcen trägt, kann niemanden überfallen. Er lässt sich nur zu
          einem eigenen Lager umleiten.
        </P>
        <Details
          items={[
            'Überfallbar ist jeder marschierende Zug mit Ressourcen: Heimkehrer vom Vorkommen, Sieger mit Beute, Züge zum und vom Händler. Nicht überfallbar: Züge ohne Ressourcen und ladende Züge.',
            'Ausnahme Rückzug: Ist die Burg eines Spielers gefallen, sind alle seine Züge unantastbar, bis alle daheim sind. Ein Überfall, der schon unterwegs ist, geht dann ins Leere.',
            'Ein ausgeraubter Zug läuft leer und wieder normal schnell zu seinem Ziel weiter.',
            'Gewinnt der Überfall, nimmt der Räuber die ganze Ladung und trägt sie selbst heim – beladen, also langsamer und selbst überfallbar.',
            'Der Überfallene zieht danach ohne Ladung weiter, wieder in normalem Tempo und mit seinen Verlusten.',
            'Scheitert der Überfall, fällt der ganze Räuberzug. Der Überfallene verliert nur ein Viertel.',
            'Wird ein Zug ganz aufgerieben, ist er weg. Ausnahme: Ein Truhenträger behält immer mindestens 1 Truppe.',
            'Der Räuber kommt genau zum geplanten Zeitpunkt am Treffpunkt an. Ist der Zug dann nicht mehr da (schon daheim, oder ein anderer hat ihn schon ausgeraubt und er ist schneller geworden), geht der Überfall ins Leere und der Räuber kehrt leer um.',
            'Wurde der Zug vorher schon von jemand anderem ausgeraubt, gibt es nichts mehr zu holen – ein leerer Zug wird nicht überfallen.',
            'Getarnte Züge sind vor Überfällen sicher: Wer seine Ladung mit Tarnung heimbringt, kann nicht abgefangen werden – solange der Zug nicht umgeleitet wird.',
            'Eilmarsch macht den Räuberzug schneller und erlaubt einen früheren Treffpunkt. Mit Nebel sieht das Opfer nicht, wie stark der Räuber ist.',
            'Eigene Züge kannst du nicht überfallen.',
          ]}
        />
      </>
    ),
  },
  {
    id: 'duo',
    title: 'Duo-Angriff',
    icon: <DuoIcon left={YOU} right={ALLY} size={22} />,
    body: () => (
      <>
        <P>
          Zu zweit gegen eine fremde <b>Burg</b> oder einen fremden <b>Stützpunkt</b>: Ihr legt eure
          Truppen zusammen und greift gemeinsam an.
        </P>
        <H icon={<DuoIcon left={YOU} right={ALLY} size={34} />}>So bietest du ein Duo an</H>
        <Steps
          items={[
            'Klicke das Ziel auf der Karte an und wähle „Duo-Angreifen“.',
            'Wähle einen Partner.',
            'Stelle deine Truppen aus deinen Burgen zusammen.',
            'Lege fest, wie viele Truppen der Partner beisteuern soll – höchstens so viele, wie er stationiert hat.',
            <>
              Sende das Angebot. Es landet im <b>Posteingang</b> deines Partners (unter dem
              Liveticker, am Handy oben im Ticker), mit Ziel, Anteilen und Dauer.
            </>,
          ]}
        />
        <P>
          Der Partner kann nur <b>annehmen oder ablehnen</b>, am Plan nichts ändern. Er wählt
          lediglich, aus welchen seiner Burgen seine Truppen kommen. Mit dem Annehmen geht es los.
        </P>
        <H>Treffpunkt und Angriff</H>
        <P>
          Alle Teilzüge laufen auf direktem Weg zum <b>Treffpunkt</b>: dem Ort, den sie gemeinsam am
          schnellsten erreichen, egal wo das Ziel liegt. Das kann ein Umweg sein. Bis dahin sieht
          niemand außer euch das Ziel. Am Treffpunkt vereinen sie sich zum Duo-Zug. Ab da ist es ein
          ganz normaler Angriff, für alle sichtbar.
        </P>
        <List
          items={[
            'Gekämpft wird nach den üblichen Regeln, mit allen Truppen des Duo-Zugs.',
            'Verluste und Beute teilt ihr nach den Truppen, die jeder gestellt hat.',
            'Die Truhe einer gestürmten Burg wird nach Truppenanteil zugelost.',
            'Ein eroberter Stützpunkt gehört dem, der mehr Truppen gestellt hat (bei Gleichstand 50:50 gelost). Er bleibt mit seinen Überlebenden als Besatzung dort und behält seinen Anteil am Lager. Der andere zieht mit seinem Anteil heim.',
            'Nach dem Kampf zieht jeder mit seinen Überlebenden einzeln zu seiner Basis zurück.',
          ]}
        />
        <Remember>
          Abbrechen geht nur gemeinsam: Einer schlägt den Abbruch im Posteingang vor, der andere
          stimmt zu. Dann ziehen alle heim.
        </Remember>
        <List
          items={[
            'Zurückrufen oder Umleiten geht für Duo-Züge nicht.',
            'Selbst wenn die Burg eines Teilnehmers fällt, läuft der Duo-Angriff weiter. Handeln kann er erst wieder, wenn auch seine Duo-Truppen daheim sind.',
          ]}
        />
        <Details
          items={[
            'Im Duo gibt es keine Marschkarten. Wer barfuß ist, läuft langsamer; der vereinte Zug geht im Tempo des Langsameren.',
            'Ein Angebot bleibt den Rest seines Spieltags und den ganzen nächsten offen, dann verfällt es. Bis zur Antwort kannst du es zurückziehen.',
            'Stehen beim Annehmen nicht mehr genug Truppen bereit, geht das Annehmen nicht.',
            'Ist das Ziel bei der Ankunft nicht mehr angreifbar (die Burg ist gefallen und geschützt, oder der Stützpunkt gehört inzwischen einem von euch), ziehen alle heim.',
            'Duo-Züge tragen keine Ressourcen und lassen sich daher nicht überfallen, solange sie nicht mit Beute heimziehen.',
          ]}
        />
      </>
    ),
  },
  {
    id: 'chests',
    title: 'Truhen',
    icon: <ChestIcon size={20} />,
    body: () => (
      <>
        <P>
          Jeden Spieltag erscheinen {CHESTS_PER_GAMEDAY} Truhen auf der Karte. In jeder liegt eine{' '}
          <b>Karte</b>. Zum Bergen brauchst du eine bestimmte Zahl Truppen ({CHEST_TROOPS_MIN}–
          {CHEST_TROOPS_MAX}); sie steht auf der Karte unter der Truhe.
        </P>
        <Legend
          items={[
            {
              art: <ChestIcon size={36} />,
              title: 'ab 50 Truppen',
              text: 'So zeigt die Karte, wie viele Truppen du mindestens schicken musst.',
            },
          ]}
        />
        <Steps
          items={[
            'Schicke genug Truppen zur Truhe. Wer zuerst mit genug Truppen ankommt, bekommt sie.',
            'Die Truppen bringen sie sofort heim. Unterwegs kann ihnen niemand die Truhe rauben.',
            'Daheim öffnest du die Truhe. Erst dann siehst du, welche Karte darin liegt.',
          ]}
        />
        <List
          items={[
            'Wer eine Burg stürmt, bekommt zusätzlich zur Beute eine Truhe.',
            'Zu wenige Truppen kehren mit leeren Händen um.',
            `Gleichzeitig liegen höchstens so viele Truhen auf der Karte, wie Spieler mitspielen – mindestens aber ${CHESTS_PER_GAMEDAY}.`,
          ]}
        />
        <Details
          items={[
            'Mit zu wenigen Truppen kannst du gar nicht erst zu einer Truhe aufbrechen oder umleiten.',
            'Kommen zwei Züge an, gewinnt, wer zuerst da ist. Der zweite findet nichts und kehrt leer um.',
            `Ist die Karte schon voll (so viele Truhen wie Spieler, mindestens ${CHESTS_PER_GAMEDAY}), erscheinen am neuen Spieltag entsprechend weniger.`,
            'Truhen erscheinen möglichst weit weg von Burgen, Stützpunkten, Vorkommen und anderen Truhen.',
            'Ein Truhenträger kehrt heim – zu der Burg, aus der er kam, oder zu einem anderen eigenen Lager, wenn du ihn umleitest. Auch über einen Stützpunkt landet die Truhe bei dir: Truhen gehören dem Spieler, nicht der Burg.',
            'Eine normal geborgene Truhe ist nie überfallbar, weil ihr Zug keine Ressourcen trägt. Nur eine Truhe aus einem Burgsturm reist zusammen mit Beute – dann kann man die Beute rauben, die Truhe nie.',
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
    icon: <CardArt card="fog" className="h-4 w-5 rounded-[2px] border border-ink/60" />,
    body: () => (
      <>
        <P>
          Karten gehören dir, nicht einer Burg. Klicke eine Karte in deiner Hand an, um sie dir
          anzusehen und sie zu <b>aktivieren</b>. Es kann immer nur eine Karte aktiv sein.
        </P>
        <div className="mb-3 flex flex-wrap justify-center gap-1.5">
          {CARD_TYPES.map((card) => (
            <span key={card} className="flex w-16 flex-col items-center text-center text-xs">
              <CardArt card={card} className="h-9 w-full rounded-[2px] border border-ink/60" />
              {CARDS[card].name}
            </span>
          ))}
        </div>
        <List
          items={[
            <>
              <b>Sofortkarten</b> wirken im Moment, in dem du sie aktivierst.
            </>,
            <>
              <b>Marschkarten</b> werden scharf geschaltet und gehen mit dem nächsten Zug mit, den
              du losschickst. Danach sind sie verbraucht.
            </>,
          ]}
        />
        <P>Was jede Karte genau kann, steht im Kartenkatalog (nächstes Kapitel).</P>
        <Details
          items={[
            'Eine scharf geschaltete Marschkarte bleibt in deiner Hand, bis ein Zug sie mitnimmt. Du kannst sie wieder entschärfen oder durch eine andere ersetzen.',
            'Beim Losschicken entscheidest du, ob die scharfe Karte mitgeht. Umleiten verbraucht keine Karte.',
            'Nebel verbirgt die Truppenzahl des Zuges und der Burg oder des Stützpunkts, aus dem er aufbrach – hin und zurück, auch im Liveticker. Leitest du den Zug um, ist der Nebel weg: Zug und Basis zeigen wieder offene Zahlen.',
            'Tarnung verbirgt Ziel, Route und Ankunftszeit auf Hin- und Rückweg. Leitest du den Zug um, endet die Tarnung.',
            'Tarnung bringt Ressourcen sicher heim: Ein getarnter Zug kann nicht überfallen werden – auf dem Hinweg nicht und auf dem Heimweg mit voller Ladung auch nicht. Schick deine Sammler also getarnt los, wenn die Ladung sicher ankommen soll. Zurückrufen behält die Tarnung, erst Umleiten macht den Zug angreifbar.',
            'Eilmarsch halbiert nur den Hinweg (auch nach Umleiten). Heim geht es normal schnell.',
            'Mehrere Bollwerke hintereinander verlängern die Wirkung jeweils um einen weiteren Spieltag. Die Dauer läuft in Spielzeit, pausiert also nachts.',
            'Seeweg führt Hin- und Rückweg schnurgerade, auch übers Wasser – der Zug wird dort zum Schiff. Zurückrufen behält den Seeweg, Umleiten beendet ihn; für Überfälle taugt er nicht. Einen Zug auf dem Wasser kann niemand abfangen.',
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
    icon: <CardArt card="sea" className="h-4 w-5 rounded-[2px] border border-ink/60" />,
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
    icon: <OnlineDot online />,
    body: () => (
      <>
        <P>
          Auf der Karte sehen alle alles: Burgen, Truppen, Lager und Züge. Nur Karten verbergen
          etwas – Nebel die Truppenzahl (des Zuges und seiner Basis), Tarnung das Ziel.
        </P>
        <H>Liveticker und Chronik</H>
        <P>
          Der Liveticker oben links meldet, was auf der Karte passiert: Aufbrüche, Kämpfe, geborgene
          Truhen, eroberte Stützpunkte, neue Spieltage. Was nur dich betrifft, steht in deiner
          Chronik in der Seitenleiste.
        </P>
        <H>Wer ist online?</H>
        <P>
          In der Rangliste zeigt ein <b>grüner Punkt</b> <OnlineDot online /> neben dem Namen, wer
          gerade online ist. Ein leerer Kreis <OnlineDot online={false} /> heißt offline.
        </P>
        <Remember>
          Ändern sich während des Spiels die Regeln, steht das unter <b>Neuerungen</b> (die
          Schriftrolle neben dem Handbuch). Neue Änderungen zeigt das Spiel dir einmal von selbst.
        </Remember>
        <Details
          items={[
            'Ladungen sind immer für alle sichtbar, auch unter Nebel oder Tarnung.',
            'Der Liveticker zeigt die letzten 60 Ereignisse, deine Chronik die letzten 30 Einträge.',
            'Der Liveticker schreibt mit, was alle sehen: Unter Nebel steht dort „?“ statt der Truppenzahl. Ein getarnter Zug zieht ohne Meldung los.',
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
                  <span className="w-8 shrink-0 text-right text-ink-soft tabular-nums">
                    {toRoman(i + 1)}.
                  </span>
                  <span className="grid w-6 shrink-0 translate-y-[3px] place-items-center">
                    {c.icon}
                  </span>
                  <span className="min-w-0 italic">{c.title}</span>
                  <span className="min-w-2 flex-1 translate-y-[-3px] border-b border-dotted border-ink/50" />
                  <span className="shrink-0 text-xs text-ink-soft tabular-nums">{i + 1}</span>
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
          <h2 className="mt-1 mb-3 flex items-center gap-2.5 border-b border-ink/40 pb-1 text-2xl italic">
            <span className="grid scale-150 place-items-center">{chapter.icon}</span>
            {chapter.title}
          </h2>
          <div
            key={chapter.id}
            className="min-h-0 flex-1 overflow-y-auto pr-2 text-[15px] [&>p:first-child]:first-letter:float-left [&>p:first-child]:first-letter:mr-1.5 [&>p:first-child]:first-letter:text-5xl [&>p:first-child]:first-letter:leading-[0.9] [&>p:first-child]:first-letter:text-seal"
          >
            {chapter.body({ victoryPointsToWin })}
            {index === CHAPTERS.length - 1 && (
              <p className="mt-6 text-center">
                <SourceLink className="text-[11px]" />
              </p>
            )}
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
            <span className="text-xs text-ink-soft tabular-nums">— {index + 1} —</span>
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

/** The open handbook, wherever it was opened from (book corner or the phone top bar). */
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

/** Bottom-left corner: the handbook as a book with its name plate. */
export function HandbookCorner() {
  const setHandbook = useGameStore((s) => s.setHandbook);
  return (
    <div className="pointer-events-auto flex items-end">
      <Button
        variant="plain"
        onClick={() => setHandbook(true)}
        className="mb-1 flex-col transition-transform hover:-translate-y-1"
      >
        <BookGlyph />
        <Badge variant="plate">Handbuch</Badge>
      </Button>
    </div>
  );
}
