'use client';

import { getMessaging, getToken, isSupported, type Messaging } from 'firebase/messaging';
import { app } from './config';

// Public VAPID key (Web Push certificate) from Firebase console → Cloud Messaging →
// Web Push certificates. Set as NEXT_PUBLIC_FIREBASE_VAPID_KEY. Until it's set, push
// stays dormant and all helpers below return null gracefully.
const VAPID_KEY = process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY;

let messaging: Messaging | null = null;

async function getMessagingInstance(): Promise<Messaging | null> {
  if (!app || !VAPID_KEY) return null;
  if (!(await isSupported().catch(() => false))) return null;
  if (!messaging) messaging = getMessaging(app);
  return messaging;
}

// Whether this browser can do web push AND the app is configured for it.
export async function pushSupported(): Promise<boolean> {
  if (!VAPID_KEY) return false;
  if (typeof window === 'undefined' || !('Notification' in window)) return false;
  return await isSupported().catch(() => false);
}

// Requests notification permission and returns an FCM device token, or null if the
// user declined / push isn't configured. The token is what the server sends push to.
export async function requestPushToken(): Promise<string | null> {
  return (await requestPushTokenDetailed()).token;
}

// Same, plus a diagnostic detail string for the push-health beacon. iOS can leave
// an installed PWA with a DEAD push subscription (getToken then fails every time
// while permission stays 'granted' and the server keeps sending to a token Apple
// drops) — so on failure we unsubscribe the stale subscription and retry once,
// which mints a fresh APNs channel.
export async function requestPushTokenDetailed(): Promise<{ token: string | null; detail: string }> {
  const m = await getMessagingInstance();
  if (!m) return { token: null, detail: 'not-configured' };

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return { token: null, detail: `permission-${permission}` };

  // The push service worker must be registered for FCM to bind the token.
  const swReg = await navigator.serviceWorker
    .register('/firebase-messaging-sw.js')
    .catch(() => null);
  if (!swReg) return { token: null, detail: 'sw-register-failed' };

  try {
    const token = await getToken(m, { vapidKey: VAPID_KEY, serviceWorkerRegistration: swReg });
    return { token, detail: 'ok' };
  } catch (firstError) {
    try {
      const stale = await swReg.pushManager.getSubscription();
      if (stale) await stale.unsubscribe();
      const token = await getToken(m, { vapidKey: VAPID_KEY, serviceWorkerRegistration: swReg });
      return { token, detail: stale ? 'ok-after-resubscribe' : 'ok-on-retry' };
    } catch (secondError) {
      const msg = (error: unknown) =>
        error instanceof Error ? `${error.name}: ${error.message}` : String(error);
      return { token: null, detail: `token-failed [${msg(firstError)}] retry [${msg(secondError)}]`.slice(0, 200) };
    }
  }
}
