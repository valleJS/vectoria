// Service worker: shows the game's push notifications (`PushNotice` in packages/shared) and
// brings the game to the front when one is tapped. No caching: the game needs the server anyway.

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

self.addEventListener('push', (event) => {
  let notice = { title: 'Vectoria', body: '', tag: 'vectoria' };
  try {
    notice = { ...notice, ...event.data.json() };
  } catch {
    // Not JSON (or empty): show the defaults rather than nothing.
  }
  event.waitUntil(
    self.registration.showNotification(notice.title, {
      body: notice.body,
      tag: notice.tag,
      // A newer notice for the same base or attack replaces the old one, but still rings.
      renotify: true,
      icon: '/apple-touch-icon.png',
      badge: '/favicon-32.png',
      lang: 'de',
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      const open = windows.find((client) => new URL(client.url).origin === self.location.origin);
      if (open) return open.focus();
      return self.clients.openWindow('/');
    })(),
  );
});
