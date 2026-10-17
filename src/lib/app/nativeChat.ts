import { useSyncExternalStore } from 'react';
import { auth } from '@/lib/firebase/config';
import { isNativeApp } from './isNativeApp';
import { hasNativeBridge, onNativeMessage, parseCapabilities, requestNative, type AppCapabilities } from './bridge';

// Native chat hand-off for the 3C iOS app (docs/ios-app/BRIDGE.md).
//
// A shell build with a native chat screen says so with a `capabilities`
// message ({ nativeChat: true }) or by injecting window.__3C_APP_CAPS__ before
// the page loads; { nativeChat: false } backs out. Once the shell has also
// confirmed a native sign-in for the current web user (`nativeAuth` reply ok,
// see nativeAuthSync.ts), every way into /portal/chat (tab bar, nav links,
// command palette, a push deep link) asks the shell to `openNativeChat`. If the
// shell refuses or does not answer within 1.5 s, the web chat page opens as
// before. Outside the app none of this runs: every check starts with
// isNativeApp() and the bridge.

export const CHAT_PATH = '/portal/chat';
export const CHAT_FALLBACK_PATH = '/portal/dashboard';

/** idle: no auth event yet. pending: a custom token is on its way to the shell. */
export type NativeAuthStatus = 'idle' | 'pending' | 'ok' | 'failed' | 'signedOut';

let shellCaps: AppCapabilities = {};
let nativeAuthUid: string | null = null;
let nativeAuthStatus: NativeAuthStatus = 'idle';
let opening = false;
const subscribers = new Set<() => void>();

function notify() {
  for (const fn of subscribers) fn();
}

/** The capabilities in effect: injected window.__3C_APP_CAPS__, overridden by any capabilities message. */
export function readCapabilities(): AppCapabilities {
  const injected = typeof window !== 'undefined' ? parseCapabilities(window.__3C_APP_CAPS__) : null;
  return { ...(injected ?? {}), ...shellCaps };
}

/** True inside the app with the bridge present and the shell advertising nativeChat. */
export function nativeChatAdvertised(): boolean {
  return isNativeApp() && hasNativeBridge() && readCapabilities().nativeChat === true;
}

/** Records the shell's native sign-in: the uid it holds (kept only for status 'ok') and the sync status. */
export function setNativeAuth(status: NativeAuthStatus, uid: string | null = null): void {
  const nextUid = status === 'ok' ? uid : null;
  if (nativeAuthStatus === status && nativeAuthUid === nextUid) return;
  nativeAuthStatus = status;
  nativeAuthUid = nextUid;
  notify();
}

export function getNativeAuthUid(): string | null {
  return nativeAuthUid;
}

export function getNativeAuthStatus(): NativeAuthStatus {
  return nativeAuthStatus;
}

function currentWebUid(): string | null {
  return auth?.currentUser?.uid ?? null;
}

/**
 * True when chat should open natively: nativeChat advertised, and the shell
 * confirmed a sign-in as the uid signed in on the web right now. Always false
 * on the web and the PWA.
 */
export function supportsNativeChat(): boolean {
  if (!nativeChatAdvertised() || nativeAuthUid === null) return false;
  return nativeAuthUid === currentWebUid();
}

/**
 * True while /portal/chat should show a holding state instead of the web chat:
 * nativeChat is advertised and the native sign-in or the open is still under
 * way. Never true on the web.
 */
export function nativeChatPending(): boolean {
  if (!nativeChatAdvertised()) return false;
  return opening || nativeAuthStatus === 'idle' || nativeAuthStatus === 'pending';
}

let listening = false;

/** Starts listening for the shell's capabilities message. Inside the app only; idempotent. */
export function installCapabilityListener(): () => void {
  if (listening || typeof window === 'undefined' || !isNativeApp()) return () => {};
  listening = true;
  const off = onNativeMessage((message) => {
    if (message.type !== 'capabilities') return;
    shellCaps = { ...shellCaps, ...message.capabilities };
    notify();
  });
  return () => {
    off();
    listening = false;
  };
}

