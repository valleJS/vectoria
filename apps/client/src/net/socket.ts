import {
  CLOSE_UNKNOWN_TOKEN,
  encode,
  parseServerMessage,
  PROTOCOL_VERSION,
  type ClientMessage,
  type ServerMessage,
} from '@vectoria/shared';
import { useGameStore } from '../state/store';

const PING_INTERVAL_MS = 2_000;
const MAX_RECONNECT_DELAY_MS = 10_000;
/**
 * The server pushes state at least once a second and answers pings; this long without any
 * message, the connection is taken as dead (e.g. a half-open TCP link on a lossy network).
 */
const SILENCE_TIMEOUT_MS = 8_000;

/** WebSocket client with auto-reconnect and RTT measurement. Writes inbound state to the store. */
export class GameSocket {
  private readonly url: string;
  private token = '';
  private ws: WebSocket | null = null;
  private shouldReconnect = false;
  private reconnectAttempts = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | undefined;
  private pingTimer: ReturnType<typeof setInterval> | undefined;
  private nextPingId = 1;
  private lastMessageAt = 0;
  /** A welcome arrived before, so the next one is a reconnect (maybe after a deploy). */
  private wasOpen = false;
  /** Called after every welcome (first connect and each reconnect), e.g. to renew push. */
  readonly onWelcome = new Set<() => void>();

  constructor(url: string) {
    this.url = url;
    // Back online or back in the foreground: retry now instead of waiting out the backoff.
    window.addEventListener('online', () => this.reconnectNow());
    document.addEventListener('visibilitychange', () => {
      this.sendVisibility();
      if (document.visibilityState === 'visible') this.reconnectNow();
    });
    // Leaving the page: no longer watching, so push notifications reach the player again.
    window.addEventListener('pagehide', () => this.send({ type: 'visibility', visible: false }));
  }

  connect(token: string): void {
    this.token = token;
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

  private reconnectNow(): void {
    if (!this.shouldReconnect || this.ws) return;
    clearTimeout(this.reconnectTimer);
    this.reconnectAttempts = 0;
    this.open();
  }

  private open(): void {
    useGameStore.getState().setStatus('connecting');
    const ws = new WebSocket(`${this.url}?token=${encodeURIComponent(this.token)}`);
    this.ws = ws;

    ws.onopen = () => {
      this.reconnectAttempts = 0;
      this.lastMessageAt = performance.now();
      useGameStore.getState().setStatus('open');
      this.sendPing();
      this.pingTimer = setInterval(() => {
        if (performance.now() - this.lastMessageAt > SILENCE_TIMEOUT_MS) {
          ws.close(4000, 'No messages');
          return;
        }
        this.sendPing();
      }, PING_INTERVAL_MS);
    };

    ws.onmessage = (event) => {
      this.lastMessageAt = performance.now();
      if (typeof event.data !== 'string') return;
      const message = parseServerMessage(event.data);
      if (message) this.handleMessage(message);
    };

    ws.onclose = (event) => {
      // Ignore close events from sockets we already replaced or deliberately closed.
      if (this.ws !== ws) return;
      this.ws = null;
      clearInterval(this.pingTimer);
      if (event.code === CLOSE_UNKNOWN_TOKEN) {
        // Session is gone (kicked or server reset); back to the join screen.
        this.shouldReconnect = false;
        useGameStore.getState().setStatus('idle');
        useGameStore.getState().setToken(null);
        return;
      }
      useGameStore.getState().setStatus('closed');
      if (this.shouldReconnect) this.scheduleReconnect();
    };
  }

  private scheduleReconnect(): void {
    const delay = Math.min(MAX_RECONNECT_DELAY_MS, 500 * 2 ** this.reconnectAttempts);
    this.reconnectAttempts++;
    this.reconnectTimer = setTimeout(() => this.open(), delay);
  }

  /** Tells the server whether the page is in view; it holds back push notifications then. */
  private sendVisibility(): void {
    this.send({ type: 'visibility', visible: document.visibilityState === 'visible' });
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
          // A deploy changed the protocol: load the new client, but only once per version.
          if (reloadOnceFor(message.protocolVersion)) return;
        }
        store.applyWelcome(message);
        this.sendVisibility();
        for (const listener of this.onWelcome) listener();
        // Reconnected, perhaps because a deploy restarted the server: pick up a new client.
        if (this.wasOpen) void reloadIfNewBuild();
        this.wasOpen = true;
        break;
      case 'map':
        store.setMap(message.map);
        break;
      case 'pong':
        store.setLatency(performance.now() - message.sentAt);
        break;
      case 'state':
        store.applyState(message);
        break;
      case 'chestOpened':
        store.revealCard(message.card);
        break;
      case 'error':
        if (message.code === 'rejected') store.showNotice(message.message);
        else console.warn(`Server error (${message.code}): ${message.message}`);
        break;
    }
  }
}

/** Entry bundle named in an HTML page (`/assets/index-<hash>.js`), or null in dev. */
function entryBundle(html: string): string | null {
  return /\/assets\/index-[\w-]+\.js/.exec(html)?.[0] ?? null;
}

/** Reloads once when the server now serves a different build than this page runs. */
async function reloadIfNewBuild(): Promise<void> {
  const own = entryBundle(document.documentElement.outerHTML);
  if (!own) return;
  try {
    const response = await fetch('/', { cache: 'no-store' });
    const served = entryBundle(await response.text());
    if (served && served !== own) reloadOnce(`build:${served}`);
  } catch {
    // Offline again or the page is unreachable; the next reconnect tries again.
  }
}

const RELOAD_KEY = 'vectoria.reloadedFor';

/** Reloads the page unless it already did for protocol `version`; true if a reload was started. */
function reloadOnceFor(version: number): boolean {
  return reloadOnce(String(version));
}

/** Reloads the page unless it already did for `key` (stops reload loops); true if started. */
function reloadOnce(key: string): boolean {
  try {
    if (sessionStorage.getItem(RELOAD_KEY) === key) return false;
    sessionStorage.setItem(RELOAD_KEY, key);
  } catch {
    return false;
  }
  window.location.reload();
  return true;
}

function defaultUrl(): string {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${window.location.host}/ws`;
}

export const gameSocket = new GameSocket(import.meta.env.VITE_WS_URL ?? defaultUrl());
