'use client';

import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { isNativeApp } from '@/lib/app/isNativeApp';
import { advertiseBridgeFeature, installNativeReceiver, onNativeMessage } from '@/lib/app/bridge';
import { APP_NAVIGATE_EVENT, inAppRoute, installAppLinkHandling } from '@/lib/app/links';
import { registerNativePushToken, syncNativePush } from '@/lib/app/nativePush';

// Mounted once in the portal layout. Inside the 3C iOS app it installs the
// bridge receiver and in-app link handling, picks up an already-granted push
// token after sign-in (never prompts: that only happens from a tap in
// Settings), and stores a rotated token the shell reports. A tapped
// notification arrives as `navigate` and opens through the router, so the
// portal never reloads. On the web every effect returns at its first line, so
// it does nothing. Renders nothing.
export default function AppBridgeHost() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const signedIn = !loading && !!user;
  const syncedFor = useRef<string | null>(null);

  useEffect(() => {
    if (!isNativeApp()) return;
    installNativeReceiver();
    return installAppLinkHandling();
  }, []);

  useEffect(() => {
    if (!isNativeApp()) return;
    const stopListening = onNativeMessage((message) => {
      if (message.type !== 'navigate') return;
      const route = inAppRoute(message.url, window.location.href);
      if (!route) {
        // Not a portal page on this origin: load it the old way only when it
        // is still this host (the shell already refuses other hosts).
        try {
          if (new URL(message.url, window.location.href).host === window.location.host) window.location.assign(message.url);
        } catch {
          // Unparseable: nothing to open.
        }
        return;
      }
      router.push(route);
      // A page that is already mounted (the chat page opening another channel)
      // does not remount on a same-path push, so it hears about it here.
      window.dispatchEvent(new CustomEvent(APP_NAVIGATE_EVENT, { detail: route }));
    });
    const stopAdvertising = advertiseBridgeFeature('navigate');
    return () => {
      stopAdvertising();
      stopListening();
    };
  }, [router]);

  useEffect(() => {
    if (!isNativeApp() || !signedIn || !user) return;
    if (syncedFor.current !== user.uid) {
      syncedFor.current = user.uid;
      void syncNativePush({ prompt: false });
    }
    return onNativeMessage((message) => {
      if (message.type === 'pushToken') void registerNativePushToken(message.token);
    });
  }, [signedIn, user]);

  return null;
}
