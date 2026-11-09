import {
  ARMY_TARGET_KINDS,
  CASTLE_DECORATIONS,
  type ArmyTarget,
  type CastleDecoration,
  type DuoSourcePick,
  type GamePhase,
  type GameView,
} from './entities';
import type { MapData } from './map';
import type { PlayerStats } from './stats';
import { CARD_TYPES, RESOURCES, type CardType, type Resources, type ResourceType } from './rules';

export const PROTOCOL_VERSION = 6;

/** WebSocket close code for an unknown or revoked session token. */
export const CLOSE_UNKNOWN_TOKEN = 4001;

// ---- Client → Server ----

export interface PingMessage {
  type: 'ping';
  id: number;
  /** Client clock (performance.now()), echoed back in the pong to measure RTT. */
  sentAt: number;
}

export interface SetActivityMessage {
  type: 'setActivity';
  resource: ResourceType;
}

export interface BuyMessage {
  type: 'buy';
  item: 'troops' | 'victoryPoint';
  /** Number of troop batches or victory points. */
  count: number;
}

export interface SendArmyMessage {
  type: 'sendArmy';
  /** Base the troops leave from: an own outpost id, or null for the home castle. */
  from: string | null;
  troops: number;
  target: ArmyTarget;
  /** Send the armed `activeCard` along with this army. */
  useActiveCard: boolean;
  /** Resources to carry along: only stone, and only to the trader (with `trade`). */
  cargo: Resources;
  /** Trader only: what the carried stone is swapped for; `gold + wood` equals `cargo.stone`. */
  trade?: { gold: number; wood: number };
}

export interface RecallArmyMessage {
  type: 'recallArmy';
  armyId: string;
}

/**
 * Sends an army already in the field somewhere else. Empty-handed armies may take any target;
 * armies carrying resources only another base of their own; chest bearers none.
 */
export interface RedirectArmyMessage {
  type: 'redirectArmy';
  armyId: string;
  target: ArmyTarget;
}

/**
 * Activates a card: an instant card takes effect at once, a march card is armed for the next
 * army. `null` disarms the active card.
 */
export interface ActivateCardMessage {
  type: 'activateCard';
  card: CardType | null;
  /** For cards with a `target`: the own outpost id, the other player's id or a foreign army id. */
  target?: string;
}

/** Opens one chest waiting at home; the server answers with `chestOpened`. */
export interface OpenChestMessage {
  type: 'openChest';
}

/**
 * Offers a duo attack to `partnerId`: the target, the initiator's own troops (`sources`,
 * stationed troops from own bases) and how many troops the partner is to bring.
 */
export interface DuoOfferMessage {
  type: 'duoOffer';
  partnerId: string;
  target: ArmyTarget;
  sources: DuoSourcePick[];
  partnerTroops: number;
}

/** The initiator takes back an offer not answered yet. */
export interface DuoWithdrawMessage {
  type: 'duoWithdraw';
  pactId: string;
}

/**
 * The partner answers an offer. Accepting needs `sources` adding up to the asked troops; the
 * attack starts at once.
 */
export interface DuoAnswerMessage {
  type: 'duoAnswer';
  pactId: string;
  accept: boolean;
  sources: DuoSourcePick[];
}

/**
 * Asks to call off a running duo attack, or agrees when the other participant asked first (then
 * it is called off). Sent again by the one who asked, it takes the request back.
 */
export interface DuoAbortMessage {
  type: 'duoAbort';
  pactId: string;
}

export type ClientMessage =
  | DuoOfferMessage
  | DuoWithdrawMessage
  | DuoAnswerMessage
  | DuoAbortMessage
  | PingMessage
  | SetActivityMessage
  | BuyMessage
  | SendArmyMessage
  | RecallArmyMessage
  | RedirectArmyMessage
  | ActivateCardMessage
  | OpenChestMessage;

// ---- Server → Client ----

export interface WelcomeMessage {
  type: 'welcome';
  protocolVersion: number;
  playerId: string;
  tickRate: number;
  /** Null until the admin closes registration and the map is generated. */
  map: MapData | null;
}

export interface MapMessage {
  type: 'map';
  map: MapData | null;
}

