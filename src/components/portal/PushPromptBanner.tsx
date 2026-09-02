'use client';

import { useCallback, useEffect, useState } from 'react';
import { Bell } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { pushSupported } from '@/lib/firebase/messaging';
import { enablePushOnDevice } from '@/lib/push/enablePushOnDevice';
import { PUSH_PROMPT_SNOOZE_KEY, shouldShowPushPrompt } from '@/lib/push/pushPrompt';
import '@/styles/sweep-rep-b.css';

type State = 'ready' | 'working' | 'failed';

export function usePushPromptVisible() {
  const { user, loading } = useAuth();
  const [visible, setVisible] = useState<boolean | null>(null);
  const active = user?.status === 'active';

  useEffect(() => {
    if (loading || !active) return;
    let cancelled = false;
    void (async () => {
      const supported = await pushSupported();
      if (cancelled) return;
      let snoozedAt: string | null = null;
      try {
        snoozedAt = window.localStorage.getItem(PUSH_PROMPT_SNOOZE_KEY);
      } catch {
        // If storage is unavailable, the prompt can still be shown.
      }
      setVisible(shouldShowPushPrompt({
        active,
        supported,
        permission: supported ? Notification.permission : 'denied',
        snoozedAt,
        now: Date.now(),
      }));
    })();
    return () => {
      cancelled = true;
    };
  }, [active, loading]);

  const hide = useCallback(() => setVisible(false), []);
  const resolvedVisible = loading ? null : active ? visible : false;
  return [resolvedVisible, hide] as const;
}

// One-time nudge to turn on push, so a rep doesn't have to find the Settings card.
// It cannot fire the native dialog itself: browsers (iOS PWA especially) only allow
// Notification.requestPermission() from a user gesture, so the "Turn on" button is
// the gesture. Shows only while the permission is still undecided — a granted or
// denied permission is never 'default' again, so the prompt retires on its own.
export default function PushPromptBanner({
  visible,
  onDismiss,
}: {
  visible: boolean | null;
  onDismiss: () => void;
}) {
  const [state, setState] = useState<State>('ready');

  const turnOn = useCallback(async () => {
    setState('working');
    const result = await enablePushOnDevice();
    // 'blocked' means they declined the native dialog — permission is 'denied' now, so
    // hiding is final. Only a failed registration is worth offering a retry for.
    if (result === 'failed') {
      setState('failed');
      return;
    }
    onDismiss();
  }, [onDismiss]);

  const notNow = useCallback(() => {
    try {
      window.localStorage.setItem(PUSH_PROMPT_SNOOZE_KEY, String(Date.now()));
    } catch {
      // Ignore storage failures; hide for this visit.
    }
    onDismiss();
  }, [onDismiss]);

  if (visible !== true) return null;

  return (
    <div className="portal-push-prompt portal-enter" role="region" aria-label="Turn on notifications">
      <div className="portal-push-prompt-card">
        <span className="portal-push-prompt-bell" aria-hidden="true">
          <Bell />
        </span>
        <div className="portal-push-prompt-body">
          <p className="portal-push-prompt-text">
            {state === 'failed'
              ? 'Could not turn them on. Please try again.'
              : 'Get chat and sale alerts on this phone'}
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
      </div>
    </div>
  );
}
