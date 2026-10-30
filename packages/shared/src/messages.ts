import type { ArmyTarget, GamePhase, GameView } from './entities';
import type { MapData } from './map';
import { CARD_TYPES, RESOURCES, type CardType, type ResourceType } from './rules';

export const PROTOCOL_VERSION = 2;

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
  troops: number;
  target: ArmyTarget;
  cards: CardType[];
}

export interface RecallArmyMessage {
  type: 'recallArmy';
  armyId: string;
}

export interface PlayCardMessage {
  type: 'playCard';
  card: CardType;
}

export type ClientMessage =
  | PingMessage
  | SetActivityMessage
  | BuyMessage
  | SendArmyMessage
  | RecallArmyMessage
  | PlayCardMessage;

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

export type ErrorCode = 'bad_message' | 'rate_limited' | 'rejected';

export interface ErrorMessage {
  type: 'error';
  code: ErrorCode;
  message: string;
}

export type ServerMessage = WelcomeMessage | MapMessage | PongMessage | StateMessage | ErrorMessage;

// ---- HTTP API ----

export interface JoinRequest {
  name: string;
}

export interface JoinResponse {
  token: string;
  playerId: string;
}

export interface ApiError {
  error: string;
}

export interface LobbyInfo {
  phase: GamePhase;
  players: string[];
}

export interface AdminPlayer {
  id: string;
  name: string;
  online: boolean;
  victoryPoints: number;
  homeTroops: number;
  troopsAway: number;
  resources: Record<ResourceType, number>;
  cards: CardType[];
  pendingActivity: ResourceType | null;
}

export interface AdminState {
  phase: GamePhase;
  clock: GameView['clock'];
  mapSize: number | null;
  winnerId: string | null;
  victoryPointsToWin: number;
  players: AdminPlayer[];
  armies: number;
  chests: number;
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
  | { action: 'grant'; playerId: string; resource: ResourceType; amount: number };

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

const isId = (value: unknown): value is string =>
  typeof value === 'string' && value.length > 0 && value.length <= 64;

function parseTarget(value: unknown): ArmyTarget | null {
  if (typeof value !== 'object' || value === null) return null;
  const { kind, id } = value as Record<string, unknown>;
  return (kind === 'castle' || kind === 'spot' || kind === 'chest') && isId(id)
    ? { kind, id }
    : null;
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
      const cards = Array.isArray(msg.cards) ? msg.cards : null;
      return isPositiveInt(msg.troops) &&
        target &&
        cards &&
        cards.length <= 4 &&
        cards.every(isCard)
        ? { type: 'sendArmy', troops: msg.troops, target, cards: [...new Set(cards)] }
        : null;
    }
    case 'recallArmy':
      return isId(msg.armyId) ? { type: 'recallArmy', armyId: msg.armyId } : null;
    case 'playCard':
      return isCard(msg.card) ? { type: 'playCard', card: msg.card } : null;
    default:
      return null;
  }
}

const SERVER_MESSAGE_TYPES = new Set<ServerMessage['type']>([
  'welcome',
  'map',
  'pong',
  'state',
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
    case 'grant':
      return isId(msg.playerId) &&
        isResource(msg.resource) &&
        Number.isInteger(msg.amount) &&
        Math.abs(msg.amount as number) <= 10_000
        ? {
            action: 'grant',
            playerId: msg.playerId,
            resource: msg.resource,
            amount: msg.amount as number,
          }
        : null;
    default:
      return null;
  }
}
