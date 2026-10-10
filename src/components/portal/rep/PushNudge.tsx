'use client';

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Bell, BellOff, Share, SquarePlus } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { pushConfigured, pushSupported } from '@/lib/firebase/messaging';
import { askAndEnablePush, enablePushOnDeviceDetailed } from '@/lib/push/enablePushOnDevice';
import {
  APP_NAME,
  NUDGE_SNOOZE_KEY,
  REQUIRED_SNOOZE_KEY,
  devicePushState,
  isIosDevice,
  nudgeView,
  type DevicePushState,
  type NudgeView,
} from '@/lib/push/pushNudge';
import { currentPermission, reportPushHealth } from '@/lib/push/reportPushHealth';
import { isIosSafari } from '@/lib/pwa/addToHomeScreen';
import { isStandaloneApp } from '@/lib/pwa/standalone';
import { BodyLayer } from './BodyLayer';
import s from './rep.module.css';
import x from './push-nudge.module.css';

/** How long "Notifications are on" stays up before the nudge goes. */
const DONE_MS = 2500;

type Phase = 'idle' | 'working' | 'failed' | 'done';
type NudgeState = Exclude<DevicePushState, 'ok'>;

function readStorage(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStorage(key: string, value: string) {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Storage blocked: hidden for this visit only.
  }
}

/**
 * Gets push working on THIS device, across the portal: an iPhone Safari tab is
 * told to add the app to the Home Screen; the installed app gets a "Turn on
 * notifications" button (the tap is the gesture iOS needs for its Allow
 * question); a phone that said no gets the Settings steps and is re-checked when
 * the app comes back to the foreground. A banner for most people ("Not now" =
 * 24h); a full-screen sheet for anyone an admin marked as required ("Not now" =
 * 1h). Goes for good once this device is registered.
 */
