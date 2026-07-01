'use client';

import { useEffect, useState } from 'react';
import { Bell, BellOff, Check } from 'lucide-react';
import { auth } from '@/lib/firebase/config';
import { pushSupported, requestPushToken } from '@/lib/firebase/messaging';
import { Button } from '@/components/ui/button';

type State = 'checking' | 'unsupported' | 'off' | 'on' | 'working';

// "Enable notifications on this device" — requests permission, gets an FCM token,
// registers it to the user. Dormant (shows unsupported) until NEXT_PUBLIC_FIREBASE_VAPID_KEY
// is set. Push notifications alert the team about @mentions, DMs, and form activity.
export default function PushNotificationsCard() {
  const [state, setState] = useState<State>('checking');
  const [error, setError] = useState('');

  useEffect(() => {
    (async () => {
      const supported = await pushSupported();
      if (!supported) {
        setState('unsupported');
        return;
      }
      setState(Notification.permission === 'granted' ? 'on' : 'off');
    })();
  }, []);

  const authedFetch = async (url: string, init?: RequestInit) => {
    const token = await auth?.currentUser?.getIdToken();
    return fetch(url, { ...init, headers: { ...(init?.headers || {}), Authorization: `Bearer ${token ?? ''}` } });
  };

  const enable = async () => {
    setState('working');
    setError('');
    try {
      const fcmToken = await requestPushToken();
      if (!fcmToken) {
        setError('Notifications were blocked. Enable them in your browser settings and try again.');
        setState('off');
        return;
      }
      const res = await authedFetch('/api/portal/push/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: fcmToken }),
      });
      if (!res.ok) throw new Error('register failed');
      setState('on');
    } catch {
      setError('Could not enable notifications. Please try again.');
      setState('off');
    }
  };

  if (state === 'unsupported') {
    // Hidden entirely until push is configured/supported, to avoid confusing copy.
    return null;
  }

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm dark:border-border dark:bg-card">
      <div className="flex items-start gap-3">
        <div className="flex size-10 items-center justify-center rounded-md border border-slate-200 bg-slate-50 text-[#0A1F44] dark:border-border dark:bg-muted dark:text-foreground">
          {state === 'on' ? <Bell className="size-5" /> : <BellOff className="size-5" />}
        </div>
        <div className="flex-1">
          <h2 className="text-lg font-semibold text-[#0A1F44] dark:text-foreground">Push Notifications</h2>
          <p className="mt-1 text-sm text-slate-600 dark:text-muted-foreground">
            Get notified on this device about @mentions, direct messages, and important activity —
            even when the app is closed.
          </p>
          {error && (
            <div className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-500/30 dark:bg-red-500/15 dark:text-red-300">
              {error}
            </div>
          )}
          <div className="mt-4">
            {state === 'on' ? (
              <div className="inline-flex items-center gap-2 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/15 dark:text-emerald-300">
                <Check className="size-4" />
                Notifications enabled on this device.
              </div>
            ) : (
              <Button
                type="button"
                onClick={enable}
                disabled={state === 'working' || state === 'checking'}
                className="bg-[#8dc63f] text-[#0A1F44] hover:bg-[#7ab82e]"
              >
                <Bell className="size-4" />
                {state === 'working' ? 'Enabling…' : 'Enable notifications'}
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