export interface PongMessage {
  type: 'pong';
  id: number;
  sentAt: number;
  serverTime: number;
}

/** Per-player view of the world, sent every tick. */
export interface StateMessage {
  type: 'state';
  tick: number;
  view: GameView;
}

/** The card that was inside a chest the player just opened. */
export interface ChestOpenedMessage {
  type: 'chestOpened';
  card: CardType;
}

export type ErrorCode = 'bad_message' | 'rate_limited' | 'rejected';

export interface ErrorMessage {
  type: 'error';
  code: ErrorCode;
  message: string;
}

export type ServerMessage =
  WelcomeMessage | MapMessage | PongMessage | StateMessage | ChestOpenedMessage | ErrorMessage;

// ---- HTTP API ----

/**
 * Email login, step 1: request a one-time code. A known email gets a login code; an unknown one
 * needs a `name` and open registration, and is registered once the code is confirmed.
 */
export interface AuthStartRequest {
  email: string;
  name?: string;
}

export interface AuthStartResponse {
  /** `needsName`: email unknown and registration open — ask for a name and retry. */
  status: 'sent' | 'needsName';
}

/** Email login, step 2: exchange the emailed code for a session token. */
export interface AuthVerifyRequest {
  email: string;
  code: string;
}

export interface AuthVerifyResponse {
  token: string;
  playerId: string;
}

export interface ApiError {
  error: string;
}

export interface LobbyInfo {
  phase: GamePhase;
  players: string[];
  victoryPointsToWin: number;
}

export interface AdminPlayer {
  id: string;
  name: string;
  email: string | null;
  online: boolean;
  victoryPoints: number;
  trophies: number;
  homeTroops: number;
  troopsAway: number;
  resources: Record<ResourceType, number>;
  cards: CardType[];
  pendingActivity: ResourceType | null;
  castleDecoration: CastleDecoration | null;
  /** Online time and action counts for this round (online time includes the running session). */
  stats: PlayerStats;
}

export interface AdminState {
  phase: GamePhase;
  clock: GameView['clock'];
  mapSize: number | null;
  winnerId: string | null;
  victoryPointsToWin: number;
  players: AdminPlayer[];
  /** Today's calendar day (YYYY-MM-DD, game time zone): the key into `PlayerStats.onlineByDay`. */
  today: string;
  /** Server time (ms) the state was taken at; "last seen" times are relative to it. */
  serverTime: number;
  armies: number;
  chests: number;
  outposts: number;
}

export type AdminAction =
  | { action: 'start' }
  | { action: 'end' }
  | { action: 'reset' }
  | { action: 'pause' }
  | { action: 'resume' }
  | { action: 'advanceClock'; hours: number }
  | { action: 'newGameday' }
  | { action: 'spawnChest' }
  | { action: 'kick'; playerId: string }
  /** Swaps the two players' home castle positions; everything else stays with each player. */
  | { action: 'swapCastles'; playerId: string; otherId: string }
  | { action: 'setEmail'; playerId: string; email: string }
  | { action: 'rename'; playerId: string; name: string }
  /** Puts a decoration over the player's castle for everyone to see, or removes it (null). */
  | { action: 'setCastleDecoration'; playerId: string; decoration: CastleDecoration | null }
  /** Marks a calendar day (YYYY-MM-DD, game time zone) as a break day, or lifts it. */
  | { action: 'setBreakDay'; date: string; on: boolean }
  /** Adds `amount` (may be negative) trophies. */
  | { action: 'grantTrophies'; playerId: string; amount: number }
  /** Adds `amount` (may be negative) of one resource to the home castle. */
  | { action: 'grant'; playerId: string; resource: ResourceType; amount: number }
  /** Adds `amount` (may be negative) troops to the home castle. */
  | { action: 'grantTroops'; playerId: string; amount: number };

// ---- Codec ----

export function encode(message: ClientMessage | ServerMessage): string {
  return JSON.stringify(message);
}