export function PushNudge() {
  const { user, loading } = useAuth();
  const eligible =
    !loading && !!user && (user.status === 'active' || (user.status === 'pending' && !!user.fieldRole));
  const required = user?.pushRequired === true;

  const [state, setState] = useState<DevicePushState | null>(null);
  const [view, setView] = useState<NudgeView | null>(null);
  const [phase, setPhase] = useState<Phase>('idle');
  const [check, setCheck] = useState(0);
  const lastState = useRef<DevicePushState | null>(null);
  const doneTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const doneRef = useRef(false);
  const shownRef = useRef(false);
  useEffect(() => {
    shownRef.current = !!view;
  }, [view]);

  // "Notifications are on." for a moment, then the nudge is gone.
  const finish = useCallback(() => {
    lastState.current = 'ok';
    doneRef.current = true;
    setPhase('done');
    if (doneTimer.current) clearTimeout(doneTimer.current);
    doneTimer.current = setTimeout(() => {
      doneRef.current = false;
      setView(null);
      setState('ok');
      setPhase('idle');
    }, DONE_MS);
  }, []);

  // Re-check on every return to the foreground: the required sheet comes back
  // once its hour is up, and a phone fixed in Settings is picked up.
  useEffect(() => {
    if (!eligible) return;
    const onVisible = () => {
      if (document.visibilityState === 'visible') setCheck((n) => n + 1);
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [eligible]);

  useEffect(() => () => {
    if (doneTimer.current) clearTimeout(doneTimer.current);
  }, []);

  useEffect(() => {
    if (!eligible) return;
    let cancelled = false;
    void (async () => {
      const supported = await pushSupported();
      if (cancelled) return;
      const permission = currentPermission();
      const next = devicePushState({
        ua: navigator.userAgent,
        standalone: isStandaloneApp(),
        supported,
        configured: pushConfigured(),
        permission,
      });
      const before = lastState.current;
      lastState.current = next;
      // Turned on in Settings while away: register now (no question, it is
      // already granted) so pushes start without waiting for the next refresh,
      // and say so if the nudge was up.
      if (next === 'ok' && before && before !== 'ok') {
        void enablePushOnDeviceDetailed().then(({ result, detail }) =>
          reportPushHealth({ supported, permission, result: `${result} / ${detail}` })
        );
        if (shownRef.current) {
          finish();
          return;
        }
      }
      // The success message stays up until its timer hides it.
      if (doneRef.current) return;
      setState(next);
      setView(
        nudgeView({
          state: next,
          required,
          bannerSnoozedAt: readStorage(NUDGE_SNOOZE_KEY),
          requiredSnoozedAt: readStorage(REQUIRED_SNOOZE_KEY),
          now: Date.now(),
        })
      );
    })();
    return () => {
      cancelled = true;
    };
  }, [eligible, required, check, finish]);

  const notNow = useCallback(() => {
    writeStorage(view === 'sheet' ? REQUIRED_SNOOZE_KEY : NUDGE_SNOOZE_KEY, String(Date.now()));
    setView(null);
  }, [view]);

  // Must stay a plain click handler: askAndEnablePush calls requestPermission()
  // before its first await, which is what keeps the iOS user gesture.
  const turnOn = useCallback(() => {
    setPhase('working');
    void askAndEnablePush().then(({ result, permission, detail }) => {
      void reportPushHealth({ supported: true, permission, result: `${result} / ${detail}` });
      if (result === 'enabled') {
        finish();
        return;
      }
      if (result === 'blocked') {
        // "Don't Allow" is final: only Settings can undo it. A dismissed
        // question leaves it undecided, so the button stays.
        const next: DevicePushState = permission === 'denied' ? 'blocked' : 'ask';
        lastState.current = next;
        setState(next);
        setPhase('idle');
        return;
      }
      setPhase('failed');
    });
  }, [finish]);

  if (!eligible || !view || !state) return null;
  // While the success message shows, keep drawing the step it came from.
  const shown: NudgeState = state === 'ok' ? 'ask' : state;
  const props = { state: shown, phase, onTurnOn: turnOn, onNotNow: notNow, ua: navigator.userAgent };
  return view === 'sheet' ? <PushRequiredSheet {...props} /> : <PushNudgeBanner {...props} />;
}

interface NudgeProps {
  state: NudgeState;
  phase: Phase;
  onTurnOn: () => void;
  onNotNow: () => void;
  ua: string;
}

const ICON: Record<NudgeState, ReactNode> = {
  install: <SquarePlus size={20} />,
  ask: <Bell size={20} />,
  blocked: <BellOff size={20} />,
};

function ShareIcon() {
  return <Share size={15} className={x.inlineIcon} aria-label="(the square with an arrow)" />;
}

/** The in-page banner: one row under the top bar. */
export function PushNudgeBanner({ state, phase, onTurnOn, onNotNow, ua }: NudgeProps) {
  const ios = isIosDevice(ua);
  const device = ios ? 'this phone' : 'this device';
  const done = phase === 'done';

  let title: string;
  let text: ReactNode = null;
  if (done) {
    title = 'Notifications are on.';
  } else if (state === 'install') {
    title = 'Get chat and sale alerts: add the 3C app to your Home Screen';
    text = (
      <>
        {isIosSafari(ua) ? 'Tap ' : 'Open this page in Safari, tap '}
        <b>Share</b> <ShareIcon />, then <b>Add to Home Screen</b>, then open <b>{APP_NAME}</b> from the new icon.
      </>
    );
  } else if (state === 'ask') {
    title = `Get chat and sale alerts on ${device}`;
    text = phase === 'failed' ? "That didn't go through. Try again." : (
      <>
        Tap the button, then <b>Allow</b>.
      </>
    );
  } else {
    title = `Notifications are off for 3C on ${device}`;
    text = ios ? (
      <>
        Open <b>Settings</b> → <b>Notifications</b> → <b>{APP_NAME}</b> and turn on <b>Allow Notifications</b>.
      </>
    ) : (
      'Allow notifications for this site in your browser settings, then come back.'
    );
  }

  return (
    <aside className={x.banner} aria-label="Notifications" data-state={done ? 'done' : state}>
      <span className={x.bannerIcon} aria-hidden="true">
        {done ? <Bell size={20} /> : ICON[state]}
      </span>
      <div className={x.bannerBody} role={done || phase === 'failed' ? 'status' : undefined}>
        <p className={x.bannerTitle}>{title}</p>
        {text ? <p className={x.bannerText}>{text}</p> : null}
        {done ? null : (
          <div className={x.bannerActions}>
            {state === 'ask' ? (
              <button
                type="button"
                className={`${s.btnPrimary} ${x.bannerPrimary}`}
                disabled={phase === 'working'}
                onClick={onTurnOn}
              >
                {phase === 'working' ? 'Turning on…' : 'Turn on notifications'}
              </button>
            ) : null}
            <button type="button" className={s.btnSecondary} disabled={phase === 'working'} onClick={onNotNow}>
              Not now
            </button>
          </div>
        )}
      </div>
    </aside>
  );
}

/** The required person's full-screen sheet, on <body> (fixed inside <main> breaks on iPhone). */
export function PushRequiredSheet({ state, phase, onTurnOn, onNotNow, ua }: NudgeProps) {
  const ios = isIosDevice(ua);
  const done = phase === 'done';
  // Once on, only the confirmation shows, whichever step it came from.
  const step = done ? null : state;
  const title = done
    ? 'Notifications are on'
    : state === 'install'
      ? 'Add 3C to your Home Screen'
      : state === 'ask'
        ? 'Turn on notifications'
        : 'Turn notifications back on';

  return (
    <BodyLayer>
      <div className={s.backdrop}>
        <section className={s.sheet} role="dialog" aria-modal="true" aria-labelledby="push-required-title" data-step={state}>
          <div className={s.sheetHandle} aria-hidden="true" />
          <div className={x.body}>
            <span className={x.badge} aria-hidden="true">
              {step === 'install' ? <SquarePlus size={28} /> : step === 'blocked' ? <BellOff size={28} /> : <Bell size={28} />}
            </span>
            <h2 id="push-required-title" className={x.title}>
              {title}
            </h2>
            {done ? (
              <p className={x.done} role="status">
                You&apos;ll get chat and sale alerts on this phone.
              </p>
            ) : (
              <p className={x.lead}>Your account needs notifications on, so you don&apos;t miss chat and sale alerts.</p>
            )}

            {step === 'install' && (
              <ol className={x.steps}>
                <li>
                  {isIosSafari(ua) ? 'Tap ' : 'Open this page in Safari, then tap '}
                  <b>Share</b> <ShareIcon /> at the bottom of the screen.
                </li>
                <li>
                  Tap <b>Add to Home Screen</b>, then <b>Add</b>.
                </li>
                <li>
                  Open <b>{APP_NAME}</b> from the new icon.
                </li>
              </ol>
            )}

            {step === 'ask' && (
              <>
                <p className={x.text}>
                  Tap the button, then tap <b>Allow</b>.
                </p>
                {phase === 'failed' && (
                  <p className={x.error} role="alert">
                    That didn&apos;t go through. Try again.
                  </p>
                )}
                <button
                  type="button"
                  className={`${s.btnPrimary} ${s.btnBlock}`}
                  disabled={phase === 'working'}
                  onClick={onTurnOn}
                >
                  {phase === 'working' ? 'Turning on…' : 'Turn on notifications'}
                </button>
              </>
            )}

            {step === 'blocked' && (
              <ol className={x.steps}>
                {ios ? (
                  <>
                    <li>
                      Open the iPhone <b>Settings</b> app.
                    </li>
                    <li>
                      Tap <b>Notifications</b>, then <b>{APP_NAME}</b>.
                    </li>
                    <li>
                      Turn on <b>Allow Notifications</b>, then come back here.
                    </li>
                  </>
                ) : (
                  <>
                    <li>Open this site&apos;s settings in your browser.</li>
                    <li>
                      Set <b>Notifications</b> to <b>Allow</b>.
                    </li>
                    <li>Come back here.</li>
                  </>
                )}
              </ol>
            )}

            {done ? null : (
              <button
                type="button"
                className={`${s.btnSecondary} ${s.btnBlock}`}
                disabled={phase === 'working'}
                onClick={onNotNow}
              >
                Not now
              </button>
            )}
          </div>
        </section>
      </div>
    </BodyLayer>
  );
}
