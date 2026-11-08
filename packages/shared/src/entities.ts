import {
  hasResources,
  type CardType,
  type Resources,
  type ResourceType,
  type SpotKind,
} from './rules';

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

/** Something the admin can put over a player's castle, seen by everyone; purely cosmetic. */
export type CastleDecoration = 'penis';

export const CASTLE_DECORATIONS: readonly CastleDecoration[] = ['penis'];

export interface PlayerPublic {
  id: string;
  name: string;
  /** Castle tile. Null during registration (no map yet). */
  castle: Vec2 | null;
  victoryPoints: number;
  /**
   * Victories over other players (raid, outpost or castle taken): a public reputation, needed
   * for every `TROPHY_VP_INTERVAL`-th victory point and never spent, carried or stolen.
   */
  trophies: number;
  /**
   * Troops at home — the castle's defence. Public, as everything on the map is visible; null for
   * others while a Nebel march that set out from the castle is still on its first route.
   */
  homeTroops: number | null;
  fortified: boolean;
  /** Shoes stolen (card): marches started now go at `BAREFOOT_SPEED`. */
  barefoot: boolean;
  /**
   * The home castle fell: every army and outpost garrison is retreating home, and the player
   * cannot act until all of them are back.
   */
  routed: boolean;
  /** Game clock of the last assault on the home castle, won or lost; null if never attacked. */
  attackedAt: number | null;
  online: boolean;
  /**
   * The player's night caravan on its way (drawn on the map); null while none travels. Public,
   * like the outpost stock it carries.
   */
  caravanTrip: CaravanTrip | null;
  /** Set by the admin, drawn over the castle for everyone; null for none. */
  castleDecoration: CastleDecoration | null;
}

/**
 * An outpost as one player sees it: `troops` is null for others while a Nebel march that set out
 * from it is still on its first route.
 */
export interface OutpostView extends Omit<Outpost, 'troops'> {
  troops: number | null;
}

export interface ResourceSpot {
  id: string;
  /** Named `resource` for save compatibility; `trader` is the Händler, not a resource. */
  resource: SpotKind;
  position: Vec2;
}

/**
 * A castle that starts as an empty ruin and can be taken (rebuilt). Its owner can station troops
 * and store resources there; whoever takes it gets everything inside. Everything is public.
 */
export interface Outpost {
  id: string;
  position: Vec2;
  ownerId: string | null;
  troops: number;
  resources: Resources;
  /** Game clock of the last assault, won or lost; absent if never attacked. */
  attackedAt?: number;
}

/** Display name of an outpost: a ruin while unowned, "Stützpunkt <owner>" once rebuilt. */
export function outpostName(ownerName: string | null): string {
  return ownerName === null ? 'Ruine' : `Stützpunkt ${ownerName}`;
}

export interface Chest {
  id: string;
  position: Vec2;
  /** Only an army of at least this many troops can open it. */
  troopsNeeded: number;
}

/**
 * `gathering`: loading at a resource spot; the army heads home with its yield afterwards.
 * `waiting`: a duo group at the meeting point, waiting for the others to arrive.
 */
export type ArmyStatus = 'outbound' | 'gathering' | 'returning' | 'waiting';

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
  /**
   * Game clock when the current leg started / ends (for `gathering`: loading done). When hidden by
   * stealth, `arriveClock` equals `departClock`: the arrival time is not shown.
   */
  departClock: number;
  arriveClock: number;
  /** Resources carried (gathered, plundered, or moved between bases). Always visible. */
  cargo: Resources;
  /** Carrying a chest home. The chest cannot be stolen; resource cargo beside it can. */
  chest: boolean;
  fog: boolean;
  stealth: boolean;
  forcedMarch: boolean;
  /** Seeweg card: this leg runs straight to the target, over water too. */
  sea: boolean;
  /**
   * Duo attack: the other participant. On the united army always shown; on a group heading for
   * the meeting point only to the two participants.
   */
  duoWith: string | null;
  /**
   * Bestechung: the own army this one marches to join (a bribed army). Its `target` is then that
   * army, but it is no raid. Null otherwise.
   */
  joining: string | null;
}

/**
 * An army that can be ambushed: carrying resources on the march — home, or between own bases.
 * While its owner is routed (home castle fell), every army of theirs is immune.
 */
