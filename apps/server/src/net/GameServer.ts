import type { IncomingMessage, Server as HttpServer } from 'node:http';
import {
  CLOSE_UNKNOWN_TOKEN,
  encode,
  parseClientMessage,
  PROTOCOL_VERSION,
  type ClientMessage,
  type MapData,
  type ServerMessage,
} from '@vectoria/shared';
import { WebSocket, WebSocketServer } from 'ws';
import { RuleError, type GameState } from '../game/GameState';
import { log } from '../logger';

const HEARTBEAT_INTERVAL_MS = 30_000;
const MAX_PAYLOAD_BYTES = 16 * 1024;
const RATE_LIMIT_PER_SECOND = 30;

interface Client {
  playerId: string;
  isAlive: boolean;
  /** Token bucket for inbound message rate limiting. */
  tokens: number;
  lastRefill: number;
  /** Last map sent, so a new one (game start / reset) is pushed once. */
  map: MapData | null;
}

export interface GameServerOptions {
  tickRate: number;
  /** Empty = accept any origin. */
  allowedOrigins: string[];
}

/**
 * WebSocket endpoint. Connections authenticate with `?token=` from `POST /api/auth/verify`; each client
 * gets its own filtered `state` view, because card effects hide details from other players.
 */
export class GameServer {
  private readonly wss: WebSocketServer;
  private readonly state: GameState;
  private readonly options: GameServerOptions;
  private readonly clients = new Map<WebSocket, Client>();
  private readonly heartbeat: NodeJS.Timeout;

  constructor(server: HttpServer, state: GameState, options: GameServerOptions) {
    this.state = state;
    this.options = options;
    this.wss = new WebSocketServer({
      server,
      path: '/ws',
      maxPayload: MAX_PAYLOAD_BYTES,
      verifyClient: ({ origin }: { origin: string }) =>
        options.allowedOrigins.length === 0 || options.allowedOrigins.includes(origin),
    });
    this.wss.on('connection', (ws, req) => this.handleConnection(ws, req));
    this.heartbeat = setInterval(() => this.checkHeartbeats(), HEARTBEAT_INTERVAL_MS);
  }

  get connectionCount(): number {
    return this.clients.size;
  }

  /** Sends every client its current view; drops clients whose player was kicked. */
  broadcastState(): void {
    for (const [ws, client] of this.clients) {
      if (ws.readyState !== WebSocket.OPEN) continue;
      const view = this.state.viewFor(client.playerId);
      if (!view) {
        ws.close(CLOSE_UNKNOWN_TOKEN, 'Unknown player');
        continue;
      }
      if (client.map !== this.state.map) {
        client.map = this.state.map;
        this.send(ws, { type: 'map', map: client.map });
      }
      this.send(ws, { type: 'state', tick: this.state.tick, view });
    }
  }

  close(): Promise<void> {
    clearInterval(this.heartbeat);
    for (const ws of this.clients.keys()) ws.close(1001, 'Server shutting down');
    return new Promise((resolve) => this.wss.close(() => resolve()));
  }

  private handleConnection(ws: WebSocket, req: IncomingMessage): void {
    const token = new URL(req.url ?? '/', 'http://localhost').searchParams.get('token') ?? '';
    const playerId = this.state.playerIdForToken(token);
    if (!playerId) {
      ws.close(CLOSE_UNKNOWN_TOKEN, 'Unknown token');
      return;
    }

    const client: Client = {
      playerId,
      isAlive: true,
      tokens: RATE_LIMIT_PER_SECOND,
      lastRefill: Date.now(),
      map: this.state.map,
    };
    this.clients.set(ws, client);
    this.state.setOnline(playerId, true);
    log.info(`Player ${playerId} connected (${this.clients.size} online)`);

    ws.on('pong', () => {
      client.isAlive = true;
    });

    ws.on('message', (data, isBinary) => {
      if (!this.consumeToken(client)) {
        this.send(ws, { type: 'error', code: 'rate_limited', message: 'Too many messages' });
        ws.close(1008, 'Rate limited');
        return;
      }
      const message = isBinary ? null : parseClientMessage(data.toString());
      if (!message) {
        this.send(ws, { type: 'error', code: 'bad_message', message: 'Malformed message' });
        return;
      }
      this.handleMessage(ws, client, message);
    });

    ws.on('close', () => {
      this.clients.delete(ws);
      this.state.setOnline(playerId, false);
      log.info(`Player ${playerId} disconnected (${this.clients.size} online)`);
    });

    ws.on('error', (error) => log.warn(`Socket error for ${playerId}`, error));

    this.send(ws, {
      type: 'welcome',
      protocolVersion: PROTOCOL_VERSION,
      playerId,
      tickRate: this.options.tickRate,
      map: this.state.map,
    });
  }

  private handleMessage(ws: WebSocket, client: Client, message: ClientMessage): void {
    const { playerId } = client;
    try {
      switch (message.type) {
        case 'ping':
          this.send(ws, {
            type: 'pong',
            id: message.id,
            sentAt: message.sentAt,
            serverTime: Date.now(),
          });
          return;
        case 'setActivity':
          return this.state.setActivity(playerId, message.resource);
        case 'buy':
          return this.state.buy(playerId, message.item, message.count);
        case 'sendArmy':
          return this.state.sendArmy(
            playerId,
            message.from,
            message.troops,
            message.target,
            message.cards,
            message.cargo,
          );
        case 'recallArmy':
          return this.state.recallArmy(playerId, message.armyId);
        case 'redirectArmy':
          return this.state.redirectArmy(playerId, message.armyId, message.target);
        case 'playCard':
          return this.state.playCard(playerId, message.card);
      }
    } catch (error) {
      if (!(error instanceof RuleError)) throw error;
      this.send(ws, { type: 'error', code: 'rejected', message: error.message });
    }
  }

  private send(ws: WebSocket, message: ServerMessage): void {
    if (ws.readyState === WebSocket.OPEN) ws.send(encode(message));
  }

  private consumeToken(client: Client): boolean {
    const now = Date.now();
    const refill = ((now - client.lastRefill) / 1000) * RATE_LIMIT_PER_SECOND;
    client.tokens = Math.min(RATE_LIMIT_PER_SECOND, client.tokens + refill);
    client.lastRefill = now;
    if (client.tokens < 1) return false;
    client.tokens -= 1;
    return true;
  }

  /** Protocol-level ping to drop connections that vanished without a close frame. */
  private checkHeartbeats(): void {
    for (const [ws, client] of this.clients) {
      if (!client.isAlive) {
        ws.terminate();
        continue;
      }
      client.isAlive = false;
      ws.ping();
    }
  }
}
