'use client';

import { auth } from '@/lib/firebase/config';
import { NATIVE_PUSH_PLATFORM } from '@/lib/push/pushTargets';
import { reportPushHealth } from '@/lib/push/reportPushHealth';
import { NativeBridgeError, requestNative, type NativePushPermission, type PushTokenResult } from './bridge';
import { isNativeApp } from './isNativeApp';

// Native push for the 3C iOS app (SPEC A4). The shell owns the APNs/FCM token;
// the web registers it against the signed-in user as platform 'ios-native'
// (users/{uid}.nativePushTokens) and reports push health like the PWA does.

const LAST_TOKEN_KEY = '3c-native-push-token';

function readLastToken(): string | null {
  try {
    return window.localStorage.getItem(LAST_TOKEN_KEY);
  } catch {
    return null;
  }
}

function writeLastToken(token: string | null) {
  try {
    if (token) window.localStorage.setItem(LAST_TOKEN_KEY, token);
    else window.localStorage.removeItem(LAST_TOKEN_KEY);
  } catch {
    // Storage blocked: sign-out just cannot remove the token; FCM prunes it later.
  }
}

/** Stores the app's push token on the signed-in user. */
export async function registerNativePushToken(token: string): Promise<boolean> {
  if (!isNativeApp()) return false;
  try {
    const idToken = await auth?.currentUser?.getIdToken();
    if (!idToken) return false;
    const res = await fetch('/api/portal/push/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
      body: JSON.stringify({ token, platform: NATIVE_PUSH_PLATFORM }),
    });
    if (res.ok) writeLastToken(token);
    return res.ok;
  } catch {
    return false;
  }
}

// One page load asks the shell several times without a tap (the bridge host's
// sync after sign-in, the top bar's notification hint, Settings' push row, a
// focus event). Those silent asks share one pushToken message: a reply is
// reused while in flight and for a few seconds after it lands. A tap
// (prompt: true) always asks afresh and drops the shared reply.
const QUIET_REUSE_MS = 5000;
let quietAsk: { promise: Promise<PushTokenResult>; settledAt: number | null } | null = null;
let quietSync: { promise: Promise<NativePushOutcome>; settledAt: number | null } | null = null;

function fresh(entry: { settledAt: number | null } | null): boolean {
  return !!entry && (entry.settledAt === null || Date.now() - entry.settledAt < QUIET_REUSE_MS);
}

/** The shell's push token without prompting, shared across callers (see above). */
function askQuietly(): Promise<PushTokenResult> {
  if (quietAsk && fresh(quietAsk)) return quietAsk.promise;
  const entry: { promise: Promise<PushTokenResult>; settledAt: number | null } = {
    promise: requestNative<'pushToken'>({ type: 'pushToken', prompt: false }),
    settledAt: null,
  };
  quietAsk = entry;
  entry.promise.then(
    () => {
      entry.settledAt = Date.now();
    },
    () => {
      // A failure is not reused: the next caller asks again.
      if (quietAsk === entry) quietAsk = null;
    }
  );
  return entry.promise;
}

/** Test-only: forget the shared silent replies. */
export function __resetNativePushForTests(): void {
  quietAsk = null;
  quietSync = null;
}

export type NativePushOutcome = { state: 'on' } | { state: 'off'; permission: NativePushPermission } | { state: 'error'; message: string };

/**
 * Asks the shell for the push token and registers it. `prompt: true` only from
 * a user tap (the shell may then show the iOS permission question); the silent
 * run on app open passes false and only picks up an already-granted token.
 */
export function syncNativePush({ prompt }: { prompt: boolean }): Promise<NativePushOutcome> {
  if (!isNativeApp()) return Promise.resolve({ state: 'error', message: 'Not running in the 3C app.' });
  if (prompt) {
    quietAsk = null;
    quietSync = null;
    return runSync(true);
  }
  // Silent syncs in one load register the token and report health once.
  if (quietSync && fresh(quietSync)) return quietSync.promise;
  const entry: { promise: Promise<NativePushOutcome>; settledAt: number | null } = { promise: runSync(false), settledAt: null };
  quietSync = entry;
  void entry.promise.then((outcome) => {
    if (outcome.state === 'error' && quietSync === entry) quietSync = null;
    else entry.settledAt = Date.now();
  });
  return entry.promise;
}

async function runSync(prompt: boolean): Promise<NativePushOutcome> {
  let outcome: NativePushOutcome;
  let permission: string = 'unknown';
  let result: string;
  try {
    const reply = prompt ? await requestNative<'pushToken'>({ type: 'pushToken', prompt: true }) : await askQuietly();
    permission = reply.permission;
    if (reply.token) {
      const ok = await registerNativePushToken(reply.token);
      outcome = ok ? { state: 'on' } : { state: 'error', message: "Couldn't save this phone for notifications. Try again." };
      result = ok ? 'enabled / native' : 'failed / register';
    } else {
      outcome = { state: 'off', permission: reply.permission };
      result = `no-token / ${reply.permission}`;
    }
  } catch (err) {
    const code = err instanceof NativeBridgeError ? err.code : 'failed';
    if (code === 'denied') permission = 'denied';
    outcome =
      code === 'denied'
        ? { state: 'off', permission: 'denied' }
        : { state: 'error', message: "Couldn't turn on notifications. Try again." };
    result = `failed / ${code}`;
  }
  await reportPushHealth({ supported: true, permission, result, platform: NATIVE_PUSH_PLATFORM });
  return outcome;
}

/**
 * Read-only: whether the app has never been asked for notifications on this
 * phone (no token, permission undetermined). Registers nothing and reports
 * nothing, so it is safe to call on every focus.
 */
export async function nativePushNotAskedYet(): Promise<boolean> {
  if (!isNativeApp()) return false;
  try {
    const reply = await askQuietly();
    return !reply.token && reply.permission === 'undetermined';
  } catch {
    return false;
  }
}

/** Sign-out: take this phone's token off the account. Best-effort. */
export async function unregisterNativePush(): Promise<void> {
  if (!isNativeApp()) return;
  const token = readLastToken();
  if (!token) return;
  try {
    const idToken = await auth?.currentUser?.getIdToken();
    if (!idToken) return;
    await fetch('/api/portal/push/register', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
      body: JSON.stringify({ token, platform: NATIVE_PUSH_PLATFORM }),
    });
    writeLastToken(null);
  } catch {
    // The token stays until FCM reports it dead.
  }
}
