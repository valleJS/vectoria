/**
 * The Vectoria mark ("Numeral V"): a Roman capital V turned into an arrowhead, its shaft a
 * signum with one phalera ring, fletched with laurel. Colours come from `--brand-*` in
 * index.css: ink and seal red by day, gold by night (`data-night`). Master files: `brand/`.
 */
const LEAVES = [0, 1, 2].map((i) => ({ y: -56 + i * 13, len: 28 - i * 4 }));

function Leaf({ y, len, angle }: { y: number; len: number; angle: number }) {
  const k = len * 0.34;
  return (
    <g transform={`translate(70 ${y}) rotate(${angle})`}>
      <path d={`M0 0L${k} -6.5L${len} 0Z`} fill="var(--brand-m1)" />
      <path d={`M0 0L${k} 6.5L${len} 0Z`} fill="var(--brand-m2)" />
    </g>
  );
}

export function BrandMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 212 134" className={className} aria-hidden="true">
      {/* Drawn upright (apex down at 64,130), turned so the apex points right. */}
      <g transform="translate(32 -34) translate(176 100) rotate(-90) translate(-64 -130)">
        <rect x="67" y="-58" width="6" height="24" fill="var(--brand-m3)" />
        <rect x="67" y="-18" width="6" height="100" fill="var(--brand-m3)" />
        <circle cx="70" cy="-26" r="8" fill="none" stroke="var(--brand-m3)" strokeWidth="4" />
        {LEAVES.map((l) => (
          <g key={l.y}>
            <Leaf {...l} angle={-142} />
            <Leaf {...l} angle={-38} />
          </g>
        ))}
        <path d="M10 0L38 0L72.6 83.4L106 0L116 0L64 130Z" fill="var(--brand-m1)" />
        <rect x="0" y="-11" width="48" height="5" fill="var(--brand-m1)" />
        <rect x="98" y="-11" width="26" height="4" fill="var(--brand-m1)" />
      </g>
    </svg>
  );
}
