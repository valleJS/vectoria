import type { CardType, Resources, ResourceType } from './rules';

/** Position in tile units; (x + 0.5, y + 0.5) is the centre of tile (x, y). */
export interface Vec2 {
  x: number;
  y: number;
}

/** `registration` → admin starts → `running` → admin ends or a player reaches the VP goal → `ended`. */
export type GamePhase = 'registration' | 'running' | 'ended';

/**
 * What an army is marching to. Castles are keyed by their owner's player id, armies by army id
 * (an `army` target is a raid on a convoy heading home).
 */
export interface ArmyTarget {
  kind: 'castle' | 'outpost' | 'spot' | 'chest' | 'army';
  id: string;
}

export const ARMY_TARGET_KINDS: readonly ArmyTarget['kind'][] = [
  'castle',
  'outpost',
  'spot',
  'chest',
  'army',
];

export interface PlayerPublic {
  id: string;
  name: string;
  /** Castle tile. Null during registration (no map yet). */
  castle: Vec2 | null;
  victoryPoints: number;
  /** Troops at home — the castle's defence. Public, as everything on the map is visible. */
  homeTroops: number;
  fortified: boolean;
  /** Game clock of the last assault on the home castle, won or lost; null if never attacked. */
  attackedAt: number | null;
  online: boolean;
}

export interface ResourceSpot {
  id: string;
  resource: ResourceType;
  position: Vec2;
}

/**
 * A castle that starts empty and can be taken. Its owner can station troops and store resources
 * there; whoever takes it gets everything inside. Everything is public.
 */
export interface Outpost {
  id: string;
  name: string;
  position: Vec2;
  ownerId: string | null;
  troops: number;
  resources: Resources;
  /** Game clock of the last assault, won or lost; absent if never attacked. */
  attackedAt?: number;
}

export interface Chest {
  id: string;
  position: Vec2;
}

/** `gathering`: loading at a resource spot; the army heads home with its yield afterwards. */
export type ArmyStatus = 'outbound' | 'gathering' | 'returning';

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
  /** Route still ahead, starting at `position`, along land. Null when hidden by stealth. */
  route: Vec2[] | null;
  target: ArmyTarget | null;
  /** Game clock when the current leg started / ends (for `gathering`: loading done). */
  departClock: number;
  arriveClock: number;
  /** Resources carried (gathered, plundered, or moved between bases). Always visible. */
  cargo: Resources;
  fog: boolean;
  stealth: boolean;
  forcedMarch: boolean;
}

export interface LogEntry {
  at: number;
  text: string;
}

/** A public event in the live ticker. `armyId` links to the army it is about, if any. */
export interface FeedEntry {
  at: number;
  kind: 'march' | 'battle' | 'gather' | 'chest' | 'outpost' | 'day';
  text: string;
  armyId?: string;
}

/** The player's own private state. */
export interface SelfState {
  id: string;
  name: string;
  /** Resources stored in the home castle — the only ones that can be spent. */
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
  outposts: Outpost[];
  chests: Chest[];
  armies: ArmyView[];
  /** Live ticker, newest first. */
  feed: FeedEntry[];
  self: SelfState;
}
