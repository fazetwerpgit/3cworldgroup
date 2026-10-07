'use client';

import { useEffect, useState } from 'react';
import { Bell, Share, SquarePlus } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { pushSupported } from '@/lib/firebase/messaging';
import { enablePushOnDevice } from '@/lib/push/enablePushOnDevice';
import { PHONE_SETUP_SNOOZE_KEY, phoneSetupStep, type PhoneSetupStep } from '@/lib/push/pushPrompt';
import { isIosSafari } from '@/lib/pwa/addToHomeScreen';
import { isStandaloneApp } from '@/lib/pwa/standalone';
import { BodyLayer } from './BodyLayer';
import s from './rep.module.css';
import x from './phone-setup.module.css';

/**
 * Gets a phone fully set up the moment the portal opens: on iPhone Safari, the
 * steps to add it to the home screen; in the installed app, one big button for
 * notifications (the tap is the gesture iOS needs before it shows its own Allow
 * question), or the phone-settings steps if the phone already said no.
 * "Not now" brings it back the next day.
 */
export function PhoneSetupSheet() {
  const { user, loading } = useAuth();
  const active = !loading && user?.status === 'active';
  const [step, setStep] = useState<PhoneSetupStep | null>(null);
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
        snoozedAt = window.localStorage.getItem(PHONE_SETUP_SNOOZE_KEY);
      } catch {
        // Storage blocked: show it anyway.
      }
      setStep(
        phoneSetupStep({
          active,
          supported,
          permission: supported ? Notification.permission : 'denied',
          standalone: isStandaloneApp(),
          iosSafari: isIosSafari(navigator.userAgent),
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
      window.localStorage.setItem(PHONE_SETUP_SNOOZE_KEY, String(Date.now()));
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
        <section className={s.sheet} role="dialog" aria-modal="true" aria-labelledby="phone-setup-title" data-step={step}>
          <div className={s.sheetHandle} aria-hidden="true" />
          <div className={x.body}>
            <span className={x.badge} aria-hidden="true">
              {step === 'install' ? <SquarePlus size={28} /> : <Bell size={28} />}
            </span>
            <h2 id="phone-setup-title" className={x.title}>
              {step === 'install' ? 'Add 3C to your home screen' : 'Turn on notifications'}
            </h2>

            {step === 'install' && (
              <>
                <p className={x.text}>
                  It opens like an app, keeps you signed in, and is the only way an iPhone can get chat and install
                  alerts. Takes 10 seconds:
                </p>
                <ol className={x.steps}>
                  <li>
                    Tap the <b>Share</b> button <Share size={16} className={x.inlineIcon} aria-label="(square with an arrow)" /> at
                    the bottom of Safari.
                  </li>
                  <li>
                    Scroll down and tap <b>Add to Home Screen</b>, then <b>Add</b>.
                  </li>
                  <li>
                    Open <b>3C Console</b> from your home screen. It will ask about notifications next.
                  </li>
                </ol>
              </>
            )}

            {step === 'ask' && (
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
            )}

            {step === 'settings' && (
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
