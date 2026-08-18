'use client';

import { useCallback, useEffect, useState } from 'react';
import { Bell, X } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { pushSupported } from '@/lib/firebase/messaging';
import { enablePushOnDevice } from '@/lib/push/enablePushOnDevice';
import { PUSH_PROMPT_SNOOZE_KEY, shouldShowPushPrompt } from '@/lib/push/pushPrompt';

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
      <div className="portal-push-prompt-card">
        <span className="portal-push-prompt-bell" aria-hidden="true">
          <Bell />
        </span>
        <div className="portal-push-prompt-body">
          <p className="portal-push-prompt-eyebrow">Notifications / turn on?</p>
          <p className="portal-push-prompt-text">
            {state === 'failed'
              ? 'Could not turn them on. Please try again.'
              : 'Get chat messages and sale updates on this device.'}
          </p>
          <div className="portal-push-prompt-actions">
            <button type="button" className="portal-push-prompt-primary" onClick={turnOn} disabled={state === 'working'}>
              {state === 'working' ? 'Turning on…' : 'Turn on'}
            </button>
            <button type="button" className="portal-push-prompt-quiet" onClick={notNow}>
              Not now
            </button>
          </div>
        </div>
        <button type="button" className="portal-push-prompt-close" onClick={notNow} aria-label="Dismiss">
          <X />
        </button>
      </div>
    </div>
  );
}
