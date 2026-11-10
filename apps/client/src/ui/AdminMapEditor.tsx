import {
  SPOT_NAMES,
  TileType,
  type AdminAction,
  type AdminPieceKind,
  type AdminWorld,
  type MapData,
  type SpotKind,
  type Vec2,
} from '@vectoria/shared';
import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { playerHeraldry, cssColor } from '../game/format';
import { api } from '../net/api';
import * as T from '../theme/tokens';
import { CastleIcon, ChestIcon, OutpostIcon, SpotIcon } from './icons';
import { Button, Panel } from './Panel';

/** Flat terrain colours for the editor's overview map. */
const TILE_COLORS: Record<TileType, string> = {
  [TileType.Grass]: T.GRASS,
  [TileType.Water]: T.SEA,
  [TileType.Forest]: T.FOREST,
  [TileType.Mountain]: T.MASONRY.shade,
};

/** A new piece from the palette, or one already on the map. */
type DragSource =
  | { mode: 'new'; kind: 'chest' | 'outpost' }
  | { mode: 'new'; kind: 'spot'; resource: SpotKind }
  | { mode: 'move'; kind: AdminPieceKind; id: string };

interface Drag {
  source: DragSource;
  /** Pointer in page coordinates. */
  x: number;
  y: number;
  startX: number;
  startY: number;
  /** Map tile under the pointer, or null off the map. */
  tile: Vec2 | null;
}

interface Selected {
  kind: AdminPieceKind;
  id: string;
}

/** Pointer travel (px) after which pressing a piece drags it instead of selecting it. */
const DRAG_THRESHOLD = 5;

const PALETTE: { source: DragSource; label: string }[] = [
  { source: { mode: 'new', kind: 'chest' }, label: 'Truhe' },
  { source: { mode: 'new', kind: 'outpost' }, label: 'Ruine' },
  { source: { mode: 'new', kind: 'spot', resource: 'wood' }, label: 'Holz' },
  { source: { mode: 'new', kind: 'spot', resource: 'stone' }, label: 'Stein' },
  { source: { mode: 'new', kind: 'spot', resource: 'gold' }, label: 'Gold' },
  { source: { mode: 'new', kind: 'spot', resource: 'trader' }, label: 'Händler' },
];

function SourceIcon({ source, size }: { source: DragSource; size: number }) {
  if (source.mode === 'new' && source.kind === 'spot') {
    return <SpotIcon kind={source.resource} size={size} />;
  }
  return source.kind === 'chest' ? (
    <ChestIcon size={size} />
  ) : (
    <OutpostIcon size={size} color={null} />
  );
}

const tileKey = (p: Vec2) => `${Math.floor(p.x)},${Math.floor(p.y)}`;

/**
 * Admin map editor: an overview of the map where chests, ruins and resource spots are dragged in
 * from the palette, dragged around to move them, or selected and removed. The server checks every
 * drop (free mainland tile); castles are shown for orientation only.
 */
