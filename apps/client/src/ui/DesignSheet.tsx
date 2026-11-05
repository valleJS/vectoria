import { RESOURCE_NAMES, RESOURCES } from '@vectoria/shared';
import { useEffect, useState, type ReactNode } from 'react';
import {
  alarm,
  armyShip,
  boat,
  boulder,
  broadleaf,
  campfire,
  castle,
  CASTLE_STYLE_NAMES,
  chest,
  conifer,
  deposit,
  flame,
  FOLIAGE,
  gatherShield,
  grassTuft,
  outpost,
  resourceIcon,
  rocks,
  ruin,
  ship,
  smokePuff,
  soldiers,
  sparkle,
  tent,
  type Art,
} from '../art/svg';
import { artCanvas, type RasterOptions } from '../art/textures';
import * as T from '../theme/tokens';
import { ResourceIcon } from './icons';
import { Badge } from '@/components/ui/badge';
import { Button as UiButton } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Progress } from '@/components/ui/progress';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

// Design sheet (`/?design`): every token and every piece of art as the map shows it, on one page,
// so the drawing language can be reviewed and kept consistent. Not linked from the game.

const HERALDRY = T.HERALDRY;

/** Art as the map renders it (outline / sepia), as an <img>. */
function MapArt({
  art,
  options = {},
  height,
  title,
}: {
  art: Art;
  options?: RasterOptions;
  height: number;
  title?: string;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const key = `${art.svg}|${options.outline}|${options.sepia}`;
  useEffect(() => {
    let live = true;
    void artCanvas(art, options, 2).then(({ canvas }) => {
      if (live) setUrl(canvas.toDataURL());
    });
    return () => {
      live = false;
    };
    // `key` covers art and options.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  const pad = options.outline ? 5 : 0;
  const width = ((art.width + pad * 2) / (art.height + pad * 2)) * height;
  return url ? (
    <img src={url} width={width} height={height} alt={title ?? ''} title={title} />
  ) : (
    <div style={{ width, height }} />
  );
}

function Section({ title, note, children }: { title: string; note?: string; children: ReactNode }) {
  return (
    <section className="mb-10">
      <h2 className="mb-1 border-b border-ink/30 pb-1 text-xl italic">{title}</h2>
      {note && <p className="mb-3 max-w-3xl text-sm text-ink-soft">{note}</p>}
      {children}
    </section>
  );
}

function Tile({
  label,
  children,
  ground = T.GRASS,
}: {
  label: string;
  children: ReactNode;
  ground?: string;
}) {
  return (
    <figure className="flex flex-col items-center gap-1">
      <div
        className="flex min-h-24 min-w-24 items-end justify-center rounded-sm border border-ink/20 p-2"
        style={{ background: ground }}
      >
        {children}
      </div>
      <figcaption className="text-xs text-ink-soft">{label}</figcaption>
    </figure>
  );
}

function Swatch({ name, value, css }: { name: string; value: string; css?: string }) {
  // The theme variables are static, so reading them during render is fine.
  const live = css ? getComputedStyle(document.documentElement).getPropertyValue(css).trim() : null;
  const drift = css && live !== null && live.toLowerCase() !== value.toLowerCase();
  return (
    <div className="flex w-36 flex-col gap-1">
      <div className="h-12 rounded-sm border border-ink/30" style={{ background: value }} />
      <div className="text-xs leading-tight">
        <div className="font-bold">{name}</div>
        <div className="font-mono text-ink-soft">{value}</div>
        {css && <div className="font-mono text-[10px] text-ink-faint">{css}</div>}
        {drift && <div className="text-seal">CSS: {live} ≠ token</div>}
      </div>
    </div>
  );
}

const TOKEN_GROUPS: { title: string; tokens: [string, string, string?][] }[] = [
  {
    title: 'Tinte & Pergament',
    tokens: [
      ['ink', T.INK, '--color-ink'],
      ['ink-soft', T.INK_SOFT, '--color-ink-soft'],
      ['ink-faint', T.INK_FAINT, '--color-ink-faint'],
      ['parchment', T.PARCHMENT, '--color-parchment'],
      ['parchment-dark', T.PARCHMENT_DARK, '--color-parchment-dark'],
      ['parchment-deep', T.PARCHMENT_DEEP, '--color-parchment-deep'],
    ],
  },
  {
    title: 'Bedeutung',
    tokens: [
      ['seal (Alarm, Aktion)', T.SEAL, '--color-seal'],
      ['seal-light', T.SEAL_LIGHT, '--color-seal-light'],
      ['moss (online)', T.MOSS, '--color-moss'],
      ['fortify', T.FORTIFY, '--color-fortify'],
      ['gold', T.GOLD, '--color-gold'],
      ['gold-deep', T.GOLD_DEEP, '--color-gold-deep'],
      ['cargo (Truhe)', T.CARGO_GOLD],
    ],
  },
  {
    title: 'Materialien (hell · basis · schatten)',
    tokens: [
      ['Mauerwerk', T.MASONRY.light],
      ['', T.MASONRY.base],
      ['', T.MASONRY.shade],
      ['Holz', T.TIMBER.light],
      ['', T.TIMBER.base],
      ['', T.TIMBER.shade],
      ['Granit', T.GRANITE.light],
      ['', T.GRANITE.base],
      ['', T.GRANITE.shade],
      ['Gold', T.GOLD_LIGHT],
      ['', T.GOLD],
      ['', T.GOLD_DEEP],
    ],
  },
  {
    title: 'Gelände',
    tokens: [
      ['sea', T.SEA, '--color-sea'],
      ['sea-line', T.SEA_LINE],
      ['shallow', T.SHALLOW],
      ['coast', T.COAST],
      ['grass', T.GRASS],
      ['forest', T.FOREST],
      ['rock', T.ROCK],
    ],
  },
];

export function DesignSheet() {
  return (
    <div className="h-full overflow-y-auto bg-parchment px-8 py-6 text-ink">
      <header className="mb-8">
        <h1 className="text-3xl italic">Vectoria — Design-Sheet</h1>
        <p className="max-w-3xl text-sm text-ink-soft">
          Eine Bildsprache: Licht von oben links, flacher Bodenschatten rechts versetzt.
          Spielfiguren (Burgen, Vorkommen, Truhen, Truppen) in Farbe mit Tintenkontur und
          Pergament-Rand; Dekoration (Bäume, Felsen, Schiffe) mit Tonlinien und auf der Karte in
          Sepia. Farben nur aus <code>theme/tokens.ts</code>.
        </p>
      </header>

      <Section
        title="Farben"
        note="Werte aus theme/tokens.ts; rot markiert, wenn die CSS-Variable abweicht."
      >
        {TOKEN_GROUPS.map((group) => (
          <div key={group.title} className="mb-4">
            <h3 className="mb-2 text-sm tracking-wider text-ink-soft uppercase">{group.title}</h3>
            <div className="flex flex-wrap gap-3">
              {group.tokens.map(([name, value, css], i) => (
                <Swatch key={`${name}${i}`} name={name} value={value} css={css} />
              ))}
            </div>
          </div>
        ))}
        <h3 className="mb-2 text-sm tracking-wider text-ink-soft uppercase">Wappenfarben</h3>
        <div className="flex flex-wrap gap-3">
          {HERALDRY.map((c, i) => (
            <Swatch key={c} name={`Spieler ${i + 1}`} value={c} />
          ))}
          <Swatch name="neutral" value={T.NEUTRAL_COLOR} />
        </div>
      </Section>

      <Section
        title="Oberfläche (shadcn/ui)"
        note="Komponenten aus src/components/ui, auf Pergament-Tokens gemappt. HUD-Code nutzt sie über ui/Panel.tsx (Panel, Button) oder direkt."
      >
        <div className="flex flex-wrap items-start gap-6">
          <div className="flex flex-col gap-2">
            <div className="flex flex-wrap gap-2">
              <UiButton>Standard</UiButton>
              <UiButton variant="primary">Senden</UiButton>
              <UiButton variant="destructive">Abziehen</UiButton>
              <UiButton variant="selected">Aktiv</UiButton>
              <UiButton variant="outline">Umriss</UiButton>
              <UiButton variant="ghost">Geist</UiButton>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <UiButton size="sm">Klein</UiButton>
              <UiButton size="compact">Kompakt</UiButton>
              <UiButton size="lg">Groß</UiButton>
              <Badge>3</Badge>
              <Badge variant="secondary">12 Tr.</Badge>
              <Badge variant="outline">Neu</Badge>
              <Badge variant="gold">+5</Badge>
              <Badge variant="plate">Handbuch</Badge>
              <UiButton variant="link">Abmelden</UiButton>
            </div>
            <Input placeholder="Anzahl Truppen" className="w-48" />
            <Select defaultValue="home">
              <SelectTrigger className="w-48" aria-label="Basis">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="home">Basis (50 Truppen)</SelectItem>
                <SelectItem value="o1">Stützpunkt 1 (10 Truppen)</SelectItem>
              </SelectContent>
            </Select>
            <Slider defaultValue={[30]} max={50} className="w-48 py-1" aria-label="Truppen" />
            <Label>
              <Checkbox defaultChecked /> Aktive Karte mitschicken
            </Label>
            <ToggleGroup
              type="single"
              defaultValue="a"
              className="w-64 border border-ink/40 bg-muted"
            >
              <ToggleGroupItem value="a" className="h-10 text-xs">
                Ticker
              </ToggleGroupItem>
              <ToggleGroupItem value="b" className="h-10 text-xs">
                Züge <Badge className="absolute top-0.5 right-2 text-[10px]">2</Badge>
              </ToggleGroupItem>
              <ToggleGroupItem value="c" className="h-10 text-xs">
                Reich
              </ToggleGroupItem>
            </ToggleGroup>
            <Progress value={62} className="w-48" />
            <Separator className="my-1 w-48" />
          </div>
          <Card className="w-80">
            <CardHeader>
              <CardTitle>
                <ResourceIcon resource="gold" size={20} /> Gold-Vorkommen
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Tabs defaultValue="a">
                <TabsList>
                  <TabsTrigger value="a">Auswahl</TabsTrigger>
                  <TabsTrigger value="b">
                    Heerzüge <Badge>2</Badge>
                  </TabsTrigger>
                  <TabsTrigger value="c">Rang</TabsTrigger>
                </TabsList>
                <TabsContent value="a" className="py-2 text-sm">
                  Deine Truppen ziehen hin, laden und bringen Gold heim.
                </TabsContent>
                <TabsContent value="b" className="py-2 text-sm">
                  Zwei Züge unterwegs.
                </TabsContent>
                <TabsContent value="c" className="py-2 text-sm">
                  Rangliste.
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>
          <Dialog>
            <DialogTrigger asChild>
              <UiButton>Dialog öffnen</UiButton>
            </DialogTrigger>
            <DialogContent className="max-w-sm">
              <DialogHeader>
                <DialogTitle>Regeländerungen</DialogTitle>
                <DialogDescription>Beispiel-Dialog im Pergament-Stil.</DialogDescription>
              </DialogHeader>
              <p className="px-4 py-3">Inhalt.</p>
            </DialogContent>
          </Dialog>
        </div>
      </Section>

      <Section
        title="Burgen"
        note="Drei Bauformen × 13 Wappenfarben: bis 39 Mitspieler unterscheiden sich in Form oder Farbe. Farbe und Bauform folgen der Beitrittsreihenfolge und sind bei allen gleich."
      >
        {CASTLE_STYLE_NAMES.map((name, style) => (
          <div key={name} className="mb-4">
            <h3 className="mb-2 text-sm tracking-wider text-ink-soft uppercase">{name}</h3>
            <div className="flex flex-wrap gap-2">
              {HERALDRY.map((c) => (
                <Tile key={c} label={c}>
                  <MapArt art={castle(c, style)} options={{ outline: true }} height={84} />
                </Tile>
              ))}
            </div>
          </div>
        ))}
      </Section>

      <Section
        title="Stützpunkte"
        note="Besetzt: Wachturm mit Palisade in der Besitzerfarbe. Frei: Ruine."
      >
        <div className="flex flex-wrap gap-2">
          <Tile label="Ruine">
            <MapArt art={ruin()} options={{ outline: true }} height={70} />
          </Tile>
          {HERALDRY.map((c) => (
            <Tile key={c} label={c}>
              <MapArt art={outpost(c)} options={{ outline: true }} height={70} />
            </Tile>
          ))}
        </div>
      </Section>

      <Section title="Rohstoffe" note="Icons (HUD, Ladung) und Vorkommen auf der Karte.">
        <div className="mb-4 flex flex-wrap items-end gap-6">
          {RESOURCES.map((r) => (
            <div key={r} className="flex items-end gap-3">
              {[14, 18, 22, 32, 64].map((size) => (
                <ResourceIcon key={size} resource={r} size={size} />
              ))}
              <span className="text-xs text-ink-soft">{RESOURCE_NAMES[r]}</span>
            </div>
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          {RESOURCES.map((r) => (
            <Tile key={r} label={`${RESOURCE_NAMES[r]}-Vorkommen`}>
              <MapArt art={deposit(r)} options={{ outline: true }} height={78} />
            </Tile>
          ))}
          {RESOURCES.map((r) => (
            <Tile key={`i${r}`} label={`Icon ${RESOURCE_NAMES[r]}`}>
              <img
                src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(resourceIcon(r))}`}
                width={64}
                height={64}
                alt=""
              />
            </Tile>
          ))}
        </div>
      </Section>

      <Section title="Truppen & Schätze">
        <div className="flex flex-wrap gap-2">
          {HERALDRY.slice(0, 5).map((c) => (
            <Tile key={c} label="Zug">
              <MapArt art={soldiers(c)} options={{ outline: true }} height={60} />
            </Tile>
          ))}
          {HERALDRY.slice(0, 5).map((c) => (
            <Tile key={`f${c}`} label="Sammelnd">
              {/* The Pixi count sits on the shield the same way (GameRenderer `drawFigure`). */}
              <span className="relative inline-grid place-items-center">
                <MapArt art={gatherShield(c)} options={{ outline: true }} height={40} />
                <span
                  className="absolute text-[13px] font-bold text-parchment"
                  style={{
                    fontFamily: '"Times New Roman", Times, serif',
                    WebkitTextStroke: '2px #3b2a18',
                    paintOrder: 'stroke',
                  }}
                >
                  30
                </span>
              </span>
            </Tile>
          ))}
          {HERALDRY.slice(0, 5).map((c) => (
            <Tile key={`s${c}`} label="Seeweg" ground={T.SEA}>
              <MapArt art={armyShip(c)} options={{ outline: true }} height={60} />
            </Tile>
          ))}
          {HERALDRY.slice(0, 5).map((c) => (
            <Tile key={`t${c}`} label="Nachtlager" ground="#3d4568">
              <MapArt art={tent(c)} options={{ outline: true }} height={52} />
            </Tile>
          ))}
          <Tile label="Lagerfeuer" ground="#3d4568">
            <span className="relative inline-block">
              <MapArt art={campfire()} options={{ outline: true }} height={26} />
              <span className="absolute -top-5 left-1/2 -translate-x-1/2">
                <MapArt art={flame()} height={26} />
              </span>
            </span>
          </Tile>
          <Tile label="Truhe">
            <MapArt art={chest()} options={{ outline: true }} height={60} />
          </Tile>
          <Tile label="Glanz">
            <MapArt art={sparkle()} height={24} />
          </Tile>
          <Tile label="Angriff">
            <MapArt art={alarm()} options={{ outline: true }} height={44} />
          </Tile>
          {[0, 1.3, 2.6].map((seed) => (
            <Tile key={seed} label="Rauch">
              <MapArt art={smokePuff(seed)} height={48} />
            </Tile>
          ))}
          <Tile label="Flamme">
            <MapArt art={flame()} height={40} />
          </Tile>
        </div>
      </Section>

      <Section title="Landschaft" note="Oben: Quelle in Farbe. Unten: wie auf der Karte (Sepia).">
        {[false, true].map((sepiaOn) => (
          <div key={String(sepiaOn)} className="mb-3 flex flex-wrap gap-2">
            {FOLIAGE.map((f, i) => (
              <Tile key={i} label="Laubbaum" ground={T.FOREST}>
                <MapArt art={broadleaf(f, i * 0.7)} options={{ sepia: sepiaOn }} height={64} />
              </Tile>
            ))}
            {[false, true].map((dark) => (
              <Tile key={String(dark)} label="Nadelbaum" ground={T.FOREST}>
                <MapArt art={conifer(dark)} options={{ sepia: sepiaOn }} height={64} />
              </Tile>
            ))}
            {[0, 1, 2, 3].map((v) => (
              <Tile key={v} label={`Felsen ${v + 1}`} ground={T.ROCK}>
                <MapArt art={rocks(v)} options={{ sepia: sepiaOn }} height={64} />
              </Tile>
            ))}
            {[0, 1, 2].map((v) => (
              <Tile key={`b${v}`} label={`Brocken ${v + 1}`} ground={T.ROCK}>
                <MapArt art={boulder(v)} options={{ sepia: sepiaOn }} height={40} />
              </Tile>
            ))}
            <Tile label="Gras">
              <MapArt art={grassTuft()} options={{ sepia: sepiaOn }} height={36} />
            </Tile>
            <Tile label="Schiff" ground={T.SEA}>
              <MapArt art={ship()} options={{ sepia: sepiaOn }} height={56} />
            </Tile>
            <Tile label="Boot (Seen)" ground={T.SEA}>
              <MapArt art={boat()} options={{ sepia: sepiaOn }} height={40} />
            </Tile>
          </div>
        ))}
      </Section>
    </div>
  );
}
