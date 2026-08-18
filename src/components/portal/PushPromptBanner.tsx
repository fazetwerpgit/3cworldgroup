'use client';

import { useCallback, useEffect, useState } from 'react';
import { Bell, X } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { pushSupported } from '@/lib/firebase/messaging';
import { enablePushOnDevice } from '@/lib/push/enablePushOnDevice';
import { PUSH_PROMPT_SNOOZE_KEY, shouldShowPushPrompt } from '@/lib/push/pushPrompt';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';

type State = 'hidden' | 'visible' | 'working' | 'failed';

// One-time nudge to turn on push, so a rep doesn't have to find the Settings card.
// It cannot fire the native dialog itself: browsers (iOS PWA especially) only allow
// Notification.requestPermission() from a user gesture, so the "Turn on" button is
// the gesture. Shows only while the permission is still undecided — a granted or
// denied permission is never 'default' again, so the prompt retires on its own.
export default function PushPromptBanner() {
  const { user, loading } = useAuth();
  const [state, setState] = useState<State>('hidden');

  const active = !loading && user?.status === 'active';

  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    (async () => {
      const supported = await pushSupported();
      if (cancelled) return;
      const show = shouldShowPushPrompt({
        active,
        supported,
        // Safe to read only once pushSupported() confirmed Notification exists.
        permission: supported ? Notification.permission : 'denied',
        snoozedAt: window.localStorage.getItem(PUSH_PROMPT_SNOOZE_KEY),
        now: Date.now(),
      });
      if (show) setState('visible');
    })();
    return () => {
      cancelled = true;
    };
  }, [active]);

  const turnOn = useCallback(async () => {
    setState('working');
    const result = await enablePushOnDevice();
    // 'blocked' means they declined the native dialog — permission is 'denied' now, so
    // hiding is final. Only a failed registration is worth offering a retry for.
    setState(result === 'failed' ? 'failed' : 'hidden');
  }, []);

  const notNow = useCallback(() => {
    window.localStorage.setItem(PUSH_PROMPT_SNOOZE_KEY, String(Date.now()));
    setState('hidden');
  }, []);

  if (state === 'hidden') return null;

  return (
    <div className="portal-push-prompt portal-enter" role="region" aria-label="Turn on notifications">
      <Card className="rounded-lg py-0 shadow-lg">
        <CardContent className="flex items-start gap-3 px-4 py-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-lime-100 text-lime-700 dark:bg-lime-500/20 dark:text-lime-300">
            <Bell className="h-4 w-4" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold">Turn on notifications?</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {state === 'failed'
                ? 'Could not turn them on. Please try again.'
                : 'Get mentions, DMs, and sale updates on this device.'}
            </p>
            <div className="mt-2.5 flex items-center gap-2">
              <Button type="button" size="sm" onClick={turnOn} disabled={state === 'working'}>
                {state === 'working' ? 'Turning on…' : 'Turn on'}
              </Button>
              <Button type="button" size="sm" variant="ghost" onClick={notNow}>
                Not now
              </Button>
            </div>
          </div>
          <button
            type="button"
            className="-mr-1 -mt-1 shrink-0 rounded-md p-1 text-muted-foreground hover:text-foreground"
            onClick={notNow}
            aria-label="Dismiss"
          >
            <X className="h-4 w-4" />
          </button>
        </CardContent>
      </Card>
    </div>
  );
}
