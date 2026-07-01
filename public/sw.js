// Minimal service worker to make the portal installable as a PWA.
// Kept intentionally light: it takes control quickly and lets the network handle
// requests. Offline caching + push handling are layered in later.
self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

// Network-first passthrough. No aggressive caching yet — avoids serving stale app
// shells during the frequent deploys this project does. Extend with a cache
// strategy once the app shell stabilizes.
self.addEventListener('fetch', () => {
  // Intentionally no-op: let the browser handle fetches normally.
  // A fetch handler must exist for the app to be considered installable by some browsers.
});

// Focus or open the app when a (future) push notification is clicked.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = (event.notification.data && event.notification.data.url) || '/portal/dashboard';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ('focus' in client) {
          client.navigate(targetUrl);
          return client.focus();
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(targetUrl);
    })
  );
});
