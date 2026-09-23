/* The portal's one service worker: makes the app installable and shows web push.

   It used to be two scripts at the same "/" scope: sw.js (registered on every
   page load) and this one (registered by the FCM token code). A scope holds one
   script, so each registration swapped the other out, and any push that landed
   while sw.js was active showed nothing. iOS revokes a web-push subscription
   that receives pushes without showing a notification, which is one way
   devices went silent. Both registrations now point here, and sw.js only
   imports this file for clients still on the old registration.

   Push is handled directly instead of through the Firebase SW SDK: FCM delivers
   our data-only messages as JSON ({ data: { title, body, url } }), and the SDK
   deliberately shows nothing while any app window is visible, which iOS counts
   against the subscription too. */

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

// Network passthrough. A fetch handler must exist for some browsers to treat
// the portal as installable; no caching, so deploys never serve a stale shell.
self.addEventListener('fetch', () => {});

function readPushPayload(event) {
  if (!event.data) return {};
  try {
    return event.data.json() || {};
  } catch {
    return { data: { body: event.data.text() } };
  }
}

self.addEventListener('push', (event) => {
  const payload = readPushPayload(event);
  const data = payload.data || {};
  const notification = payload.notification || {};
  const title = notification.title || data.title || '3C Console';
  const body = notification.body || data.body || '';
  const url = data.url || '/portal/dashboard';

  event.waitUntil(
    (async () => {
      const target = new URL(url, self.location.origin);
      const clientList = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      // Someone already reading the chat sees the message arrive live, so a
      // banner would just be noise. A notification must still be shown for
      // every push, so show it silently and close it straight away.
      const watchingChat =
        target.pathname === '/portal/chat' &&
        clientList.some(
          (client) =>
            client.focused &&
            client.visibilityState === 'visible' &&
            new URL(client.url).pathname === '/portal/chat'
        );
      const tag = watchingChat ? `seen-${Date.now()}` : undefined;
      await self.registration.showNotification(title, {
        body,
        icon: '/icons/icon-192.png',
        badge: '/icons/icon-192.png',
        data: { url },
        ...(tag ? { tag, silent: true } : {}),
      });
      if (tag) {
        const shown = await self.registration.getNotifications({ tag });
        shown.forEach((item) => item.close());
      }
    })()
  );
});

// Tapping a notification opens its deep link (a chat push links to its
// channel): reuse an open app window when there is one, else open a new one.
// focus() goes first, while the click still counts as a user gesture.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || '/portal/dashboard';
  event.waitUntil(
    (async () => {
      const clientList = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      for (const client of clientList) {
        if (!('focus' in client)) continue;
        try {
          const focused = await client.focus();
          await (focused || client).navigate(url);
          return;
        } catch {
          // Not controlled by this worker (navigate rejects): try the next one.
        }
      }
      if (self.clients.openWindow) await self.clients.openWindow(url);
    })()
  );
});
