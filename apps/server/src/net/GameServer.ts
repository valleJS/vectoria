import { randomUUID } from 'node:crypto';
import type { Server as HttpServer } from 'node:http';
import {
  encode,
  parseClientMessage,
  PROTOCOL_VERSION,
  type ClientMessage,
  type ServerMessage,
} from '@vectoria/shared';
import { WebSocket, WebSocketServer } from 'ws';
import type { GameState } from '../game/GameState';
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
}

export interface GameServerOptions {
  tickRate: number;
  /** Empty = accept any origin. */
  allowedOrigins: string[];
}

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
    this.wss.on('connection', (ws) => this.handleConnection(ws));
    this.heartbeat = setInterval(() => this.checkHeartbeats(), HEARTBEAT_INTERVAL_MS);
  }

  get connectionCount(): number {
    return this.clients.size;
  }

  broadcast(message: ServerMessage): void {
    const data = encode(message);
    for (const ws of this.clients.keys()) {
      if (ws.readyState === WebSocket.OPEN) ws.send(data);
    }
  }

  close(): Promise<void> {
    clearInterval(this.heartbeat);
    for (const ws of this.clients.keys()) ws.close(1001, 'Server shutting down');
    return new Promise((resolve) => this.wss.close(() => resolve()));
  }

  private handleConnection(ws: WebSocket): void {
    const client: Client = {
      playerId: randomUUID(),
      isAlive: true,
      tokens: RATE_LIMIT_PER_SECOND,
      lastRefill: Date.now(),
    };
    this.clients.set(ws, client);
    this.state.addPlayer(client.playerId);
    log.info(`Player ${client.playerId} connected (${this.clients.size} online)`);

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
      this.state.removePlayer(client.playerId);
      log.info(`Player ${client.playerId} disconnected (${this.clients.size} online)`);
    });

    ws.on('error', (error) => log.warn(`Socket error for ${client.playerId}`, error));

    this.send(ws, {
      type: 'welcome',
      protocolVersion: PROTOCOL_VERSION,
      playerId: client.playerId,
      tickRate: this.options.tickRate,
      map: this.state.map,
    });
  }

  private handleMessage(ws: WebSocket, client: Client, message: ClientMessage): void {
    switch (message.type) {
      case 'ping':
        this.send(ws, {
          type: 'pong',
          id: message.id,
          sentAt: message.sentAt,
          serverTime: Date.now(),
        });
        break;
      case 'selectTile':
        if (!this.state.selectTile(client.playerId, message)) {
          this.send(ws, { type: 'error', code: 'invalid_tile', message: 'Tile out of bounds' });
        }
        break;
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
