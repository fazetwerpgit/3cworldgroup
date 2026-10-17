'use client';

import { useEffect, useRef } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { isNativeApp } from '@/lib/app/isNativeApp';
import { installNativeReceiver, onNativeMessage } from '@/lib/app/bridge';
import { installAppLinkHandling } from '@/lib/app/links';
import { registerNativePushToken, syncNativePush } from '@/lib/app/nativePush';
import { startNativeAuthSync } from '@/lib/app/nativeAuthSync';
import {
  CHAT_PATH,
  handleChatDeepLink,
  installCapabilityListener,
  setChatNavigate,
  useNativeChatPending,
  useSupportsNativeChat,
} from '@/lib/app/nativeChat';
import { BodyLayer } from '@/components/portal/rep/BodyLayer';

const onChatPath = (pathname: string | null) => pathname?.replace(/\/+$/, '') === CHAT_PATH;

// Covers /portal/chat while the native chat sign-in or open is under way, so
// the web chat does not flash before the native screen takes over. App only.
function NativeChatHolding() {
  return (
    <BodyLayer>
      <div
        role="status"
        aria-live="polite"
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 1000,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'var(--c-ground, #0b1424)',
          color: 'var(--c-text-2, #a7b2c3)',
          font: '500 15px/1.4 var(--f-ui, system-ui, sans-serif)',
        }}
      >
        Opening chat…
      </div>
    </BodyLayer>
  );
}

// Mounted once in the portal layout. Inside the 3C iOS app it installs the
// bridge receiver and in-app link handling, picks up an already-granted push
// token after sign-in (never prompts: that only happens from a tap in
// Settings), and stores a rotated token the shell reports. For native chat it
// keeps the shell's Firebase Auth signed in as the web user (nativeAuth /
// nativeSignOut) and, once the shell advertises nativeChat, hands a landing on
// /portal/chat (a push deep link) to the native screen. On the web every
// effect returns at its first line, so it does nothing. Renders nothing,
// except a brief holding screen on /portal/chat while native chat takes over.
export default function AppBridgeHost() {
  const { user, loading } = useAuth();
  const signedIn = !loading && !!user;
  const syncedFor = useRef<string | null>(null);
  const pathname = usePathname();
  const router = useRouter();
  const nativeChat = useSupportsNativeChat();
  const nativeChatPending = useNativeChatPending();

  useEffect(() => {
    if (!isNativeApp()) return;
    // Before the receiver goes up, so a capabilities message is never missed.
    const stopCaps = installCapabilityListener();
    installNativeReceiver();
    const stopLinks = installAppLinkHandling();
    const stopAuthSync = startNativeAuthSync();
    return () => {
      setChatNavigate(null);
      stopAuthSync();
      stopLinks();
      stopCaps();
    };
  }, []);

  // A failed native open falls back to a client-side push to the chat page.
  useEffect(() => {
    if (!isNativeApp()) return;
    setChatNavigate((href) => router.push(href));
  }, [router]);

  // /portal/chat?channel=<id> reached directly (push tap, cold deep link):
  // open native chat on that channel; after the shell's ok, step back (or to
  // the dashboard). nativeChat is always false on the web, so this never runs there.
  useEffect(() => {
    if (!nativeChat || !onChatPath(pathname)) return;
    void handleChatDeepLink(pathname, window.location.search, router, window.history.length);
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

  return nativeChatPending && onChatPath(pathname) ? <NativeChatHolding /> : null;
}
