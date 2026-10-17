'use client';

import { auth } from '@/lib/firebase/config';
import { NATIVE_PUSH_PLATFORM } from '@/lib/push/pushTargets';
import { reportPushHealth } from '@/lib/push/reportPushHealth';
import { NativeBridgeError, requestNative, type NativePushPermission } from './bridge';
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

export type NativePushOutcome = { state: 'on' } | { state: 'off'; permission: NativePushPermission } | { state: 'error'; message: string };

/**
 * Asks the shell for the push token and registers it. `prompt: true` only from
 * a user tap (the shell may then show the iOS permission question); the silent
 * run on app open passes false and only picks up an already-granted token.
 */
export async function syncNativePush({ prompt }: { prompt: boolean }): Promise<NativePushOutcome> {
  if (!isNativeApp()) return { state: 'error', message: 'Not running in the 3C app.' };
  let outcome: NativePushOutcome;
  let permission: string = 'unknown';
  let result: string;
  try {
    const reply = await requestNative<'pushToken'>({ type: 'pushToken', prompt });
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
    const reply = await requestNative<'pushToken'>({ type: 'pushToken', prompt: false });
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
