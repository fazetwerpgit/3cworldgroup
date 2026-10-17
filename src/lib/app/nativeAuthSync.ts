'use client';

import { onIdTokenChanged } from 'firebase/auth';
import { auth } from '@/lib/firebase/config';
import { hasNativeBridge, postToNative, requestNative } from './bridge';
import { isNativeApp } from './isNativeApp';
import { readCapabilities, setNativeAuth, subscribeNativeChat, type NativeAuthStatus } from './nativeChat';

// Keeps the 3C iOS shell's native Firebase Auth (used by the native chat
// screen) signed in as the same person as the web (docs/ios-app/BRIDGE.md).
//
// Only while the shell advertises nativeChat: on sign-in and on every ID-token
// refresh, the web asks POST /api/portal/auth/custom-token for a custom token
// and sends the request { type: 'nativeAuth', id, customToken }; the shell's ok
// reply is what marks native chat usable for that uid. When the web signs out
// (or loads signed out), or switches accounts after a token was sent, it posts
// { type: 'nativeSignOut' } first. The first auth event after a page load goes
// out at once; later ones are debounced, and the same uid is re-sent at most
// every few minutes. App only: startNativeAuthSync() does nothing on the web.

export const NATIVE_AUTH_DEBOUNCE_MS = 1500;
export const NATIVE_AUTH_MIN_INTERVAL_MS = 5 * 60 * 1000;

export interface SyncUser {
  uid: string;
  getIdToken: () => Promise<string>;
}

export interface NativeAuthSyncDeps {
  /** Subscribes to sign-in, sign-out and ID-token refresh. Returns the unsubscribe. */
  subscribe: (callback: (user: SyncUser | null) => void) => () => void;
  /** The uid signed in right now (checked again before acting on a result). */
  currentUid: () => string | null;
  /** True when a token may be fetched: the bridge is present and nativeChat is advertised. */
  canSync: () => boolean;
  /** Called whenever canSync() may have changed. Returns the unsubscribe. */
  onCanSyncChange: (callback: () => void) => () => void;
  /** Exchanges an ID token for a custom token, or null on any failure. */
  fetchCustomToken: (idToken: string) => Promise<string | null>;
  /** Sends the nativeAuth request; true only on the shell's ok reply. */
  sendNativeAuth: (customToken: string) => Promise<boolean>;
  postSignOut: () => void;
  setStatus: (status: NativeAuthStatus, uid?: string | null) => void;
  now?: () => number;
}

/** The sync loop with its effects injected. Returns the stop function. */
export function createNativeAuthSync(deps: NativeAuthSyncDeps): () => void {
  const now = deps.now ?? Date.now;
  // 'unknown' until the first auth event, then 'signedOut' or the signed-in uid.
  let state: string = 'unknown';
  let user: SyncUser | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let generation = 0;
  let inFlightGen: number | null = null;
  let lastSentUid: string | null = null;
  let lastSentAt = 0;
  let lastCanSync = deps.canSync();
  let stopped = false;

  const clearTimer = () => {
    if (timer) clearTimeout(timer);
    timer = null;
  };

  const stale = (target: SyncUser, gen: number) =>
    stopped || gen !== generation || deps.currentUid() !== target.uid;

  const send = async (target: SyncUser, gen: number) => {
    if (!deps.canSync() || inFlightGen === gen) return;
    if (target.uid === lastSentUid && now() - lastSentAt < NATIVE_AUTH_MIN_INTERVAL_MS) return;
    inFlightGen = gen;
    try {
      if (target.uid !== lastSentUid) deps.setStatus('pending');
      let customToken: string | null = null;
      try {
        customToken = await deps.fetchCustomToken(await target.getIdToken());
      } catch {
        customToken = null;
      }
      // Dropped if the person signed out or switched accounts while it ran.
      if (stale(target, gen)) return;
      if (!customToken) {
        if (target.uid !== lastSentUid) deps.setStatus('failed');
        return;
      }
      let ok = false;
      try {
        ok = await deps.sendNativeAuth(customToken);
      } catch {
        ok = false;
      }
      if (stale(target, gen)) return;
      if (ok) {
        lastSentUid = target.uid;
        lastSentAt = now();
        deps.setStatus('ok', target.uid);
      } else if (target.uid !== lastSentUid) {
        deps.setStatus('failed');
      }
    } finally {
      if (inFlightGen === gen) inFlightGen = null;
    }
  };

  const unsubscribe = deps.subscribe((next) => {
    if (stopped) return;
    clearTimer();
    const firstEvent = state === 'unknown';
    if (!next) {
      generation += 1;
      user = null;
      lastSentUid = null;
      lastSentAt = 0;
      if (state !== 'signedOut') {
        state = 'signedOut';
        deps.postSignOut();
        deps.setStatus('signedOut');
      }
      return;
    }
    if (state !== next.uid) {
      generation += 1;
      // Another account than the one the shell holds: sign it out before
      // fetching a token for the new one, so native chat never shows the old user.
      if (lastSentUid !== null && lastSentUid !== next.uid) {
        lastSentUid = null;
        lastSentAt = 0;
        deps.postSignOut();
        deps.setStatus('pending');
      }
    }
    state = next.uid;
    user = next;
    const gen = generation;
    if (firstEvent) {
      void send(next, gen);
      return;
    }
    timer = setTimeout(() => {
      timer = null;
      void send(next, gen);
    }, NATIVE_AUTH_DEBOUNCE_MS);
  });

  // nativeChat advertised after the auth event (a late capabilities message).
  const offCanSync = deps.onCanSyncChange(() => {
    const can = deps.canSync();
    const became = can && !lastCanSync;
    lastCanSync = can;
    if (became && user && !stopped) void send(user, generation);
  });

  return () => {
    stopped = true;
    clearTimer();
    unsubscribe();
    offCanSync();
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

async function sendNativeAuth(customToken: string): Promise<boolean> {
  try {
    await requestNative<'nativeAuth'>({ type: 'nativeAuth', customToken });
    return true;
  } catch {
    return false;
  }
}

/** Starts the sync inside the app. A no-op (returns a no-op) on the web or without Firebase Auth. */
export function startNativeAuthSync(): () => void {
  if (typeof window === 'undefined' || !isNativeApp() || !auth) return () => {};
  const firebaseAuth = auth;
  return createNativeAuthSync({
    subscribe: (callback) => onIdTokenChanged(firebaseAuth, (user) => callback(user)),
    currentUid: () => firebaseAuth.currentUser?.uid ?? null,
    canSync: () => hasNativeBridge() && readCapabilities().nativeChat === true,
    onCanSyncChange: subscribeNativeChat,
    fetchCustomToken,
    sendNativeAuth,
    postSignOut: () => {
      postToNative({ type: 'nativeSignOut' });
    },
    setStatus: setNativeAuth,
  });
}
