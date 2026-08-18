'use client';

import { auth } from '@/lib/firebase/config';
import { requestPushToken } from '@/lib/firebase/messaging';

// 'blocked' means the user said no to the native permission dialog (or push isn't
// configured); 'failed' means we never got the token registered against the account.
export type EnablePushResult = 'enabled' | 'blocked' | 'failed';

// Turns push on for THIS device: native permission prompt, FCM token, then register
// the token to the signed-in user. Shared by the settings card and the first-run
// prompt so the token-register call has exactly one implementation. Must be called
// from a user gesture — browsers only allow Notification.requestPermission() there.
export async function enablePushOnDevice(): Promise<EnablePushResult> {
  try {
    const fcmToken = await requestPushToken();
    if (!fcmToken) return 'blocked';

    const idToken = await auth?.currentUser?.getIdToken();
    const res = await fetch('/api/portal/push/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken ?? ''}` },
      body: JSON.stringify({ token: fcmToken }),
    });
    if (!res.ok) return 'failed';
    return 'enabled';
  } catch {
    return 'failed';
  }
}
