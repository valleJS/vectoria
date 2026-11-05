import { RESOURCES, type CardType, type ResourceType, type SpotKind } from '@vectoria/shared';
import {
  alarm,
  caravanWagon,
  castle,
  chest,
  dataUrl,
  deposit,
  outpost,
  resourceIcon,
  ruin,
  soldiers,
} from '../art/svg';
import type { ReactNode } from 'react';
import { cardColor } from '../game/format';

// HUD icons. Resources come from the shared art (src/art/svg.ts); the small glyphs here mirror
// the Pixi map glyphs (src/game/glyphs.ts) on the same 24-unit grid.

const INK = '#3b2a18';

function Glyph({ size, children, title }: { size: number; children: ReactNode; title?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="-12 -12 24 24"
      className="inline-block shrink-0"
      role={title ? 'img' : undefined}
      aria-hidden={title ? undefined : true}
    >
      {title && <title>{title}</title>}
      {children}
    </svg>
  );
}

const RESOURCE_URLS = Object.fromEntries(
  RESOURCES.map((r) => [r, dataUrl(resourceIcon(r))]),
) as Record<ResourceType, string>;

const TRADER_URL = dataUrl(deposit('trader').svg);

/** A spot's icon: the resource, or the trader's market stall. */
export function SpotIcon({ kind, size = 22 }: { kind: SpotKind; size?: number }) {
  if (kind !== 'trader') return <ResourceIcon resource={kind} size={size} />;
  return (
    <img
      src={TRADER_URL}
      width={size}
      height={size}
      alt=""
      className="inline-block shrink-0 object-contain"
      draggable={false}
    />
  );
}

/** Resource art from the shared SVG source (same drawing as the map medallions). */
export function ResourceIcon({
  resource,
  size = 22,
  title,
}: {
  resource: ResourceType;
  size?: number;
  title?: string;
}) {
  return (
    <img
      src={RESOURCE_URLS[resource]}
      width={size}
      height={size}
      alt={title ?? ''}
      title={title}
      className="inline-block shrink-0"
      draggable={false}
    />
  );
}

export function StarIcon({ size = 20 }: { size?: number }) {
  return (
    <Glyph size={size}>
      <path
        d="M0-10l3 6l6.5 1l-4.7 4.5l1.1 6.5l-5.9-3.1l-5.9 3.1l1.1-6.5l-4.7-4.5l6.5-1z"
        fill="#f2c230"
        stroke={INK}
        strokeWidth={0.9}
      />
    </Glyph>
  );
}

export function SunIcon({ size = 18, lit = true }: { size?: number; lit?: boolean }) {
  return (
    <Glyph size={size}>
      {lit && (
        <g stroke={INK} strokeWidth={1.2} strokeLinecap="round">
          {[0, 45, 90, 135, 180, 225, 270, 315].map((a) => (
            <line key={a} x1={0} y1={-8} x2={0} y2={-10.5} transform={`rotate(${a})`} />
          ))}
        </g>
      )}
      <circle r={6} fill={lit ? '#f2c230' : '#c9c1a8'} stroke={INK} strokeWidth={0.9} />
      {!lit && <path d="M2-5a6 6 0 1 0 3 8a5 5 0 0 1-3-8z" fill={INK} opacity={0.5} />}
    </Glyph>
  );
}

const artUrls = new Map<string, string>();

/** Map art from `art/svg.ts` as an <img>; data URLs are cached by `key`. */
function ArtIcon({ id, size, make }: { id: string; size: number; make: () => string }) {
  let url = artUrls.get(id);
  if (!url) artUrls.set(id, (url = dataUrl(make())));
  return (
    <img
      src={url}
      width={size}
      height={size}
      alt=""
      className="inline-block shrink-0 object-contain"
      draggable={false}
    />
  );
}

/** The map's castle art in the owner's colour and castle style (format.ts `playerHeraldry`). */
export function CastleIcon({
  size = 26,
  color,
  style = 0,
}: {
  size?: number;
  color: string;
  style?: number;
}) {
  return (
    <ArtIcon id={`castle${style}${color}`} size={size} make={() => castle(color, style).svg} />
  );
}

/** The map's outpost: a watchtower in the owner's colour, or a ruin when nobody holds it. */
export function OutpostIcon({ size = 24, color }: { size?: number; color: string | null }) {
  return (
    <ArtIcon
      id={`outpost${color}`}
      size={size}
      make={() => (color ? outpost(color) : ruin()).svg}
    />
  );
}

/** The map's soldier group (an army, or troops) in the owner's colour. */
export function SoldiersIcon({ size = 22, color }: { size?: number; color: string }) {
  return <ArtIcon id={`soldiers${color}`} size={size} make={() => soldiers(color).svg} />;
}

