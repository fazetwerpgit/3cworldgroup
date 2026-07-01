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
  const m = await getMessagingInstance();
  if (!m) return null;

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return null;

  // The push service worker must be registered for FCM to bind the token.
  const swReg = await navigator.serviceWorker.register('/firebase-messaging-sw.js').catch(() => null);
  if (!swReg) return null;

  try {
    return await getToken(m, { vapidKey: VAPID_KEY, serviceWorkerRegistration: swReg });
  } catch {
    return null;
  }
}
