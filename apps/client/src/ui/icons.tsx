import type { CardType, ResourceType } from '@vectoria/shared';
import type { ReactNode } from 'react';

// SVG twins of the Pixi map glyphs (src/game/glyphs.ts) for the HUD, on the same 24-unit grid.

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

const RESOURCE_GLYPHS: Record<ResourceType, { ring: string; art: ReactNode }> = {
  wood: {
    ring: '#7a4b22',
    art: (
      <g stroke={INK} strokeWidth={0.7}>
        <rect x={-7} y={0} width={14} height={4} rx={2} fill="#a0652e" />
        <rect x={-5} y={-4} width={10} height={4} rx={2} fill="#b8763a" />
      </g>
    ),
  },
  stone: {
    ring: '#6b6f78',
    art: (
      <g stroke={INK} strokeWidth={0.7}>
        <path d="M-7 5l2-7h6l2 7z" fill="#9aa0aa" />
        <path d="M0 5l2-5h5l1 5z" fill="#b9bec6" />
      </g>
    ),
  },
  gold: {
    ring: '#c99a12',
    art: (
      <g stroke="#7a5a08" strokeWidth={0.7}>
        <circle cx={-3} cy={2} r={3.6} fill="#f4c430" />
        <circle cx={3} cy={1} r={3} fill="#ffd95a" />
        <circle cx={0} cy={-3} r={2.6} fill="#f4c430" />
      </g>
    ),
  },
};

export function ResourceIcon({
  resource,
  size = 22,
  title,
}: {
  resource: ResourceType;
  size?: number;
  title?: string;
}) {
  const { ring, art } = RESOURCE_GLYPHS[resource];
  return (
    <Glyph size={size} title={title}>
      <circle r={10.5} fill="#f3e7c4" stroke={ring} strokeWidth={2} />
      {art}
    </Glyph>
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

/** Helmet: troops. */
export function TroopIcon({ size = 20 }: { size?: number }) {
  return (
    <Glyph size={size}>
      <path d="M-8 4a8 8 0 0 1 16 0z" fill="#9aa0aa" stroke={INK} strokeWidth={1} />
      <rect x={-9} y={4} width={18} height={3} fill="#7d838d" stroke={INK} strokeWidth={1} />
      <path d="M0-4v-5" stroke="#d4472f" strokeWidth={2.4} strokeLinecap="round" />
    </Glyph>
  );
}

export function CastleIcon({ size = 22, color }: { size?: number; color: string }) {
  return (
    <Glyph size={size}>
      <g transform="translate(0 4) scale(0.62)" stroke={INK} strokeWidth={1.4}>
        <rect x={-14} y={-2} width={28} height={13} fill="#e9dfc6" />
        <rect x={-18} y={-10} width={8} height={21} fill="#f3ead4" />
        <rect x={10} y={-10} width={8} height={21} fill="#f3ead4" />
        <path d="M-19-10L-14-19L-9-10Z" fill={color} />
        <path d="M9-10L14-19L19-10Z" fill={color} />
        <rect x={-6} y={-14} width={12} height={16} fill="#f3ead4" />
        <path d="M-7-14L0-25L7-14Z" fill={color} />
      </g>
    </Glyph>
  );
}

export function ChestIcon({ size = 22 }: { size?: number }) {
  return (
    <Glyph size={size}>
      <g stroke={INK}>
        <path d="M-9-2q9-8 18 0z" fill="#9a5b22" />
        <rect x={-9} y={-2} width={18} height={10} fill="#b8702c" />
      </g>
      <rect x={-9} y={1} width={18} height={2} fill="#f2c230" />
      <rect x={-2} y={0} width={4} height={5} fill="#f2c230" stroke={INK} strokeWidth={0.5} />
    </Glyph>
  );
}

export function BannerIcon({ size = 22, color }: { size?: number; color: string }) {
  return (
    <Glyph size={size}>
      <path d="M-8 11V-11" stroke={INK} strokeWidth={1.4} />
      <path d="M-8-11h16v12l-8 5l-8-5z" fill={color} stroke={INK} strokeWidth={1.2} />
    </Glyph>
  );
}

export function ShieldIcon({ size = 16, color }: { size?: number; color: string }) {
  return (
    <Glyph size={size}>
      <path d="M-8-9h16v7q0 8-8 12q-8-4-8-12z" fill={color} stroke={INK} strokeWidth={1.2} />
    </Glyph>
  );
}

const CARD_ART: Record<CardType, { color: string; art: ReactNode }> = {
  fog: {
    color: '#8fa3bf',
    art: (
      <path
        d="M-12 0q4-6 8 0q4-6 8 0q4-6 8 0M-10 7q4-6 8 0q4-6 8 0"
        fill="none"
        stroke="#fff"
        strokeWidth={2}
      />
    ),
  },
  stealth: {
    color: '#6b5a8e',
    art: (
      <g fill="none" stroke="#fff" strokeWidth={2}>
        <path d="M-11 2q11-11 22 0q-11 11-22 0z" />
        <circle cy={2} r={3} />
        <path d="M-10-8l20 20" />
      </g>
    ),
  },
  forcedMarch: {
    color: '#e08a3c',
    art: (
      <path
        d="M-12-3h14l-5-5M2-3l-5 5M-4 6h14l-5-5M10 6l-5 5"
        fill="none"
        stroke="#fff"
        strokeWidth={2}
      />
    ),
  },
  fortify: {
    color: '#5f9a55',
    art: (
      <path
        d="M-9-8h18v8q0 8-9 11q-9-3-9-11z"
        fill="#fff"
        fillOpacity={0.85}
        stroke={INK}
        strokeWidth={0.8}
      />
    ),
  },
};

export function CardArt({ card, className = '' }: { card: CardType; className?: string }) {
  const { color, art } = CARD_ART[card];
  return (
    <svg
      viewBox="-20 -12 40 24"
      className={`block border border-ink/70 ${className}`}
      style={{ background: color }}
      aria-hidden
    >
      {art}
    </svg>
  );
}