/** A wagon of the night caravan in the owner's colour. */
export function CaravanIcon({ size = 22, color }: { size?: number; color: string }) {
  return <ArtIcon id={`caravan${color}`} size={size} make={() => caravanWagon(color).svg} />;
}

/** The map's treasure chest. */
export function ChestIcon({ size = 22 }: { size?: number }) {
  return <ArtIcon id="chest" size={size} make={() => chest().svg} />;
}

/** The map's crossed-swords alarm badge: attacks. */
export function AlarmIcon({ size = 18 }: { size?: number }) {
  return <ArtIcon id="alarm" size={size} make={() => alarm().svg} />;
}

export function ShieldIcon({ size = 16, color }: { size?: number; color: string }) {
  return (
    <Glyph size={size}>
      <path d="M-8-9h16v7q0 8-8 12q-8-4-8-12z" fill={color} stroke={INK} strokeWidth={1.2} />
    </Glyph>
  );
}

const CARD_ART: Record<CardType, ReactNode> = {
  fog: (
    <path
      d="M-12 0q4-6 8 0q4-6 8 0q4-6 8 0M-10 7q4-6 8 0q4-6 8 0"
      fill="none"
      stroke="#fff"
      strokeWidth={2}
    />
  ),
  stealth: (
    <g fill="none" stroke="#fff" strokeWidth={2}>
      <path d="M-11 2q11-11 22 0q-11 11-22 0z" />
      <circle cy={2} r={3} />
      <path d="M-10-8l20 20" />
    </g>
  ),
  forcedMarch: (
    <path
      d="M-12-3h14l-5-5M2-3l-5 5M-4 6h14l-5-5M10 6l-5 5"
      fill="none"
      stroke="#fff"
      strokeWidth={2}
    />
  ),
  fortify: (
    <path
      d="M-9-8h18v8q0 8-9 11q-9-3-9-11z"
      fill="#fff"
      fillOpacity={0.85}
      stroke={INK}
      strokeWidth={0.8}
    />
  ),
  // Sail over waves.
  sea: (
    <g fill="none" stroke="#fff" strokeWidth={2} strokeLinejoin="round">
      <path d="M-1-11V3M-1-10q9 5 9 12H-1" fill="#fff" fillOpacity={0.85} />
      <path d="M-9 4h16l-3 4h-10z" />
      <path d="M-14 10q3-3 6 0q3-3 6 0q3-3 6 0q3-3 6 0q3-3 6 0" />
    </g>
  ),
  // Horn of plenty spilling round fruit.
  harvest: (
    <g stroke="#fff" strokeWidth={2} strokeLinejoin="round">
      <path d="M-12-6q4 14 20 12q-2-6 0-12q-10 4-20 0z" fill="none" />
      <circle cx={11} cy={-4} r={2.4} fill="#fff" />
      <circle cx={13} cy={3} r={2.4} fill="#fff" />
      <circle cx={8} cy={8} r={2.4} fill="#fff" />
    </g>
  ),
  // A boot, crossed out.
  stealShoes: (
    <g fill="none" stroke="#fff" strokeWidth={2} strokeLinejoin="round">
      <path d="M-6-10h7v10q7 1 9 5v3h-16z" fill="#fff" fillOpacity={0.85} />
      <path d="M-12-10l24 22" />
    </g>
  ),
  // Two towers with arrows swapping them.
  relocate: (
    <g fill="none" stroke="#fff" strokeWidth={2} strokeLinejoin="round">
      <path d="M-14 9v-11h2v2h2v-2h2v2h2v-2h2v11z" fill="#fff" fillOpacity={0.85} />
      <path d="M6 9v-8l3-3l3 3v8z" fill="#fff" fillOpacity={0.85} />
      <path d="M-9-5q8-9 17 0M5-5.5h3.2v-3.2M-6-5.5h-3.2v-3.2" />
    </g>
  ),
};

export function CardArt({ card, className = '' }: { card: CardType; className?: string }) {
  const art = CARD_ART[card];
  return (
    <svg
      viewBox="-20 -12 40 24"
      className={`block border border-ink/70 ${className}`}
      style={{ background: cardColor(card) }}
      aria-hidden
    >
      {art}
    </svg>
  );
}

/** Presence marker next to a player's name: green dot when online, faint ring when offline. */
export function OnlineDot({ online }: { online: boolean }) {
  const label = online ? 'online' : 'offline';
  return (
    <span
      className={`inline-block h-2 w-2 shrink-0 rounded-full ${online ? 'bg-[#3fa34d] shadow-[0_0_0_1px_rgba(0,0,0,0.25)]' : 'border border-ink/40'}`}
      title={label}
      aria-label={label}
      role="img"
    />
  );
}
