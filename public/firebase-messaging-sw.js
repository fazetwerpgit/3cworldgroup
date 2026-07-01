/* Firebase Cloud Messaging service worker — handles push while the app is in the
   background or closed. Config values below are the public NEXT_PUBLIC_* Firebase
   keys (safe to expose; they already ship in the client bundle). */
importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: 'AIzaSyDwfYWGNc9SOfog1MNuDJ-RP5idQh9A3hY',
  authDomain: 'cworldgroup-cca68.firebaseapp.com',
  projectId: 'cworldgroup-cca68',
  storageBucket: 'cworldgroup-cca68.firebasestorage.app',
  messagingSenderId: '55311478672',
  appId: '1:55311478672:web:2a2bd59248e0da03154d15',
});

const messaging = firebase.messaging();

// Background push → show a notification. Data-only messages land here too.
messaging.onBackgroundMessage((payload) => {
  const title = (payload.notification && payload.notification.title) || (payload.data && payload.data.title) || '3C Console';
  const body = (payload.notification && payload.notification.body) || (payload.data && payload.data.body) || '';
  const url = (payload.data && payload.data.url) || '/portal/dashboard';
  self.registration.showNotification(title, {
    body,
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    data: { url },
  });
});

// Clicking the notification focuses/opens the app at the deep link.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || '/portal/dashboard';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ('focus' in client) {
          client.navigate(url);
          return client.focus();
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(url);
    })
  );
});
