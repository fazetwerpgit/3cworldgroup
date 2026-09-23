'use client';

import { useEffect, useState } from 'react';
import { pushSupported } from '@/lib/firebase/messaging';
import { enablePushOnDevice } from '@/lib/push/enablePushOnDevice';
import { Check } from 'lucide-react';
import s from '@/components/portal/rep/rep.module.css';
import p from '@/components/portal/rep/rep-page.module.css';
import st from '@/components/portal/rep/rep-settings.module.css';

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
    <div className={st.setting}>
      <div className={st.settingText}>
        <span className={st.settingTitle}>Push notifications</span>
        <span className={st.settingSub}>Mentions, DMs and form activity on this device.</span>
      </div>
      {state === 'on' ? (
        <span className={st.on}>
          <Check size={16} aria-hidden="true" /> On
        </span>
      ) : (
        <button
          type="button"
          className={`${s.btnSecondary} ${st.settingBtn}`}
          onClick={enable}
          disabled={state === 'working' || state === 'checking'}
        >
          {state === 'working' ? 'Turning on…' : 'Turn on'}
        </button>
      )}
      {error && <p className={`${p.hint} ${p.hintError} ${st.settingWide}`} role="alert">{error}</p>}
    </div>
  );
}