export function AdminMapEditor({
  token,
  world,
  players,
  mapSize,
  run,
}: {
  token: string;
  world: AdminWorld;
  players: { id: string }[];
  mapSize: number | null;
  run: (action: AdminAction, confirmText?: string) => void;
}) {
  const [map, setMap] = useState<MapData | null>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const [selected, setSelected] = useState<Selected | null>(null);
  const [width, setWidth] = useState(0);
  const boardRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // The tiles only change with a new map (a reset, a new start).
  useEffect(() => {
    let active = true;
    api
      .adminMap(token)
      .then((m) => active && setMap(m))
      .catch(() => active && setMap(null));
    return () => {
      active = false;
    };
  }, [token, mapSize]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!map || !canvas || !ctx) return;
    canvas.width = map.width;
    canvas.height = map.height;
    for (let y = 0; y < map.height; y++) {
      for (let x = 0; x < map.width; x++) {
        ctx.fillStyle = TILE_COLORS[map.tiles[y * map.width + x]!];
        ctx.fillRect(x, y, 1, 1);
      }
    }
  }, [map]);

  useEffect(() => {
    const board = boardRef.current;
    if (!board) return;
    const observer = new ResizeObserver(([entry]) => setWidth(entry!.contentRect.width));
    observer.observe(board);
    return () => observer.disconnect();
  }, [map]);

  /** The tile under a page point, or null when it is off the map. */
  const tileAt = (x: number, y: number): Vec2 | null => {
    const rect = boardRef.current?.getBoundingClientRect();
    if (!map || !rect || rect.width === 0) return null;
    const tx = Math.floor(((x - rect.left) / rect.width) * map.width);
    const ty = Math.floor(((y - rect.top) / rect.height) * map.height);
    return tx >= 0 && ty >= 0 && tx < map.width && ty < map.height ? { x: tx, y: ty } : null;
  };

  const occupied = new Set(
    [
      ...world.castles.map((c) => c.position),
      ...world.spots.map((s) => s.position),
      ...world.outposts.map((o) => o.position),
      ...world.chests.map((c) => c.position),
    ].map(tileKey),
  );

  const moving = drag?.source.mode === 'move' ? drag.source : null;
  const dragging =
    drag !== null && Math.hypot(drag.x - drag.startX, drag.y - drag.startY) > DRAG_THRESHOLD;
  const hover = dragging ? drag.tile : null;
  /** Hint only; the server decides (it also wants mainland, off the outer ring). */
  const hoverOk =
    hover !== null &&
    map !== null &&
    map.tiles[hover.y * map.width + hover.x] !== TileType.Water &&
    !occupied.has(tileKey(hover));

  useEffect(() => {
    if (!drag) return;
    const onMove = (e: PointerEvent) => {
      const tile = tileAt(e.clientX, e.clientY);
      setDrag((d) => d && { ...d, x: e.clientX, y: e.clientY, tile });
    };
    const onUp = (e: PointerEvent) => {
      setDrag(null);
      const { source } = drag;
      const moved = Math.hypot(e.clientX - drag.startX, e.clientY - drag.startY) > DRAG_THRESHOLD;
      if (!moved) {
        if (source.mode === 'move') setSelected({ kind: source.kind, id: source.id });
        return;
      }
      const tile = tileAt(e.clientX, e.clientY);
      if (!tile) return;
      if (source.mode === 'move') {
        run({ action: 'move', kind: source.kind, id: source.id, tile });
        setSelected({ kind: source.kind, id: source.id });
      } else if (source.kind === 'spot') {
        run({ action: 'place', kind: 'spot', resource: source.resource, tile });
      } else {
        run({ action: 'place', kind: source.kind, tile });
      }
    };
    const onCancel = () => setDrag(null);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onCancel);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onCancel);
    };
    // Re-binding on every pointer move is fine; only `drag.source` matters to the handlers.
  });

  const startDrag = (source: DragSource) => (e: ReactPointerEvent) => {
    if (e.button !== 0) return;
    e.preventDefault();
    setDrag({
      source,
      x: e.clientX,
      y: e.clientY,
      startX: e.clientX,
      startY: e.clientY,
      tile: null,
    });
  };

  if (!map) {
    return (
      <Panel title="Karte bearbeiten">
        <p className="text-ink-soft">Karte wird geladen …</p>
      </Panel>
    );
  }

  const cell = width / map.width;
  const iconSize = Math.max(14, Math.round(cell * 1.8));
  const place = (p: Vec2) => ({
    left: `${(p.x / map.width) * 100}%`,
    top: `${(p.y / map.height) * 100}%`,
  });
  const pieceClass = (kind: AdminPieceKind, id: string) =>
    'absolute -translate-x-1/2 -translate-y-1/2 touch-none select-none ' +
    (moving?.kind === kind && moving.id === id && dragging ? 'opacity-30 ' : '') +
    (selected?.kind === kind && selected.id === id
      ? 'rounded-full outline-2 outline-offset-1 outline-seal '
      : '') +
    'cursor-grab';

  const selectedInfo = (() => {
    if (!selected) return null;
    if (selected.kind === 'chest') {
      const c = world.chests.find((x) => x.id === selected.id);
      return c && { text: `Truhe · ${c.troopsNeeded} Truppen nötig`, removable: true };
    }
    if (selected.kind === 'spot') {
      const s = world.spots.find((x) => x.id === selected.id);
      return s && { text: SPOT_NAMES[s.resource], removable: true };
    }
    const o = world.outposts.find((x) => x.id === selected.id);
    if (!o) return undefined;
    if (o.ownerId === null) return { text: 'Ruine (leer)', removable: true };
    return {
      text: `Stützpunkt · ${o.troops} Truppen — nur verschiebbar`,
      removable: false,
    };
  })();

  return (
    <Panel title="Karte bearbeiten">
      <p className="mb-2 text-xs text-ink-soft">
        Ziehe Truhen, Ruinen und Vorkommen aus der Leiste auf die Karte, oder ziehe sie auf der
        Karte an einen neuen Ort. Antippen wählt aus (zum Entfernen). Nur freie Landfelder; Züge,
        die dorthin unterwegs sind, laufen zum neuen Ort.
      </p>
      <div className="mb-2 flex flex-wrap gap-1.5">
        {PALETTE.map(({ source, label }) => (
          <button
            key={label}
            type="button"
            onPointerDown={startDrag(source)}
            className="flex h-10 cursor-grab touch-none select-none items-center gap-1.5 border border-ink/30 bg-parchment px-2 text-sm hover:bg-parchment-dark sm:h-8"
          >
            <SourceIcon source={source} size={20} />
            {label}
          </button>
        ))}
        <Button className="h-10 sm:h-8" onClick={() => run({ action: 'spawnChest' })}>
          Truhe zufällig
        </Button>
      </div>

      <div
        ref={boardRef}
        className="relative mx-auto w-full max-w-[min(100%,48rem)] touch-none border border-ink/40"
        style={{ aspectRatio: `${map.width} / ${map.height}` }}
        onPointerDown={(e) => {
          if (e.target === e.currentTarget || e.target === canvasRef.current) setSelected(null);
        }}
      >
        <canvas
          ref={canvasRef}
          className="absolute inset-0 h-full w-full"
          style={{ imageRendering: 'pixelated' }}
        />
        {hover && (
          <div
            className={`pointer-events-none absolute border-2 ${hoverOk ? 'border-moss bg-moss/30' : 'border-seal bg-seal/30'}`}
            style={{
              ...place(hover),
              width: `${100 / map.width}%`,
              height: `${100 / map.height}%`,
            }}
          />
        )}
        {world.castles.map((c) => {
          const { color, style } = playerHeraldry({ players }, c.playerId);
          return (
            <span
              key={c.playerId}
              title={`Burg ${c.name}`}
              className="pointer-events-none absolute -translate-x-1/2 -translate-y-1/2"
              style={place(c.position)}
            >
              <CastleIcon size={iconSize + 4} color={cssColor(color)} style={style} />
            </span>
          );
        })}
        {world.spots.map((s) => (
          <span
            key={s.id}
            title={SPOT_NAMES[s.resource]}
            className={pieceClass('spot', s.id)}
            style={place(s.position)}
            onPointerDown={startDrag({ mode: 'move', kind: 'spot', id: s.id })}
          >
            <SpotIcon kind={s.resource} size={iconSize} />
          </span>
        ))}
        {world.outposts.map((o) => (
          <span
            key={o.id}
            title={o.ownerId ? 'Stützpunkt' : 'Ruine'}
            className={pieceClass('outpost', o.id)}
            style={place(o.position)}
            onPointerDown={startDrag({ mode: 'move', kind: 'outpost', id: o.id })}
          >
            <OutpostIcon
              size={iconSize + 2}
              color={o.ownerId ? cssColor(playerHeraldry({ players }, o.ownerId).color) : null}
            />
          </span>
        ))}
        {world.chests.map((c) => (
          <span
            key={c.id}
            title={`Truhe (${c.troopsNeeded} Truppen)`}
            className={pieceClass('chest', c.id)}
            style={place(c.position)}
            onPointerDown={startDrag({ mode: 'move', kind: 'chest', id: c.id })}
          >
            <ChestIcon size={iconSize} />
          </span>
        ))}
      </div>

      <div className="mt-2 flex min-h-10 items-center justify-between gap-2">
        {selected && selectedInfo ? (
          <>
            <span className="min-w-0 truncate">{selectedInfo.text}</span>
            <Button
              variant="danger"
              className="h-10 shrink-0 sm:h-7"
              disabled={!selectedInfo.removable}
              onClick={() => {
                run(
                  { action: 'remove', kind: selected.kind, id: selected.id },
                  'Wirklich entfernen?',
                );
                setSelected(null);
              }}
            >
              Entfernen
            </Button>
          </>
        ) : (
          <span className="text-ink-soft">Nichts ausgewählt.</span>
        )}
      </div>

      {dragging && drag.source.mode === 'new' && (
        <div
          className="pointer-events-none fixed z-50 -translate-x-1/2 -translate-y-1/2"
          style={{ left: drag.x, top: drag.y }}
        >
          <SourceIcon source={drag.source} size={Math.max(iconSize, 24)} />
        </div>
      )}
      {dragging && moving && (
        <div
          className="pointer-events-none fixed z-50 -translate-x-1/2 -translate-y-1/2"
          style={{ left: drag.x, top: drag.y }}
        >
          {moving.kind === 'chest' ? (
            <ChestIcon size={Math.max(iconSize, 24)} />
          ) : moving.kind === 'outpost' ? (
            <OutpostIcon size={Math.max(iconSize, 24)} color={null} />
          ) : (
            <SpotIcon
              kind={world.spots.find((s) => s.id === moving.id)?.resource ?? 'wood'}
              size={Math.max(iconSize, 24)}
            />
          )}
        </div>
      )}
    </Panel>
  );
}
