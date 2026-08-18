'use client';

import { useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { pushSupported } from '@/lib/firebase/messaging';
import { enablePushOnDevice } from '@/lib/push/enablePushOnDevice';

// Silently re-registers this device's FCM token on every portal open, but only
// when the user already granted notifications (permission === 'granted' means
// requestPermission() resolves without any UI). iOS can rotate the underlying
// push subscription when the installed app updates — the server then keeps
// sending to a token Apple silently drops, and nothing ever heals it because
// registration otherwise only runs from the explicit "Turn on" gesture.
export default function PushTokenRefresher() {
  const { user, loading } = useAuth();
  const signedIn = !loading && !!user;

  useEffect(() => {
    if (!signedIn) return;
    let cancelled = false;
    (async () => {
      if (!(await pushSupported())) return;
      if (cancelled || Notification.permission !== 'granted') return;
      // Fire-and-forget: getToken returns the CURRENT subscription's token and
      // the register route arrayUnions it, so a rotated token gets stored and
      // an unchanged one is a no-op. Failures are non-fatal by design.
      void enablePushOnDevice();
    })();
    return () => {
      cancelled = true;
    };
  }, [signedIn]);

  return null;
}
