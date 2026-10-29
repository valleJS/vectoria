import {
  encode,
  parseServerMessage,
  PROTOCOL_VERSION,
  type ClientMessage,
  type ServerMessage,
} from '@vectoria/shared';
import { useGameStore } from '../state/store';

const PING_INTERVAL_MS = 2_000;
const MAX_RECONNECT_DELAY_MS = 10_000;

/** WebSocket client with auto-reconnect and RTT measurement. Writes inbound state to the store. */
export class GameSocket {
  private readonly url: string;
  private ws: WebSocket | null = null;
  private shouldReconnect = false;
  private reconnectAttempts = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | undefined;
  private pingTimer: ReturnType<typeof setInterval> | undefined;
  private nextPingId = 1;

  constructor(url: string) {
    this.url = url;
  }

  connect(): void {
    this.shouldReconnect = true;
    if (!this.ws) this.open();
  }

  disconnect(): void {
    this.shouldReconnect = false;
    clearTimeout(this.reconnectTimer);
    clearInterval(this.pingTimer);
    const ws = this.ws;
    this.ws = null;
    ws?.close(1000);
    useGameStore.getState().setStatus('idle');
  }

  send(message: ClientMessage): boolean {
    if (this.ws?.readyState !== WebSocket.OPEN) return false;
    this.ws.send(encode(message));
    return true;
  }

  private open(): void {
    useGameStore.getState().setStatus('connecting');
    const ws = new WebSocket(this.url);
    this.ws = ws;

    ws.onopen = () => {
      this.reconnectAttempts = 0;
      useGameStore.getState().setStatus('open');
      this.sendPing();
      this.pingTimer = setInterval(() => this.sendPing(), PING_INTERVAL_MS);
    };

    ws.onmessage = (event) => {
      if (typeof event.data !== 'string') return;
      const message = parseServerMessage(event.data);
      if (message) this.handleMessage(message);
    };

    ws.onclose = () => {
      // Ignore close events from sockets we already replaced or deliberately closed.
      if (this.ws !== ws) return;
      this.ws = null;
      clearInterval(this.pingTimer);
      useGameStore.getState().setStatus('closed');
      if (this.shouldReconnect) this.scheduleReconnect();
    };
  }

  private scheduleReconnect(): void {
    const delay = Math.min(MAX_RECONNECT_DELAY_MS, 500 * 2 ** this.reconnectAttempts);
    this.reconnectAttempts++;
    this.reconnectTimer = setTimeout(() => this.open(), delay);
  }

  private sendPing(): void {
    this.send({ type: 'ping', id: this.nextPingId++, sentAt: performance.now() });
  }

  private handleMessage(message: ServerMessage): void {
    const store = useGameStore.getState();
    switch (message.type) {
      case 'welcome':
        if (message.protocolVersion !== PROTOCOL_VERSION) {
          console.warn(
            `Protocol mismatch: client ${PROTOCOL_VERSION}, server ${message.protocolVersion}`,
          );
        }
        store.applyWelcome(message);
        break;
      case 'pong':
        store.setLatency(performance.now() - message.sentAt);
        break;
      case 'snapshot':
        store.applySnapshot(message);
        break;
      case 'error':
        console.warn(`Server error (${message.code}): ${message.message}`);
        break;
    }
  }
}

function defaultUrl(): string {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${window.location.host}/ws`;
}

export const gameSocket = new GameSocket(import.meta.env.VITE_WS_URL ?? defaultUrl());
