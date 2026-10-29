import type { TileCoord } from '@vectoria/shared';
import { useEffect, useRef } from 'react';
import { gameSocket } from '../net/socket';
import { useGameStore } from '../state/store';
import { GameRenderer } from './GameRenderer';

function handleTileClick(tile: TileCoord): void {
  useGameStore.getState().selectTile(tile);
  gameSocket.send({ type: 'selectTile', ...tile });
}

/** Mounts the PixiJS canvas. Everything inside the canvas is driven by GameRenderer, not React. */
export function GameCanvas() {
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let renderer: GameRenderer | null = null;
    let cancelled = false;

    // Pixi init is async; StrictMode may unmount before it resolves, so destroy late arrivals.
    void GameRenderer.create(host, { onTileClick: handleTileClick }).then((created) => {
      if (cancelled) created.destroy();
      else renderer = created;
    });

    return () => {
      cancelled = true;
      renderer?.destroy();
    };
  }, []);

  return <div ref={hostRef} className="absolute inset-0" />;
}