function parseObject(raw: string): Record<string, unknown> | null {
  try {
    const value: unknown = JSON.parse(raw);
    return typeof value === 'object' && value !== null && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

const isPositiveInt = (value: unknown): value is number =>
  Number.isInteger(value) && (value as number) > 0;

const isResource = (value: unknown): value is ResourceType =>
  RESOURCES.includes(value as ResourceType);

const isCard = (value: unknown): value is CardType => CARD_TYPES.includes(value as CardType);

/** A whole, non-zero admin adjustment of at most ±10 000. */
const isAdminAmount = (value: unknown): value is number =>
  Number.isInteger(value) && value !== 0 && Math.abs(value as number) <= 10_000;

const isId = (value: unknown): value is string =>
  typeof value === 'string' && value.length > 0 && value.length <= 64;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Lower-cased, trimmed email, or null if it doesn't look like one. */
export function normalizeEmail(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const email = value.trim().toLowerCase();
  return email.length <= 254 && EMAIL_PATTERN.test(email) ? email : null;
}

function parseTarget(value: unknown): ArmyTarget | null {
  if (typeof value !== 'object' || value === null) return null;
  const { kind, id } = value as Record<string, unknown>;
  return ARMY_TARGET_KINDS.includes(kind as ArmyTarget['kind']) && isId(id)
    ? { kind: kind as ArmyTarget['kind'], id }
    : null;
}

function parseSources(value: unknown): DuoSourcePick[] | null {
  if (!Array.isArray(value) || value.length > 32) return null;
  const out: DuoSourcePick[] = [];
  for (const item of value as unknown[]) {
    if (typeof item !== 'object' || item === null) return null;
    const { from, troops } = item as Record<string, unknown>;
    if (!(from === null || isId(from)) || !isPositiveInt(troops)) return null;
    out.push({ from: from as string | null, troops: troops as number });
  }
  return out;
}

function parseResources(value: unknown): Resources | null {
  if (typeof value !== 'object' || value === null) return null;
  const raw = value as Record<string, unknown>;
  const out = {} as Resources;
  for (const r of RESOURCES) {
    const amount = raw[r] ?? 0;
    if (!Number.isInteger(amount) || (amount as number) < 0 || (amount as number) > 1_000_000) {
      return null;
    }
    out[r] = amount as number;
  }
  return out;
}

/** Validates untrusted client input. Returns null for anything malformed. */
export function parseClientMessage(raw: string): ClientMessage | null {
  const msg = parseObject(raw);
  if (!msg) return null;
  switch (msg.type) {
    case 'ping':
      return isFiniteNumber(msg.id) && isFiniteNumber(msg.sentAt)
        ? { type: 'ping', id: msg.id, sentAt: msg.sentAt }
        : null;
    case 'setActivity':
      return isResource(msg.resource) ? { type: 'setActivity', resource: msg.resource } : null;
    case 'buy':
      return (msg.item === 'troops' || msg.item === 'victoryPoint') &&
        isPositiveInt(msg.count) &&
        msg.count <= 1000
        ? { type: 'buy', item: msg.item, count: msg.count }
        : null;
    case 'sendArmy': {
      const target = parseTarget(msg.target);
      const cargo = parseResources(msg.cargo ?? {});
      const from = msg.from ?? null;
      const rawTrade = msg.trade as Record<string, unknown> | undefined;
      const trade =
        rawTrade === undefined
          ? undefined
          : typeof rawTrade === 'object' &&
              rawTrade !== null &&
              Number.isInteger(rawTrade.gold) &&
              Number.isInteger(rawTrade.wood) &&
              (rawTrade.gold as number) >= 0 &&
              (rawTrade.wood as number) >= 0
            ? { gold: rawTrade.gold as number, wood: rawTrade.wood as number }
            : null;
      return isPositiveInt(msg.troops) &&
        target &&
        cargo &&
        trade !== null &&
        (from === null || isId(from))
        ? {
            type: 'sendArmy',
            from,
            troops: msg.troops,
            target,
            useActiveCard: msg.useActiveCard === true,
            cargo,
            ...(trade ? { trade } : {}),
          }
        : null;
    }
    case 'recallArmy':
      return isId(msg.armyId) ? { type: 'recallArmy', armyId: msg.armyId } : null;
    case 'duoOffer': {
      const target = parseTarget(msg.target);
      const sources = parseSources(msg.sources);
      return isId(msg.partnerId) && target && sources && isPositiveInt(msg.partnerTroops)
        ? {
            type: 'duoOffer',
            partnerId: msg.partnerId,
            target,
            sources,
            partnerTroops: msg.partnerTroops,
          }
        : null;
    }
    case 'duoWithdraw':
    case 'duoAbort':
      return isId(msg.pactId) ? { type: msg.type, pactId: msg.pactId } : null;
    case 'duoAnswer': {
      const sources = parseSources(msg.sources ?? []);
      return isId(msg.pactId) && typeof msg.accept === 'boolean' && sources
        ? { type: 'duoAnswer', pactId: msg.pactId, accept: msg.accept, sources }
        : null;
    }
    case 'redirectArmy': {
      const target = parseTarget(msg.target);
      return isId(msg.armyId) && target
        ? { type: 'redirectArmy', armyId: msg.armyId, target }
        : null;
    }
    case 'activateCard':
      if (msg.card !== null && !isCard(msg.card)) return null;
      if (msg.target !== undefined && !isId(msg.target)) return null;
      return msg.target === undefined
        ? { type: 'activateCard', card: msg.card }
        : { type: 'activateCard', card: msg.card, target: msg.target };
    case 'openChest':
      return { type: 'openChest' };
    default:
      return null;
  }
}

const SERVER_MESSAGE_TYPES = new Set<ServerMessage['type']>([
  'welcome',
  'map',
  'pong',
  'state',
  'chestOpened',
  'error',
]);

/** The server is trusted, so this only checks the discriminant. */
export function parseServerMessage(raw: string): ServerMessage | null {
  const msg = parseObject(raw);
  return msg && SERVER_MESSAGE_TYPES.has(msg.type as ServerMessage['type'])
    ? (msg as unknown as ServerMessage)
    : null;
}

/** Validates an admin action body. */
export function parseAdminAction(value: unknown): AdminAction | null {
  if (typeof value !== 'object' || value === null) return null;
  const msg = value as Record<string, unknown>;
  switch (msg.action) {
    case 'start':
    case 'end':
    case 'reset':
    case 'pause':
    case 'resume':
    case 'newGameday':
    case 'spawnChest':
      return { action: msg.action };
    case 'advanceClock':
      return isFiniteNumber(msg.hours) && msg.hours > 0 && msg.hours <= 1000
        ? { action: 'advanceClock', hours: msg.hours }
        : null;
    case 'kick':
      return isId(msg.playerId) ? { action: 'kick', playerId: msg.playerId } : null;
    case 'swapCastles':
      return isId(msg.playerId) && isId(msg.otherId) && msg.playerId !== msg.otherId
        ? { action: 'swapCastles', playerId: msg.playerId, otherId: msg.otherId }
        : null;
    case 'setEmail': {
      const email = normalizeEmail(msg.email);
      return isId(msg.playerId) && email
        ? { action: 'setEmail', playerId: msg.playerId, email }
        : null;
    }
    case 'grant':
      return isId(msg.playerId) && isResource(msg.resource) && isAdminAmount(msg.amount)
        ? { action: 'grant', playerId: msg.playerId, resource: msg.resource, amount: msg.amount }
        : null;
    case 'grantTroops':
    case 'grantTrophies':
      return isId(msg.playerId) && isAdminAmount(msg.amount)
        ? { action: msg.action, playerId: msg.playerId, amount: msg.amount }
        : null;
    case 'rename':
      return isId(msg.playerId) && typeof msg.name === 'string' && msg.name.length <= 64
        ? { action: 'rename', playerId: msg.playerId, name: msg.name }
        : null;
    case 'setCastleDecoration':
      return isId(msg.playerId) &&
        (msg.decoration === null || CASTLE_DECORATIONS.includes(msg.decoration as CastleDecoration))
        ? {
            action: 'setCastleDecoration',
            playerId: msg.playerId,
            decoration: msg.decoration as CastleDecoration | null,
          }
        : null;
    case 'setBreakDay':
      return typeof msg.date === 'string' &&
        /^\d{4}-\d{2}-\d{2}$/.test(msg.date) &&
        typeof msg.on === 'boolean'
        ? { action: 'setBreakDay', date: msg.date, on: msg.on }
        : null;
    default:
      return null;
  }
}
