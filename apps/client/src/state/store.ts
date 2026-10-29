import type {
  EntityState,
  MapData,
  SnapshotMessage,
  TileCoord,
  WelcomeMessage,
} from '@vectoria/shared';
import { create } from 'zustand';

export type ConnectionStatus = 'idle' | 'connecting' | 'open' | 'closed';

interface GameStore {
  status: ConnectionStatus;
  latencyMs: number | null;
  playerId: string | null;
  tickRate: number | null;
  map: MapData | null;
  tick: number;
  entities: EntityState[];
  selectedTile: TileCoord | null;
  zoom: number;

  setStatus(status: ConnectionStatus): void;
  setLatency(latencyMs: number): void;
  applyWelcome(message: WelcomeMessage): void;
  applySnapshot(message: SnapshotMessage): void;
  selectTile(tile: TileCoord | null): void;
  setZoom(zoom: number): void;
}

export const useGameStore = create<GameStore>()((set) => ({
  status: 'idle',
  latencyMs: null,
  playerId: null,
  tickRate: null,
  map: null,
  tick: 0,
  entities: [],
  selectedTile: null,
  zoom: 1,

  setStatus: (status) => set({ status }),
  setLatency: (latencyMs) => set({ latencyMs }),
  applyWelcome: ({ playerId, tickRate, map }) =>
    set({ playerId, tickRate, map, selectedTile: null }),
  applySnapshot: ({ tick, entities }) => set({ tick, entities }),
  selectTile: (selectedTile) => set({ selectedTile }),
  setZoom: (zoom) => set({ zoom }),
}));
