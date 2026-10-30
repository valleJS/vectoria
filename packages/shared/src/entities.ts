import type { CardType, Resources, ResourceType } from './rules';

/** Position in tile units; (x + 0.5, y + 0.5) is the centre of tile (x, y). */
export interface Vec2 {
  x: number;
  y: number;
}

/** `registration` → admin starts → `running` → admin ends or a player reaches the VP goal → `ended`. */
export type GamePhase = 'registration' | 'running' | 'ended';

/** What an army is marching to. Castles are keyed by their owner's player id. */
export interface ArmyTarget {
  kind: 'castle' | 'spot' | 'chest';
  id: string;
}

export interface PlayerPublic {
  id: string;
  name: string;
  /** Castle tile. Null during registration (no map yet). */
  castle: Vec2 | null;
  victoryPoints: number;
  /** Troops at home — the castle's defence. Public, as everything on the map is visible. */
  homeTroops: number;
  fortified: boolean;
  online: boolean;
}

export interface ResourceSpot {
  id: string;
  resource: ResourceType;
  position: Vec2;
}

export interface Chest {
  id: string;
  position: Vec2;
}

export type ArmyStatus = 'outbound' | 'stationed' | 'returning';

/** An army as one player sees it; card effects null out details for everyone but the owner. */
export interface ArmyView {
  id: string;
  ownerId: string;
  status: ArmyStatus;
  /** Null when hidden by a fog card. */
  troops: number | null;
  position: Vec2;
  from: Vec2;
  /** Null when hidden by a stealth card. */
  to: Vec2 | null;
  target: ArmyTarget | null;
  /** Game clock at departure / arrival; null while stationed. */
  departClock: number | null;
  arriveClock: number | null;
  fog: boolean;
  stealth: boolean;
  forcedMarch: boolean;
}

export interface LogEntry {
  at: number;
  text: string;
}

/** The player's own private state. */
export interface SelfState {
  id: string;
  name: string;
  resources: Resources;
  /** Activity that paid out today. */
  activity: ResourceType | null;
  /** Applies at the next gameday start (10:00). */
  pendingActivity: ResourceType | null;
  cards: CardType[];
  fortifiedUntil: number | null;
  log: LogEntry[];
}

export interface ClockState {
  /** Accumulated gameday milliseconds since the game started. */
  clock: number;
  /** True while the game clock advances (inside gameday hours, not paused). */
  running: boolean;
  paused: boolean;
  /** Game-clock ms per real ms while running (1 in production). */
  timeScale: number;
  gameday: number;
  mode: 'weekdays' | 'always';
}

export interface GameView {
  phase: GamePhase;
  clock: ClockState;
  victoryPointsToWin: number;
  winnerId: string | null;
  players: PlayerPublic[];
  spots: ResourceSpot[];
  chests: Chest[];
  armies: ArmyView[];
  self: SelfState;
}
