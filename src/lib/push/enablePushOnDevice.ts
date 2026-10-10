'use client';

import { auth } from '@/lib/firebase/config';
import { requestPushTokenDetailed } from '@/lib/firebase/messaging';

// 'blocked' means the user said no to the native permission dialog (or push isn't
// configured); 'failed' means we never got the token registered against the account.
export type EnablePushResult = 'enabled' | 'blocked' | 'failed';

// Turns push on for THIS device: native permission prompt, FCM token, then register
// the token to the signed-in user. Shared by the settings card and the first-run
// prompt so the token-register call has exactly one implementation. Must be called
// from a user gesture — browsers only allow Notification.requestPermission() there.
export async function enablePushOnDevice(): Promise<EnablePushResult> {
  return (await enablePushOnDeviceDetailed()).result;
}

// Same, plus the token-layer detail string for the push-health beacon.
export async function enablePushOnDeviceDetailed(): Promise<{
  result: EnablePushResult;
  detail: string;
}> {
  try {
    const { token: fcmToken, detail } = await requestPushTokenDetailed();
    if (!fcmToken) return { result: 'blocked', detail };

    const idToken = await auth?.currentUser?.getIdToken();
    const res = await fetch('/api/portal/push/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken ?? ''}` },
      body: JSON.stringify({ token: fcmToken }),
    });
    if (!res.ok) return { result: 'failed', detail: `register-http-${res.status}` };
    return { result: 'enabled', detail };
  } catch (error) {
    return {
      result: 'failed',
      detail: error instanceof Error ? `${error.name}: ${error.message}`.slice(0, 200) : 'unknown',
    };
  }
}

// Sign-out: detach THIS device's FCM token from the signed-in user so a shared
// phone stops getting their pushes. Runs only when permission is already granted
// (so it never prompts), must run before Firebase sign-out (needs the ID token),
// and is best-effort: a failure never blocks signing out.
export async function unregisterPushOnDevice(): Promise<void> {
  try {
    if (typeof window === 'undefined' || !('Notification' in window)) return;
    if (Notification.permission !== 'granted') return;
    const idToken = await auth?.currentUser?.getIdToken();
    if (!idToken) return;
    const { token: fcmToken } = await requestPushTokenDetailed();
    if (!fcmToken) return;
    await fetch('/api/portal/push/register', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
      body: JSON.stringify({ token: fcmToken }),
    });
  } catch {
    // Best-effort; the token stays until FCM reports it dead.
  }
}

// The "Turn on notifications" tap. Asks FIRST, synchronously inside the click
// handler: iOS only shows its Allow question from a user gesture, and an await
// before requestPermission() (enablePushOnDeviceDetailed awaits Firebase setup
// first) can lose the gesture. Then registers through the shared path, which
// sees 'granted' and does not ask again.
export async function askAndEnablePush(): Promise<{
  result: EnablePushResult;
  permission: NotificationPermission;
  detail: string;
}> {
  let permission: NotificationPermission;
  try {
    permission = await Notification.requestPermission();
  } catch (error) {
    return {
      result: 'failed',
      permission: Notification.permission,
      detail: error instanceof Error ? `request-threw: ${error.message}`.slice(0, 200) : 'request-threw',
    };
  }
  if (permission !== 'granted') return { result: 'blocked', permission, detail: `permission-${permission}` };
  const { result, detail } = await enablePushOnDeviceDetailed();
  return { result, permission, detail };
}
