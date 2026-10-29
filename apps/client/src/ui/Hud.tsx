import { getTile, TILE_TYPE_NAMES } from '@vectoria/shared';
import type { ReactNode } from 'react';
import { useGameStore, type ConnectionStatus } from '../state/store';

const STATUS_STYLES: Record<ConnectionStatus, { label: string; dot: string }> = {
  idle: { label: 'Offline', dot: 'bg-slate-500' },
  connecting: { label: 'Connecting…', dot: 'bg-amber-400 animate-pulse' },
  open: { label: 'Connected', dot: 'bg-emerald-400' },
  closed: { label: 'Reconnecting…', dot: 'bg-rose-500 animate-pulse' },
};

function Panel({ className = '', children }: { className?: string; children: ReactNode }) {
  return (
    <div
      className={`pointer-events-auto rounded-lg border border-white/10 bg-slate-900/80 px-3 py-2 text-sm shadow-lg backdrop-blur ${className}`}
    >
      {children}
    </div>
  );
}

/**
 * HTML overlay above the canvas. The root ignores pointer events so map input passes through;
 * panels opt back in with `pointer-events-auto`.
 */
export function Hud() {
  const status = useGameStore((s) => s.status);
  const latencyMs = useGameStore((s) => s.latencyMs);
  const tick = useGameStore((s) => s.tick);
  const zoom = useGameStore((s) => s.zoom);
  const selectedTile = useGameStore((s) => s.selectedTile);
  const map = useGameStore((s) => s.map);

  const { label, dot } = STATUS_STYLES[status];
  const terrain = map && selectedTile ? getTile(map, selectedTile.x, selectedTile.y) : undefined;

  return (
    <div className="pointer-events-none absolute inset-0 flex flex-col justify-between p-4">
      <div className="flex items-start justify-between gap-4">
        <Panel>
          <div className="font-semibold tracking-wide">Vectoria</div>
          <div className="mt-1 flex items-center gap-2 text-slate-300">
            <span className={`h-2 w-2 rounded-full ${dot}`} />
            {label}
            {status === 'open' && latencyMs !== null && (
              <span className="text-slate-400">· {Math.round(latencyMs)} ms</span>
            )}
          </div>
        </Panel>
        <Panel className="tabular-nums text-slate-300">Tick {tick}</Panel>
      </div>

      <div className="flex items-end justify-between gap-4">
        <Panel className="min-w-40">
          {selectedTile ? (
            <>
              <div className="font-medium">
                Tile {selectedTile.x}, {selectedTile.y}
              </div>
              <div className="text-slate-400">
                {terrain === undefined ? 'Unknown' : TILE_TYPE_NAMES[terrain]}
              </div>
            </>
          ) : (
            <div className="text-slate-400">Click a tile to select it</div>
          )}
        </Panel>
        <Panel className="text-right text-slate-400">
          <div className="tabular-nums text-slate-300">{Math.round(zoom * 100)}%</div>
          <div className="hidden sm:block">Drag to pan · Scroll or pinch to zoom</div>
        </Panel>
      </div>
    </div>
  );
}
