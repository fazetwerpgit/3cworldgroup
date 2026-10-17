'use client';

import { useEffect, useRef } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { isNativeApp } from '@/lib/app/isNativeApp';
import { installNativeReceiver, onNativeMessage } from '@/lib/app/bridge';
import { installAppLinkHandling } from '@/lib/app/links';
import { registerNativePushToken, syncNativePush } from '@/lib/app/nativePush';
import { startNativeAuthSync } from '@/lib/app/nativeAuthSync';
import { CHAT_PATH, installCapabilityListener, openNativeChat, useSupportsNativeChat } from '@/lib/app/nativeChat';

// Mounted once in the portal layout. Inside the 3C iOS app it installs the
// bridge receiver and in-app link handling, picks up an already-granted push
// token after sign-in (never prompts: that only happens from a tap in
// Settings), and stores a rotated token the shell reports. For native chat it
// keeps the shell's Firebase Auth signed in as the web user (nativeAuth /
// nativeSignOut) and, once the shell advertises nativeChat, hands a landing on
// /portal/chat (a push deep link) to the native screen. On the web every
// effect returns at its first line, so it does nothing. Renders nothing.
export default function AppBridgeHost() {
  const { user, loading } = useAuth();
  const signedIn = !loading && !!user;
  const syncedFor = useRef<string | null>(null);
  const pathname = usePathname();
  const router = useRouter();
  const nativeChat = useSupportsNativeChat();

  useEffect(() => {
    if (!isNativeApp()) return;
    // Before the receiver goes up, so a capabilities message is never missed.
    const stopCaps = installCapabilityListener();
    installNativeReceiver();
    const stopLinks = installAppLinkHandling();
    const stopAuthSync = startNativeAuthSync();
    return () => {
      stopAuthSync();
      stopLinks();
      stopCaps();
    };
  }, []);

  // /portal/chat?channel=<id> reached directly (push tap, cold deep link):
  // open the native chat on that channel and put the dashboard behind it.
  // nativeChat is always false on the web, so this never runs there.
  useEffect(() => {
    if (!nativeChat || pathname?.replace(/\/+$/, '') !== CHAT_PATH) return;
    const channelId = new URLSearchParams(window.location.search).get('channel');
    if (openNativeChat(channelId)) router.replace('/portal/dashboard');
  }, [nativeChat, pathname, router]);

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
