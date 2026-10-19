'use client';

import { useEffect, useRef } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { isNativeApp, useIsNativeApp } from '@/lib/app/isNativeApp';
import { advertiseBridgeFeature, installNativeReceiver, onNativeMessage } from '@/lib/app/bridge';
import { APP_NAVIGATE_EVENT, inAppRoute, installAppLinkHandling } from '@/lib/app/links';
import { registerNativePushToken, syncNativePush } from '@/lib/app/nativePush';
import { installStatusBarSync } from '@/lib/app/statusBar';
import { installResumeMotionReset } from '@/lib/app/appVisibility';
import { installZoomCap } from '@/lib/app/viewportZoom';
import { scrollPageToTop } from '@/lib/app/scrollToTop';
import { clearNativeExtras, signalAppReady } from '@/lib/app/shellExtras';
import AppNotice from './AppNotice';
import NativeBadgeSync from './NativeBadgeSync';
import { startNativeAuthSync } from '@/lib/app/nativeAuthSync';
import {
  CHAT_PATH,
  beginChatVisit,
  handleChatDeepLink,
  installCapabilityListener,
  setChatNavigate,
  useNativeChatPending,
  useSupportsNativeChat,
} from '@/lib/app/nativeChat';
import { BodyLayer } from '@/components/portal/rep/BodyLayer';

/** Routes whose page sends `ready` itself, once its real content renders. */
export const SELF_READY_PATHS = ['/portal', '/portal/dashboard'];

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

// Mounted once in the portal layout. Inside the 3C iOS app it marks <html>
// with data-app (app-only touch CSS), installs the bridge receiver and in-app
// link handling, picks up an already-granted push
// token after sign-in (never prompts: that only happens from a tap in
// Settings), stores a rotated token the shell reports, and keeps the iOS
// status bar style in step with the page theme. A tapped notification arrives
// as `navigate` and opens through the router, so the portal never reloads. For
// native chat it keeps the shell's Firebase Auth signed in as the web user
// (nativeAuth / nativeSignOut) and, once the shell advertises nativeChat, hands
// a landing on /portal/chat (a push deep link) to the native screen. On the
// web every effect returns at its first line, so it does nothing. Renders the
// in-app notice toast and a brief holding screen on /portal/chat while native
// chat takes over (both render nothing on the web).
export default function AppBridgeHost() {
  const { user, loading } = useAuth();
  const signedIn = !loading && !!user;
  const syncedFor = useRef<string | null>(null);
  const inApp = useIsNativeApp();
  const pathname = usePathname();
  const router = useRouter();
  const nativeChat = useSupportsNativeChat();
  const nativeChatPending = useNativeChatPending();
  const chatOpen = onChatPath(pathname);

  useEffect(() => {
    if (!isNativeApp()) return;
    // Scopes the app-only touch polish (styles/app-touch.css). Set after
    // hydration, so the server markup and the first client render match.
    const html = document.documentElement;
    html.setAttribute('data-app', '');
    // Before the receiver goes up, so a capabilities message is never missed.
    const stopCaps = installCapabilityListener();
    installNativeReceiver();
    const stopLinks = installAppLinkHandling();
    // Status bar text follows the page theme (BRIDGE.md statusBar).
    const stopStatusBar = installStatusBarSync();
    // Back after 30+ minutes away: replay the once-per-session reveals.
    const stopResumeReset = installResumeMotionReset();
    const stopAuthSync = startNativeAuthSync();
    // No pinch zoom of the app's chrome (the image viewer lifts it).
    const stopZoomCap = installZoomCap();
    // A status-bar tap (the shell sends scrollToTop): the page scrolls inside
    // <main>, which UIKit's own status-bar scroll never reaches.
    const stopScrollTop = onNativeMessage((message) => {
      if (message.type === 'scrollToTop') scrollPageToTop();
    });
    const stopAdvertisingScrollTop = advertiseBridgeFeature('scrollToTop');
    return () => {
      html.removeAttribute('data-app');
      stopAdvertisingScrollTop();
      stopScrollTop();
      stopZoomCap();
      setChatNavigate(null);
      stopAuthSync();
      stopResumeReset();
      stopStatusBar();
      stopLinks();
      stopCaps();
    };
  }, []);

  // A failed native open falls back to a client-side push to the chat page.
  useEffect(() => {
    if (!isNativeApp()) return;
    setChatNavigate((href) => router.push(href));
  }, [router]);

  // One chat visit per stay on /portal/chat: native or web is decided once
  // (the holding screen waits at most 3 s). Declared before the deep-link
  // effect so the visit exists when it runs. App only.
  useEffect(() => {
    if (!chatOpen || !isNativeApp()) return;
    return beginChatVisit();
  }, [chatOpen]);

  // /portal/chat?channel=<id> reached directly (push tap, cold deep link):
  // open native chat on that channel; after the shell's ok, step back (or to
  // the dashboard). Skipped once this visit has shown the web chat.
  // nativeChat is always false on the web, so this never runs there.
  useEffect(() => {
    if (!nativeChat || !onChatPath(pathname)) return;
    void handleChatDeepLink(pathname, window.location.search, router, window.history.length);
  }, [nativeChat, pathname, router]);

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

  // The shell's download toasts (BRIDGE.md notice) and the icon badge sync;
  // nothing on the web.
  return (
    <>
      <AppNotice />
      {inApp && signedIn ? <NativeBadgeSync /> : null}
      {nativeChatPending && chatOpen ? <NativeChatHolding /> : null}
    </>
  );
}
