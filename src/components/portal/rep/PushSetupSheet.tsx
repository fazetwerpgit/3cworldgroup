'use client';

import { useEffect, useState } from 'react';
import { Bell } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { pushSupported } from '@/lib/firebase/messaging';
import { enablePushOnDevice } from '@/lib/push/enablePushOnDevice';
import { PUSH_SETUP_SNOOZE_KEY, pushSetupStep, type PushSetupStep } from '@/lib/push/pushPrompt';
import { isStandaloneApp } from '@/lib/pwa/standalone';
import { BodyLayer } from './BodyLayer';
import s from './rep.module.css';
import x from './push-setup.module.css';

/**
 * Asks for notifications the moment the installed app opens, as one big button
 * (the tap is the user gesture iOS requires before it will show its own Allow
 * question). A phone that already said no gets the steps to turn them on in
 * its own Settings instead. "Not now" brings it back the next day.
 */
export function PushSetupSheet() {
  const { user, loading } = useAuth();
  const active = !loading && user?.status === 'active';
  const [step, setStep] = useState<PushSetupStep | null>(null);
  const [working, setWorking] = useState(false);
  const [failed, setFailed] = useState(false);
  const iphone = typeof navigator !== 'undefined' && /iPhone|iPad/.test(navigator.userAgent);

  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    void (async () => {
      const supported = await pushSupported();
      if (cancelled) return;
      let snoozedAt: string | null = null;
      try {
        snoozedAt = window.localStorage.getItem(PUSH_SETUP_SNOOZE_KEY);
      } catch {
        // Storage blocked: ask anyway.
      }
      setStep(
        pushSetupStep({
          active,
          supported,
          permission: supported ? Notification.permission : 'denied',
          standalone: isStandaloneApp(),
          snoozedAt,
          now: Date.now(),
        })
      );
    })();
    return () => {
      cancelled = true;
    };
  }, [active]);

  if (!step) return null;

  const notNow = () => {
    try {
      window.localStorage.setItem(PUSH_SETUP_SNOOZE_KEY, String(Date.now()));
    } catch {
      // Hide for this visit only.
    }
    setStep(null);
  };

  const turnOn = async () => {
    setWorking(true);
    setFailed(false);
    const result = await enablePushOnDevice();
    setWorking(false);
    if (result === 'enabled') setStep(null);
    // They tapped "Don't Allow": the phone will never ask again, so show where to fix it.
    else if (result === 'blocked') setStep(Notification.permission === 'denied' ? 'settings' : 'ask');
    else setFailed(true);
  };

  return (
    <BodyLayer>
      <div className={s.backdrop}>
        <section className={s.sheet} role="dialog" aria-modal="true" aria-labelledby="push-setup-title">
          <div className={s.sheetHandle} aria-hidden="true" />
          <div className={x.body}>
            <span className={x.bell} aria-hidden="true">
              <Bell size={28} />
            </span>
            <h2 id="push-setup-title" className={x.title}>
              Turn on notifications
            </h2>
            {step === 'ask' ? (
              <>
                <p className={x.text}>
                  Get a ping on this phone for team chat, install dates, missed installs and cancellations. One tap, then
                  tap <b>Allow</b>.
                </p>
                {failed && (
                  <p className={x.error} role="alert">
                    That didn&apos;t go through. Try once more.
                  </p>
                )}
                <button type="button" className={`${s.btnPrimary} ${s.btnBlock}`} disabled={working} onClick={() => void turnOn()}>
                  {working ? 'Turning on…' : 'Turn on notifications'}
                </button>
              </>
            ) : (
              <>
                <p className={x.text}>This phone has notifications off for the 3C app. Turn them on in the phone&apos;s settings:</p>
                <ol className={x.steps}>
                  {iphone ? (
                    <>
                      <li>Open the iPhone <b>Settings</b> app.</li>
                      <li>Tap <b>Notifications</b>, then <b>3C Console</b>.</li>
                      <li>Turn on <b>Allow Notifications</b>.</li>
                    </>
                  ) : (
                    <>
                      <li>Press and hold the <b>3C Console</b> icon on your home screen.</li>
                      <li>Tap <b>App info</b>, then <b>Notifications</b>.</li>
                      <li>Turn notifications on.</li>
                    </>
                  )}
                </ol>
              </>
            )}
            <button type="button" className={`${s.btnSecondary} ${s.btnBlock}`} disabled={working} onClick={notNow}>
              Not now
            </button>
          </div>
        </section>
      </div>
    </BodyLayer>
  );
}