export function isRaidable(
  army: Pick<ArmyView, 'status' | 'cargo'>,
  ownerRouted: boolean,
): boolean {
  return !ownerRouted && army.status !== 'gathering' && hasResources(army.cargo);
}

/**
 * An army Bestechung can win over: marching (not gathering or waiting), carrying neither
 * resources nor a chest, not part of a duo, and its owner not routed.
 */
export function isBribable(
  army: Pick<ArmyView, 'status' | 'cargo'> & { chest?: boolean },
  inDuo: boolean,
  ownerRouted: boolean,
): boolean {
  return (
    !ownerRouted &&
    !inDuo &&
    (army.status === 'outbound' || army.status === 'returning') &&
    !army.chest &&
    !hasResources(army.cargo)
  );
}

/** Where duo troops come from: an own outpost id, or null for the home castle. */
export interface DuoSourcePick {
  from: string | null;
  troops: number;
}

/**
 * A duo attack pact, as its two participants see it (nobody else does). `offered`: waiting for
 * the partner's answer; `marching`: the groups head for the meeting point; `united`: the duo
 * army is on its way to the target.
 */
export interface PactView {
  id: string;
  initiatorId: string;
  partnerId: string;
  /** An enemy castle or outpost. */
  target: ArmyTarget;
  /** How the initiator's share is put together. */
  initiatorSources: DuoSourcePick[];
  initiatorTroops: number;
  partnerTroops: number;
  status: 'offered' | 'marching' | 'united';
  /** Gameday the offer was made; unanswered, it lapses when the following gameday ends. */
  gameday: number;
  /** Once marching: when the last group reaches the meeting point (the target is revealed). */
  meetClock: number | null;
  /** Once marching: when the duo army reaches the target. */
  attackClock: number | null;
  /** Participant who asked to call the attack off; the other one has to agree. */
  abortBy: string | null;
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
  /** Cards in hand; owned by the player, not by a base. */
  cards: CardType[];
  /** Duo attack offers and pacts the player is part of (the inbox). */
  pacts: PactView[];
  /** March card armed for the next army sent (still in `cards` until used). */
  activeCard: CardType | null;
  /** Chests brought home but not yet opened; opened by the player via `openChest`. */
  chests: number;
  fortifiedUntil: number | null;
  /** Gameday starts still paying the Füllhorn bonus. */
  harvestDays: number;
  /**
   * Outpost stock on the night caravan: it set out at the end of the gameday (18:00) and reaches
   * the home castle at the next gameday start. Not spendable, not plunderable meanwhile.
   */
  caravan: Resources;
  /** Game clock until which own marches start barefoot (shoes stolen); null if not. */
  barefootUntil: number | null;
  /** Victory points bought this gameday (capped at `VICTORY_POINTS_PER_GAMEDAY`). */
  victoryPointsToday: number;
  /**
   * Langfinger: how many cards each other player holds (not which). Sent only while the player
   * holds a Langfinger card; null otherwise.
   */
  cardCounts: { playerId: string; count: number }[] | null;
  log: LogEntry[];
}

/** One wagon of a night caravan: it sets out from an owned outpost with that outpost's stock. */
export interface CaravanWagon {
  from: Vec2;
  load: Resources;
}

/**
 * The night caravan in real time (the game clock stands still at night): it set out at
 * `departedAt` (18:00) and reaches the home castle at `arrivesAt` (the next gameday start), both
 * epoch ms.
 */
export interface CaravanTrip {
  wagons: CaravanWagon[];
  departedAt: number;
  arrivesAt: number;
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
  /** Calendar days (YYYY-MM-DD, game time zone) without a gameday: the clock stands still. */
  breakDays: string[];
  /** Today is one of `breakDays`. */
  breakToday: boolean;
}

export interface GameView {
  phase: GamePhase;
  clock: ClockState;
  victoryPointsToWin: number;
  winnerId: string | null;
  players: PlayerPublic[];
  spots: ResourceSpot[];
  outposts: OutpostView[];
  chests: Chest[];
  armies: ArmyView[];
  /** Live ticker, newest first. */
  feed: FeedEntry[];
  self: SelfState;
}
