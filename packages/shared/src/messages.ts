import type { EntityState } from './entities';
import type { MapData } from './map';

export const PROTOCOL_VERSION = 1;

// ---- Client → Server ----

export interface PingMessage {
  type: 'ping';
  id: number;
  /** Client clock (performance.now()), echoed back in the pong to measure RTT. */
  sentAt: number;
}

export interface SelectTileMessage {
  type: 'selectTile';
  x: number;
  y: number;
}

export type ClientMessage = PingMessage | SelectTileMessage;

// ---- Server → Client ----

export interface WelcomeMessage {
  type: 'welcome';
  protocolVersion: number;
  playerId: string;
  tickRate: number;
  map: MapData;
}

export interface PongMessage {
  type: 'pong';
  id: number;
  sentAt: number;
  serverTime: number;
}

export interface SnapshotMessage {
  type: 'snapshot';
  tick: number;
  entities: EntityState[];
}

export interface ErrorMessage {
  type: 'error';
  code: 'bad_message' | 'invalid_tile' | 'rate_limited';
  message: string;
}

export type ServerMessage = WelcomeMessage | PongMessage | SnapshotMessage | ErrorMessage;

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

/** Validates untrusted client input. Returns null for anything malformed. */
export function parseClientMessage(raw: string): ClientMessage | null {
  const msg = parseObject(raw);
  if (!msg) return null;
  switch (msg.type) {
    case 'ping':
      return isFiniteNumber(msg.id) && isFiniteNumber(msg.sentAt)
        ? { type: 'ping', id: msg.id, sentAt: msg.sentAt }
        : null;
    case 'selectTile':
      return Number.isInteger(msg.x) && Number.isInteger(msg.y)
        ? { type: 'selectTile', x: msg.x as number, y: msg.y as number }
        : null;
    default:
      return null;
  }
}

const SERVER_MESSAGE_TYPES = new Set<ServerMessage['type']>([
  'welcome',
  'pong',
  'snapshot',
  'error',
]);

/** The server is trusted, so this only checks the discriminant. */
export function parseServerMessage(raw: string): ServerMessage | null {
  const msg = parseObject(raw);
  return msg && SERVER_MESSAGE_TYPES.has(msg.type as ServerMessage['type'])
    ? (msg as unknown as ServerMessage)
    : null;
}
