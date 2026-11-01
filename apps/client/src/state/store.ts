import type { ArmyTarget, GameView, MapData, StateMessage, WelcomeMessage } from '@vectoria/shared';
import { create } from 'zustand';

export type ConnectionStatus = 'idle' | 'connecting' | 'open' | 'closed';

/** Something selectable on the map: a castle, outpost, resource spot, chest, or army. */
export type Selection = ArmyTarget;

const TOKEN_KEY = 'vectoria.token';

function readToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

function writeToken(token: string | null): void {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    // Storage unavailable (private mode); the session just won't survive a reload.
  }
}

interface GameStore {
  status: ConnectionStatus;
  latencyMs: number | null;
  token: string | null;
  playerId: string | null;
  tickRate: number | null;
  map: MapData | null;
  tick: number;
  view: GameView | null;
  selection: Selection | null;
  zoom: number;
  /** Last rejected command, shown as a toast. */
  notice: { text: string; at: number } | null;

  setStatus(status: ConnectionStatus): void;
  setLatency(latencyMs: number): void;
  setToken(token: string | null): void;
  applyWelcome(message: WelcomeMessage): void;
  setMap(map: MapData | null): void;
  applyState(message: StateMessage): void;
  select(selection: Selection | null): void;
  setZoom(zoom: number): void;
  showNotice(text: string): void;
}

export const useGameStore = create<GameStore>()((set) => ({
  status: 'idle',
  latencyMs: null,
  token: readToken(),
  playerId: null,
  tickRate: null,
  map: null,
  tick: 0,
  view: null,
  selection: null,
  zoom: 1,
  notice: null,

  setStatus: (status) => set({ status }),
  setLatency: (latencyMs) => set({ latencyMs }),
  setToken: (token) => {
    writeToken(token);
    set({ token, view: null, map: null, playerId: null, selection: null });
  },
  applyWelcome: ({ playerId, tickRate, map }) => set({ playerId, tickRate, map, selection: null }),
  setMap: (map) => set({ map, selection: null }),
  applyState: ({ tick, view }) => set({ tick, view }),
  select: (selection) => set({ selection }),
  setZoom: (zoom) => set({ zoom }),
  showNotice: (text) => set({ notice: { text, at: Date.now() } }),
}));
