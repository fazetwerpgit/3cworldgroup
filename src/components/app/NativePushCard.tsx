'use client';

import { useEffect, useState } from 'react';
import { Check } from 'lucide-react';
import { syncNativePush } from '@/lib/app/nativePush';
import s from '@/components/portal/rep/rep.module.css';
import p from '@/components/portal/rep/rep-page.module.css';
import st from '@/components/portal/rep/rep-settings.module.css';

type State = 'checking' | 'off' | 'blocked' | 'on' | 'working';

// Settings row inside the 3C iOS app (replaces the web push card there). The
// iOS permission question only ever comes from the "Turn on" tap.
export default function NativePushCard() {
  const [state, setState] = useState<State>('checking');
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    void syncNativePush({ prompt: false }).then((outcome) => {
      if (cancelled) return;
      if (outcome.state === 'on') setState('on');
      else if (outcome.state === 'off' && outcome.permission === 'denied') setState('blocked');
      else setState('off');
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const enable = async () => {
    setState('working');
    setError('');
    const outcome = await syncNativePush({ prompt: true });
    if (outcome.state === 'on') {
      setState('on');
    } else if (outcome.state === 'off') {
      setState(outcome.permission === 'denied' ? 'blocked' : 'off');
    } else {
      setError(outcome.message);
      setState('off');
    }
  };

  return (
    <div className={st.setting}>
      <div className={st.settingText}>
        <span className={st.settingTitle}>Push notifications</span>
        <span className={st.settingSub}>
          {state === 'blocked'
            ? 'Notifications are off for 3C. Turn them on in iPhone Settings > Notifications > 3C.'
            : 'Mentions, DMs and form activity on this phone.'}
        </span>
      </div>
      {state === 'on' ? (
        <span className={st.on}>
          <Check size={16} aria-hidden="true" /> On
        </span>
      ) : state === 'blocked' ? null : (
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
