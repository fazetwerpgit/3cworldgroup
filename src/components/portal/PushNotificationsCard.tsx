'use client';

import { useEffect, useState } from 'react';
import { pushSupported } from '@/lib/firebase/messaging';
import { enablePushOnDevice } from '@/lib/push/enablePushOnDevice';

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

  const enable = async () => {
    setState('working');
    setError('');
    const result = await enablePushOnDevice();
    if (result === 'enabled') {
      setState('on');
      return;
    }
    setError(
      result === 'blocked'
        ? 'Notifications were blocked. Enable them in your browser settings and try again.'
        : 'Could not enable notifications. Please try again.'
    );
    setState('off');
  };

  if (state === 'unsupported') {
    // Hidden entirely until push is configured/supported, to avoid confusing copy.
    return null;
  }

  return (
    <div className="member-line-toggle-row">
      <div>
        <strong>Push notifications</strong>
        <small>Mentions, DMs, activity.</small>
        {error && <small style={{ color: 'var(--member-line-red)' }}>{error}</small>}
      </div>
      {state === 'on' ? (
        <span className="member-line-chip lime">On</span>
      ) : (
        <button
          type="button"
          className="member-line-button small"
          onClick={enable}
          disabled={state === 'working' || state === 'checking'}
        >
          {state === 'working' ? 'Enabling…' : 'Enable'}
        </button>
      )}
    </div>
  );
}
