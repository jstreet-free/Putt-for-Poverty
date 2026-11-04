// Shows lobby push notifications. Deliberately does nothing else: there's no
// fetch handler, so it never caches or affects how the site loads.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

function readMessage(event) {
  try {
    return event.data?.json().data ?? {};
  } catch {
    return {};
  }
}

// iOS drops a site's subscription if a push ever arrives without showing a
// notification, so this must show one for every message.
self.addEventListener('push', (event) => {
  const { title = 'Putt for Poverty', body = '', tag, url = '/lobbies' } = readMessage(event);
  event.waitUntil(self.registration.showNotification(title, {
    body,
    tag,
    // Replacing a notification with the same tag is silent unless this is set.
    renotify: Boolean(tag),
    icon: '/icon-192.png',
    vibrate: [200, 100, 200],
    data: { url },
  }));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url || '/lobbies';
  event.waitUntil((async () => {
    // Only tabs this worker controls: navigate() rejects on any other.
    const [openTab] = await self.clients.matchAll({ type: 'window' });
    if (!openTab) return self.clients.openWindow(url);
    await openTab.focus();
    return openTab.navigate(url);
  })());
});
