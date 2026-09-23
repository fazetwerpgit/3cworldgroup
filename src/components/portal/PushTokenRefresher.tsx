'use client';

import { useEffect, useRef, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { auth } from '@/lib/firebase/config';
import { pushSupported } from '@/lib/firebase/messaging';
import { enablePushOnDeviceDetailed } from '@/lib/push/enablePushOnDevice';

// Silently re-registers this device's FCM token on every portal open, but only
// when the user already granted notifications (permission === 'granted' means
// requestPermission() resolves without any UI). iOS can rotate the underlying
// push subscription when the installed app updates — the server then keeps
// sending to a token Apple silently drops, and nothing ever heals it because
// registration otherwise only runs from the explicit "Turn on" gesture. Never
// asks for permission itself (requestPushTokenDetailed only calls
// requestPermission when the permission isn't already granted, and this only
// runs when it is).
// An installed app is mostly resumed from the background rather than relaunched,
// so the refresh also re-runs when it returns to the foreground, at most this often.
const RESUME_REFRESH_INTERVAL_MS = 30 * 60 * 1000;

export default function PushTokenRefresher() {
  const { user, loading } = useAuth();
  const signedIn = !loading && !!user;
  const [resumeTick, setResumeTick] = useState(0);
  const lastRunRef = useRef(0);

  useEffect(() => {
    if (!signedIn) return;
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return;
      if (Date.now() - lastRunRef.current < RESUME_REFRESH_INTERVAL_MS) return;
      setResumeTick((tick) => tick + 1);
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [signedIn]);

  useEffect(() => {
    if (!signedIn) return;
    lastRunRef.current = Date.now();
    let cancelled = false;
    (async () => {
      const supported = await pushSupported();
      const permission =
        typeof Notification !== 'undefined' ? Notification.permission : 'no-api';
      let result = 'skipped';
      if (supported && !cancelled && permission === 'granted') {
        // Fire-and-forget: getToken returns the CURRENT subscription's token and
        // the register route arrayUnions it, so a rotated token gets stored and
        // an unchanged one is a no-op. Failures are non-fatal by design.
        const detailed = await enablePushOnDeviceDetailed();
        result = `${detailed.result} / ${detailed.detail}`;
      }
      // Health beacon: report what this device saw so silent delivery failures
      // are diagnosable server-side (users/{uid}.pushHealth).
      try {
        const idToken = await auth?.currentUser?.getIdToken();
        await fetch('/api/portal/push/health', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken ?? ''}` },
          body: JSON.stringify({
            supported,
            permission,
            result,
            standalone:
              window.matchMedia?.('(display-mode: standalone)').matches === true ||
              (window.navigator as unknown as { standalone?: boolean }).standalone === true,
          }),
        });
      } catch {
        // Diagnostics must never break the app.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [signedIn, resumeTick]);

  return null;
}
