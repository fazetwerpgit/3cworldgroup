'use client';

import { useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { isNativeApp, useIsNativeApp } from '@/lib/app/isNativeApp';
import { installNativeReceiver, onNativeMessage } from '@/lib/app/bridge';
import { installAppLinkHandling } from '@/lib/app/links';
import { registerNativePushToken, syncNativePush } from '@/lib/app/nativePush';
import { clearNativeExtras, signalAppReady } from '@/lib/app/shellExtras';
import NativeBadgeSync from './NativeBadgeSync';

/** Routes whose page sends `ready` itself, once its real content renders. */
export const SELF_READY_PATHS = ['/portal', '/portal/dashboard'];

// Mounted once in the portal layout. Inside the 3C iOS app it installs the
// bridge receiver and in-app link handling, picks up an already-granted push
// token after sign-in (never prompts: that only happens from a tap in
// Settings), and stores a rotated token the shell reports. On the web every
// effect returns at its first line, so it does nothing. Renders nothing.
export default function AppBridgeHost() {
  const { user, loading } = useAuth();
  const signedIn = !loading && !!user;
  const syncedFor = useRef<string | null>(null);
  const inApp = useIsNativeApp();
  const pathname = usePathname();

  useEffect(() => {
    if (!isNativeApp()) return;
    installNativeReceiver();
    return installAppLinkHandling();
  }, []);

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

  // Signed out (or the session ended): clear the icon badge and the widget.
  useEffect(() => {
    if (isNativeApp() && !loading && !user) clearNativeExtras();
  }, [loading, user]);

  // Splash: the login page and the dashboard send `ready` once their content
  // is up. Any other first page (a notification tap, a quick action) sends it
  // once auth has resolved and the page itself is rendering.
  useEffect(() => {
    if (!loading && !SELF_READY_PATHS.includes(pathname ?? '')) signalAppReady();
  }, [loading, pathname]);

  return inApp && signedIn ? <NativeBadgeSync /> : null;
}
