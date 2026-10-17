'use client';

import { useEffect, useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { isNativeApp } from '@/lib/app/isNativeApp';
import { installNativeReceiver, onNativeMessage } from '@/lib/app/bridge';
import { installAppLinkHandling } from '@/lib/app/links';
import { registerNativePushToken, syncNativePush } from '@/lib/app/nativePush';
import { installStatusBarSync } from '@/lib/app/statusBar';
import { installResumeMotionReset } from '@/lib/app/appVisibility';
import AppNotice from './AppNotice';

// Mounted once in the portal layout. Inside the 3C iOS app it installs the
// bridge receiver and in-app link handling, picks up an already-granted push
// token after sign-in (never prompts: that only happens from a tap in
// Settings), stores a rotated token the shell reports, and keeps the iOS
// status bar style in step with the page theme. On the web every
// effect returns at its first line, so it does nothing. Renders only the
// in-app notice toast (nothing on the web).
export default function AppBridgeHost() {
  const { user, loading } = useAuth();
  const signedIn = !loading && !!user;
  const syncedFor = useRef<string | null>(null);

  useEffect(() => {
    if (!isNativeApp()) return;
    installNativeReceiver();
    const uninstallLinks = installAppLinkHandling();
    // Status bar text follows the page theme (BRIDGE.md statusBar).
    const uninstallStatusBar = installStatusBarSync();
    // Back after 30+ minutes away: replay the once-per-session reveals.
    const uninstallResumeReset = installResumeMotionReset();
    return () => {
      uninstallLinks();
      uninstallStatusBar();
      uninstallResumeReset();
    };
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

  // The shell's download toasts (BRIDGE.md notice); nothing on the web.
  return <AppNotice />;
}
