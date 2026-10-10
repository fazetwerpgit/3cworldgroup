'use client';

import { auth } from '@/lib/firebase/config';
import { isStandaloneApp } from '@/lib/pwa/standalone';

/**
 * Health beacon: tells the server what this device saw (users/{uid}.pushHealth),
 * so silent delivery failures are diagnosable and the owner's Notifications list
 * stays current. Sent on every app open and after a "Turn on" tap.
 */
export async function reportPushHealth({
  supported,
  permission,
  result,
}: {
  supported: boolean;
  permission: string;
  result: string;
}): Promise<void> {
  try {
    const idToken = await auth?.currentUser?.getIdToken();
    await fetch('/api/portal/push/health', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken ?? ''}` },
      body: JSON.stringify({ supported, permission, result, standalone: isStandaloneApp() }),
    });
  } catch {
    // Diagnostics must never break the app.
  }
}

/** Notification.permission, or 'no-api' where the API does not exist (an iPhone Safari tab). */
export function currentPermission(): NotificationPermission | 'no-api' {
  return typeof Notification !== 'undefined' ? Notification.permission : 'no-api';
}
