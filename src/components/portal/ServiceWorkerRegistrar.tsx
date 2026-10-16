'use client';

import { useEffect } from 'react';
import { isNativeApp } from '@/lib/app/isNativeApp';

// Registers the PWA service worker once, client-side. Renders nothing.
// Skipped inside the 3C iOS app: the shell owns push there (SPEC A1).
export default function ServiceWorkerRegistrar() {
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!('serviceWorker' in navigator)) return;
    if (isNativeApp()) return;
    // Register after load so it never competes with first paint.
    const register = () => {
      // Same script the FCM token code registers (src/lib/firebase/messaging.ts):
      // two different scripts at one scope keep replacing each other, and the
      // push handler lives in this one.
      navigator.serviceWorker.register('/firebase-messaging-sw.js').catch(() => {
        // best-effort; a failed SW registration must not break the app
      });
    };
    if (document.readyState === 'complete') register();
    else window.addEventListener('load', register, { once: true });
  }, []);

  return null;
}
