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
