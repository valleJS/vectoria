import type {
  ArmyTarget,
  CardType,
  GameView,
  MapData,
  StateMessage,
  WelcomeMessage,
} from '@vectoria/shared';
import { create } from 'zustand';

export type ConnectionStatus = 'idle' | 'connecting' | 'open' | 'closed';

/**
 * Something selectable on the map: a castle, outpost, resource spot, chest, or army, or a wagon
 * of the own night caravan (client-only: not a target, `id` is the wagon's index on the trip).
 */
export type Selection = ArmyTarget | { kind: 'caravan'; id: string };

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

const SEEN_RULE_CHANGES_KEY = 'vectoria.ruleChangesSeen';

/** Ids of rule changes this browser has already shown (see ui/RuleChanges.tsx). */
function readSeenRuleChanges(): string[] {
  try {
    return localStorage.getItem(SEEN_RULE_CHANGES_KEY)?.split(',').filter(Boolean) ?? [];
  } catch {
    return [];
  }
}

function writeSeenRuleChanges(ids: string[]): void {
  try {
    localStorage.setItem(SEEN_RULE_CHANGES_KEY, ids.join(','));
  } catch {
    // Storage unavailable: the changes just show up as new again next time.
  }
}

interface GameStore {
  status: ConnectionStatus;
  latencyMs: number | null;
  token: string | null;
  playerId: string | null;
  tickRate: number | null;
  /** VAPID key from the welcome, to subscribe to push notifications; null = push off. */
  pushKey: string | null;
  map: MapData | null;
  tick: number;
  view: GameView | null;
  selection: Selection | null;
  zoom: number;
  /** Last rejected command, shown as a toast. */
  notice: { text: string; at: number } | null;
  /** Card whose profile is open, if any. */
  cardProfile: CardType | null;
  /** The chest-opening overlay is showing. */
  chestOverlay: boolean;
  /** Card the server revealed from the chest being opened; null until it arrives. */
  revealedCard: CardType | null;
  /** The handbook is open. */
  handbook: boolean;
  /** The trader's trade menu is open (opens when the trader is selected). */
  traderMenu: boolean;
  /** The rule-changes notice is open. */
  ruleChanges: boolean;
  /** Rule changes already shown in this browser. */
  seenRuleChanges: string[];
  /** Bestechung is being aimed: the map marks the armies in reach until one is picked. */
  bribing: boolean;

  setStatus(status: ConnectionStatus): void;
  setLatency(latencyMs: number): void;
  setToken(token: string | null): void;
  applyWelcome(message: WelcomeMessage): void;
  setMap(map: MapData | null): void;
  applyState(message: StateMessage): void;
  select(selection: Selection | null): void;
  setZoom(zoom: number): void;
  showNotice(text: string): void;
  showCard(card: CardType | null): void;
  setChestOverlay(open: boolean): void;
  revealCard(card: CardType | null): void;
  setHandbook(open: boolean): void;
  setTraderMenu(open: boolean): void;
  setRuleChanges(open: boolean): void;
  setBribing(bribing: boolean): void;
  /** Remembers these rule changes as seen, so they lose their "Neu" mark. */
  markRuleChangesSeen(ids: string[]): void;
}

export const useGameStore = create<GameStore>()((set) => ({
  status: 'idle',
  latencyMs: null,
  token: readToken(),
  playerId: null,
  tickRate: null,
  pushKey: null,
  map: null,
  tick: 0,
  view: null,
  selection: null,
  zoom: 1,
  notice: null,
  cardProfile: null,
  chestOverlay: false,
  revealedCard: null,
  handbook: false,
  traderMenu: false,
  ruleChanges: false,
  seenRuleChanges: readSeenRuleChanges(),
  bribing: false,

  setStatus: (status) => set({ status }),
  setLatency: (latencyMs) => set({ latencyMs }),
  setToken: (token) => {
    writeToken(token);
    set({ token, view: null, map: null, playerId: null, selection: null });
  },
  applyWelcome: ({ playerId, tickRate, map, pushKey }) =>
    set({ playerId, tickRate, map, pushKey, selection: null }),
  setMap: (map) => set({ map, selection: null }),
  // Chests waiting at home (on login, or a new one arriving) bring up the opening overlay.
  applyState: ({ tick, view }) =>
    set((s) => ({
      tick,
      view,
      chestOverlay: s.chestOverlay || view.self.chests > (s.view?.self.chests ?? 0),
    })),
  // Selecting the trader opens its trade menu in the middle of the screen.
  select: (selection) =>
    set((s) => ({
      selection,
      traderMenu:
        selection?.kind === 'spot' &&
        s.view?.spots.find((spot) => spot.id === selection.id)?.resource === 'trader',
    })),
  setTraderMenu: (traderMenu) => set({ traderMenu }),
  setZoom: (zoom) => set({ zoom }),
  showNotice: (text) => set({ notice: { text, at: Date.now() } }),
  showCard: (cardProfile) => set({ cardProfile }),
  setChestOverlay: (chestOverlay) => set({ chestOverlay, revealedCard: null }),
  revealCard: (revealedCard) => set({ revealedCard }),
  setHandbook: (handbook) => set({ handbook }),
  setRuleChanges: (ruleChanges) => set({ ruleChanges }),
  setBribing: (bribing) => set({ bribing }),
  markRuleChangesSeen: (ids) =>
    set((s) => {
      const seen = [...new Set([...s.seenRuleChanges, ...ids])];
      writeSeenRuleChanges(seen);
      return { seenRuleChanges: seen };
    }),
}));
