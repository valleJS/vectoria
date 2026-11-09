import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import type { PushNotice } from '@vectoria/shared';
import webpush, { WebPushError } from 'web-push';
import type { PushDevice } from './game/GameState';
import { log } from './logger';

/** Notices nobody picked up in this long are dropped by the push service. */
const PUSH_TTL_S = 6 * 60 * 60;

export interface VapidKeys {
  publicKey: string;
  privateKey: string;
}

/**
 * The VAPID key pair push services know this server by. From `VAPID_PUBLIC_KEY` /
 * `VAPID_PRIVATE_KEY` when set; otherwise generated once and kept in `vapid.json` next to the
 * save file, so subscriptions survive restarts and deploys (the data volume persists).
 */
export async function loadVapidKeys(
  configured: Partial<VapidKeys>,
  dataFile: string,
): Promise<VapidKeys> {
  if (configured.publicKey && configured.privateKey) {
    return { publicKey: configured.publicKey, privateKey: configured.privateKey };
  }
  const file = join(dirname(dataFile), 'vapid.json');
  try {
    const saved = JSON.parse(await readFile(file, 'utf8')) as Partial<VapidKeys>;
    if (saved.publicKey && saved.privateKey) {
      return { publicKey: saved.publicKey, privateKey: saved.privateKey };
    }
  } catch {
    // Not there yet (first start) or unreadable: make a new pair.
  }
  const keys = webpush.generateVAPIDKeys();
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, JSON.stringify(keys), { mode: 0o600 });
  log.info(`Generated VAPID keys for push notifications in ${file}`);
  return keys;
}

export interface PushDeps {
  subscriptions(playerId: string): readonly PushDevice[];
  /** The push service no longer knows this device (uninstalled, permission revoked). */
  forget(playerId: string, endpoint: string): void;
  /** One of the player's pages is in view: they see it on the map, no push needed. */
  watching(playerId: string): boolean;
}

/** Sends `PushNotice`s as Web Push messages to every device of the player that chose its topic. */
export class PushSender {
  private readonly keys: VapidKeys;
  private readonly subject: string;
  private readonly deps: PushDeps;

  constructor(keys: VapidKeys, subject: string, deps: PushDeps) {
    this.keys = keys;
    this.subject = subject;
    this.deps = deps;
  }

  get publicKey(): string {
    return this.keys.publicKey;
  }

  send(playerId: string, notice: PushNotice): void {
    if (this.deps.watching(playerId)) return;
    const payload = JSON.stringify(notice);
    for (const device of this.deps.subscriptions(playerId)) {
      if (!device.topics.includes(notice.topic)) continue;
      const subscription = { endpoint: device.endpoint, keys: device.keys };
      webpush
        .sendNotification(subscription, payload, {
          vapidDetails: { subject: this.subject, ...this.keys },
          TTL: PUSH_TTL_S,
          urgency: 'high',
        })
        .catch((error: unknown) => {
          // 404 / 410: the subscription is gone for good.
          if (
            error instanceof WebPushError &&
            (error.statusCode === 404 || error.statusCode === 410)
          ) {
            this.deps.forget(playerId, subscription.endpoint);
            return;
          }
          log.warn(`Push to ${playerId} failed`, error);
        });
    }
  }
}