/** Subscribes to capability and native-auth changes. Returns the unsubscribe. */
export function subscribeNativeChat(fn: () => void): () => void {
  subscribers.add(fn);
  return () => {
    subscribers.delete(fn);
  };
}

/** Hook form of supportsNativeChat(). False during SSR and hydration, and always on the web. */
export function useSupportsNativeChat(): boolean {
  return useSyncExternalStore(subscribeNativeChat, supportsNativeChat, () => false);
}

/** Hook form of nativeChatPending(). False during SSR and hydration, and always on the web. */
export function useNativeChatPending(): boolean {
  return useSyncExternalStore(subscribeNativeChat, nativeChatPending, () => false);
}

/** If `href` points at the portal chat page, its ?channel= (or null); undefined when it is not chat. */
export function chatTargetFromHref(href: string, base: string): { channelId: string | null } | undefined {
  let url: URL;
  try {
    const current = new URL(base);
    url = new URL(href, current);
    if (url.host !== current.host) return undefined;
  } catch {
    return undefined;
  }
  const path = url.pathname.replace(/\/+$/, '');
  if (path !== CHAT_PATH) return undefined;
  const channelId = url.searchParams.get('channel');
  return { channelId: channelId ? channelId : null };
}

/**
 * Asks the shell to show native chat. Resolves true only on an ok reply; false
 * when native chat is not supported, the shell refused, or it did not answer
 * within 1.5 s.
 */
export async function openNativeChat(channelId?: string | null): Promise<boolean> {
  if (!supportsNativeChat()) return false;
  opening = true;
  notify();
  try {
    await requestNative<'openNativeChat'>(channelId ? { type: 'openNativeChat', channelId } : { type: 'openNativeChat' });
    return true;
  } catch {
    return false;
  } finally {
    opening = false;
    notify();
  }
}

type Navigate = (href: string) => void;

const hardNavigate: Navigate = (href) => window.location.assign(href);
let chatNavigate: Navigate = hardNavigate;

/** The client-side navigation used when native chat fails (AppBridgeHost sets router.push). */
export function setChatNavigate(fn: Navigate | null): void {
  chatNavigate = fn ?? hardNavigate;
}

/**
 * Takes over a navigation to the chat page when native chat is supported:
 * returns true (the caller must not navigate) and asks the shell to open
 * native chat, navigating to `href` itself if that fails. Returns false, doing
 * nothing, for any other link or when native chat is not supported.
 */
export function openNativeChatForHref(href: string, navigate?: Navigate): boolean {
  if (typeof window === 'undefined' || !supportsNativeChat()) return false;
  const target = chatTargetFromHref(href, window.location.href);
  if (!target) return false;
  void openNativeChat(target.channelId).then((ok) => {
    if (!ok) (navigate ?? chatNavigate)(href);
  });
  return true;
}

export interface ChatDeepLinkRouter {
  back: () => void;
  replace: (href: string) => void;
}

/**
 * /portal/chat reached directly (push tap, cold deep link, a navigation that
 * escaped the link handler): ask the shell to open that channel natively, and
 * only after its ok step back (or go to the dashboard on a cold load) so the
 * page behind the native screen is not the chat. On failure the web chat
 * stays. Resolves whether native chat opened.
 */
export async function handleChatDeepLink(
  pathname: string | null | undefined,
  search: string,
  router: ChatDeepLinkRouter,
  historyLength: number
): Promise<boolean> {
  if (!supportsNativeChat() || pathname?.replace(/\/+$/, '') !== CHAT_PATH) return false;
  const channelId = new URLSearchParams(search).get('channel');
  const ok = await openNativeChat(channelId);
  if (!ok) return false;
  if (historyLength > 1) router.back();
  else router.replace(CHAT_FALLBACK_PATH);
  return true;
}

/** Test-only: forget capabilities and the native sign-in. */
export function __resetNativeChatForTests(): void {
  shellCaps = {};
  nativeAuthUid = null;
  nativeAuthStatus = 'idle';
  opening = false;
  listening = false;
  subscribers.clear();
  chatNavigate = hardNavigate;
}
