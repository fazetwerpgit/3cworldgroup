import { useSyncExternalStore } from 'react';
import { isNativeApp } from './isNativeApp';
import { hasNativeBridge, onNativeMessage, parseCapabilities, postToNative, type AppCapabilities } from './bridge';

// Native chat hand-off for the 3C iOS app (docs/ios-app/BRIDGE.md).
//
// A shell build with a native chat screen says so with a `capabilities`
// message ({ nativeChat: true }) or by injecting window.__3C_APP_CAPS__ before
// the page loads. Once the web has also handed that shell a sign-in
// (`nativeAuth`, see nativeAuthSync.ts), every way into /portal/chat (tab bar,
// nav links, command palette, a push deep link) posts `openNativeChat` instead
// of showing the web chat. Without both, chat stays the web page. Outside the
// app none of this runs: supportsNativeChat() is false at its first check.

export const CHAT_PATH = '/portal/chat';

let shellCaps: AppCapabilities = {};
let nativeAuthUid: string | null = null;
const subscribers = new Set<() => void>();

function notify() {
  for (const fn of subscribers) fn();
}

/** The capabilities in effect: injected window.__3C_APP_CAPS__, overridden by any capabilities message. */
export function readCapabilities(): AppCapabilities {
  const injected = typeof window !== 'undefined' ? parseCapabilities(window.__3C_APP_CAPS__) : null;
  return { ...(injected ?? {}), ...shellCaps };
}

/** Records that the shell now holds a native sign-in for `uid` (null after nativeSignOut). */
export function setNativeAuthUid(uid: string | null): void {
  if (nativeAuthUid === uid) return;
  nativeAuthUid = uid;
  notify();
}

/** The uid the shell was last signed in as, or null. */
export function getNativeAuthUid(): string | null {
  return nativeAuthUid;
}

/**
 * True when chat should open natively: inside the app, with the bridge
 * present, the shell advertising nativeChat, and a native sign-in delivered
 * this session. Always false on the web and the PWA.
 */
export function supportsNativeChat(): boolean {
  if (!isNativeApp() || !hasNativeBridge()) return false;
  return readCapabilities().nativeChat === true && nativeAuthUid !== null;
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

function subscribe(fn: () => void) {
  subscribers.add(fn);
  return () => {
    subscribers.delete(fn);
  };
}

/** Hook form of supportsNativeChat(). False during SSR and hydration, and always on the web. */
export function useSupportsNativeChat(): boolean {
  return useSyncExternalStore(subscribe, supportsNativeChat, () => false);
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

/** Posts openNativeChat when native chat is supported. Returns false (sends nothing) otherwise. */
export function openNativeChat(channelId?: string | null): boolean {
  if (!supportsNativeChat()) return false;
  return postToNative(channelId ? { type: 'openNativeChat', channelId } : { type: 'openNativeChat' });
}

/**
 * Opens native chat when `href` is the chat page and native chat is supported.
 * Returns true when it did, so the caller skips its own navigation.
 */
export function openNativeChatForHref(href: string): boolean {
  if (typeof window === 'undefined' || !supportsNativeChat()) return false;
  const target = chatTargetFromHref(href, window.location.href);
  if (!target) return false;
  return openNativeChat(target.channelId);
}

/** Test-only: forget capabilities and the native sign-in. */
export function __resetNativeChatForTests(): void {
  shellCaps = {};
  nativeAuthUid = null;
  listening = false;
  subscribers.clear();
}
