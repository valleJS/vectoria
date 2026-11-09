import { PUSH_TOPICS, type PushSubscriptionData, type PushTopic } from '@vectoria/shared';
import { useCallback, useEffect, useState } from 'react';
import { useGameStore } from '../state/store';
import { gameSocket } from './socket';

/**
 * Push notifications on this device: `install` = iPhone/iPad Safari, where push only works from
 * the home-screen app; `busy` while a switch is in progress.
 */
export type PushStatus = 'unsupported' | 'install' | 'denied' | 'off' | 'on' | 'busy';

const WORKER = '/sw.js';
const TOPICS_KEY = 'vectoria.pushTopics';

/** The topics this device chose (all until changed); kept per browser, like the switch itself. */
function readTopics(): PushTopic[] {
  try {
    const raw = localStorage.getItem(TOPICS_KEY);
    if (raw === null) return [...PUSH_TOPICS];
    return raw.split(',').filter((t): t is PushTopic => PUSH_TOPICS.includes(t as PushTopic));
  } catch {
    return [...PUSH_TOPICS];
  }
}

function writeTopics(topics: PushTopic[]): void {
  try {
    localStorage.setItem(TOPICS_KEY, topics.join(','));
  } catch {
    // Private mode: the choice lasts until the page closes (the server keeps it anyway).
  }
}

function supported(): boolean {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

/** iOS / iPadOS in the browser rather than the home-screen app. */
function needsInstall(): boolean {
  const ios =
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.userAgent.includes('Macintosh') && navigator.maxTouchPoints > 1);
  const standalone =
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true;
  return ios && !standalone;
}

function keyBytes(base64url: string): Uint8Array<ArrayBuffer> {
  const base64 = (base64url + '='.repeat((4 - (base64url.length % 4)) % 4))
    .replace(/-/g, '+')
    .replace(/_/g, '/');
  const raw = atob(base64);
  const bytes = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

/** The subscription was made with the server's current key (it changes if the keys are lost). */
function sameKey(subscription: PushSubscription, key: string): boolean {
  const current = subscription.options.applicationServerKey;
  if (!current) return false;
  const a = new Uint8Array(current);
  const b = keyBytes(key);
  return a.length === b.length && a.every((value, i) => value === b[i]);
}

function sendSubscription(subscription: PushSubscription): void {
  const { endpoint, keys } = subscription.toJSON();
  if (!endpoint || !keys?.p256dh || !keys.auth) return;
  const data: PushSubscriptionData = { endpoint, keys: { p256dh: keys.p256dh, auth: keys.auth } };
  gameSocket.send({ type: 'pushSubscribe', subscription: data, topics: readTopics() });
}

async function subscribe(
  registration: ServiceWorkerRegistration,
  key: string,
): Promise<PushSubscription> {
  const existing = await registration.pushManager.getSubscription();
  if (existing && sameKey(existing, key)) return existing;
  await existing?.unsubscribe();
  return registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: keyBytes(key),
  });
}

async function currentSubscription(): Promise<PushSubscription | null> {
  const registration = await navigator.serviceWorker.getRegistration('/');
  return (await registration?.pushManager.getSubscription()) ?? null;
}

async function readStatus(): Promise<PushStatus> {
  if (needsInstall()) return 'install';
  if (!supported() || !useGameStore.getState().pushKey) return 'unsupported';
  if (Notification.permission === 'denied') return 'denied';
  if (Notification.permission !== 'granted') return 'off';
  return (await currentSubscription()) ? 'on' : 'off';
}

/** Asks for permission (must run straight from a click: iOS insists) and subscribes. */
async function enable(): Promise<PushStatus> {
  const key = useGameStore.getState().pushKey;
  if (!key) return 'unsupported';
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return permission === 'denied' ? 'denied' : 'off';
  await navigator.serviceWorker.register(WORKER);
  const registration = await navigator.serviceWorker.ready;
  sendSubscription(await subscribe(registration, key));
  return 'on';
}

/** Stops push to this device, on the server and in the browser. */
export async function disablePush(): Promise<void> {
  if (!supported()) return;
  const subscription = await currentSubscription();
  if (!subscription) return;
  gameSocket.send({ type: 'pushUnsubscribe', endpoint: subscription.endpoint });
  await subscription.unsubscribe();
}

/**
 * After every welcome: hand this device's subscription to the server again (it may have lost
 * it: a reset save, a new device limit) and renew it if the server's key changed.
 */
async function syncPush(): Promise<void> {
  const key = useGameStore.getState().pushKey;
  if (!key || !supported() || Notification.permission !== 'granted') return;
  const registration = await navigator.serviceWorker.getRegistration('/');
  // No subscription: the player turned push off here (or never on); leave it so.
  if (!registration || !(await registration.pushManager.getSubscription())) return;
  sendSubscription(await subscribe(registration, key));
}

gameSocket.onWelcome.add(() => {
  syncPush().catch((error: unknown) => console.warn('Push sync failed', error));
});

/** The device's push status, a switch for it and the topics it gets told about. */
export function usePush(): {
  status: PushStatus;
  toggle: () => void;
  topics: PushTopic[];
  setTopic: (topic: PushTopic, on: boolean) => void;
} {
  const pushKey = useGameStore((s) => s.pushKey);
  const [status, setStatus] = useState<PushStatus>('busy');
  const [topics, setTopics] = useState<PushTopic[]>(readTopics);

  useEffect(() => {
    let live = true;
    void readStatus().then((next) => live && setStatus(next));
    return () => {
      live = false;
    };
  }, [pushKey]);

  const toggle = useCallback(() => {
    if (status !== 'on' && status !== 'off') return;
    setStatus('busy');
    const change = status === 'on' ? disablePush().then(() => 'off' as const) : enable();
    change.then(setStatus, (error: unknown) => {
      console.warn('Push switch failed', error);
      void readStatus().then(setStatus);
    });
  }, [status]);

  const setTopic = useCallback((topic: PushTopic, on: boolean) => {
    const next = PUSH_TOPICS.filter((t) => (t === topic ? on : readTopics().includes(t)));
    writeTopics(next);
    setTopics(next);
    // Subscribed already: tell the server at once.
    void currentSubscription().then((subscription) => {
      if (subscription) sendSubscription(subscription);
    });
  }, []);

  return { status, toggle, topics, setTopic };
}
