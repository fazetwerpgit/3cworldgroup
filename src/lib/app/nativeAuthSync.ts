'use client';

import { onIdTokenChanged } from 'firebase/auth';
import { auth } from '@/lib/firebase/config';
import { postToNative, type WebToNativeMessage } from './bridge';
import { isNativeApp } from './isNativeApp';
import { setNativeAuthUid } from './nativeChat';

// Keeps the 3C iOS shell's native Firebase Auth (used by the native chat
// screen) signed in as the same person as the web (docs/ios-app/BRIDGE.md).
//
// On sign-in and on every ID-token refresh, the web asks
// POST /api/portal/auth/custom-token for a custom token and posts
// { type: 'nativeAuth', customToken }. When the web signs out (or loads signed
// out) it posts { type: 'nativeSignOut' }. Token events are debounced and the
// same uid is re-sent at most every few minutes, so a burst of refreshes sends
// one message. App only: startNativeAuthSync() does nothing on the web.

export const NATIVE_AUTH_DEBOUNCE_MS = 1500;
export const NATIVE_AUTH_MIN_INTERVAL_MS = 5 * 60 * 1000;

export interface SyncUser {
  uid: string;
  getIdToken: () => Promise<string>;
}

export interface NativeAuthSyncDeps {
  /** Subscribes to sign-in, sign-out and ID-token refresh. Returns the unsubscribe. */
  subscribe: (callback: (user: SyncUser | null) => void) => () => void;
  /** The uid signed in right now (checked again before posting). */
  currentUid: () => string | null;
  /** Exchanges an ID token for a custom token, or null on any failure. */
  fetchCustomToken: (idToken: string) => Promise<string | null>;
  post: (message: WebToNativeMessage) => boolean;
  /** Told which uid the shell now holds (null after sign-out). */
  onNativeAuth?: (uid: string | null) => void;
  now?: () => number;
}

/** The sync loop with its effects injected. Returns the stop function. */
export function createNativeAuthSync(deps: NativeAuthSyncDeps): () => void {
  const now = deps.now ?? Date.now;
  // 'unknown' until the first auth event, then 'signedOut' or the signed-in uid.
  let state: string = 'unknown';
  let timer: ReturnType<typeof setTimeout> | null = null;
  let generation = 0;
  let lastSentUid: string | null = null;
  let lastSentAt = 0;
  let stopped = false;

  const clearTimer = () => {
    if (timer) clearTimeout(timer);
    timer = null;
  };

  const send = async (user: SyncUser, gen: number) => {
    if (user.uid === lastSentUid && now() - lastSentAt < NATIVE_AUTH_MIN_INTERVAL_MS) return;
    let customToken: string | null = null;
    try {
      customToken = await deps.fetchCustomToken(await user.getIdToken());
    } catch {
      customToken = null;
    }
    // Dropped if the person signed out or switched accounts while it ran.
    if (!customToken || stopped || gen !== generation || deps.currentUid() !== user.uid) return;
    if (!deps.post({ type: 'nativeAuth', customToken })) return;
    lastSentUid = user.uid;
    lastSentAt = now();
    deps.onNativeAuth?.(user.uid);
  };

  const unsubscribe = deps.subscribe((user) => {
    if (stopped) return;
    clearTimer();
    if (!user) {
      generation += 1;
      lastSentUid = null;
      lastSentAt = 0;
      if (state !== 'signedOut') {
        state = 'signedOut';
        deps.post({ type: 'nativeSignOut' });
        deps.onNativeAuth?.(null);
      }
      return;
    }
    if (state !== user.uid) generation += 1;
    state = user.uid;
    const gen = generation;
    timer = setTimeout(() => {
      timer = null;
      void send(user, gen);
    }, NATIVE_AUTH_DEBOUNCE_MS);
  });

  return () => {
    stopped = true;
    clearTimer();
    unsubscribe();
  };
}

async function fetchCustomToken(idToken: string): Promise<string | null> {
  const res = await fetch('/api/portal/auth/custom-token', {
    method: 'POST',
    headers: { Authorization: `Bearer ${idToken}` },
    cache: 'no-store',
  });
  if (!res.ok) return null;
  const body = (await res.json().catch(() => null)) as { token?: unknown } | null;
  return typeof body?.token === 'string' && body.token ? body.token : null;
}

/** Starts the sync inside the app. A no-op (returns a no-op) on the web or without Firebase Auth. */
export function startNativeAuthSync(): () => void {
  if (typeof window === 'undefined' || !isNativeApp() || !auth) return () => {};
  const firebaseAuth = auth;
  return createNativeAuthSync({
    subscribe: (callback) => onIdTokenChanged(firebaseAuth, (user) => callback(user)),
    currentUid: () => firebaseAuth.currentUser?.uid ?? null,
    fetchCustomToken,
    post: postToNative,
    onNativeAuth: setNativeAuthUid,
  });
}
