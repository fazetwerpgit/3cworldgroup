import { useSyncExternalStore } from 'react';
import { auth } from '@/lib/firebase/config';
import { isNativeApp } from './isNativeApp';
import { hasNativeBridge, onNativeMessage, parseCapabilities, requestNative, type AppCapabilities } from './bridge';

// Native chat hand-off for the 3C iOS app (docs/ios-app/BRIDGE.md).
//
// A shell build with a native chat screen says so by injecting
// window.__3C_APP_CAPS__ = { nativeChat: true } before page scripts run (the
// primary source); a `capabilities` message updates it flag by flag, so a
// later { nativeChat: false } backs out. Once the shell has also
// confirmed a native sign-in for the current web user (`nativeAuth` reply ok,
// see nativeAuthSync.ts), every way into /portal/chat (tab bar, nav links,
// command palette, a push deep link) asks the shell to `openNativeChat`. If the
// shell refuses or does not answer within 1.5 s, the web chat page opens as
// before. Outside the app none of this runs: every check starts with
// isNativeApp() and the bridge.
//
// A visit to /portal/chat (beginChatVisit, from AppBridgeHost) decides native
// or web once: the "Opening chat…" holding screen waits at most
// CHAT_HOLD_MAX_MS for the native sign-in, and once the web chat has shown for
// that visit a late native sign-in does not pull the person into native chat
// (nor does anything bring the web chat back over a native open under way).

export const CHAT_PATH = '/portal/chat';
export const CHAT_FALLBACK_PATH = '/portal/dashboard';
/** Longest the holding screen waits for the native sign-in on one chat visit. */
export const CHAT_HOLD_MAX_MS = 3000;
/** After a failed or unanswered openNativeChat, chat stays on the web this long. */
export const NATIVE_CHAT_REFUSAL_MS = 45_000;

/** idle: no auth event yet. pending: a custom token is on its way to the shell. */
export type NativeAuthStatus = 'idle' | 'pending' | 'ok' | 'failed' | 'signedOut';

let shellCaps: AppCapabilities = {};
let nativeAuthUid: string | null = null;
let nativeAuthStatus: NativeAuthStatus = 'idle';
let opening = false;
// Set when an openNativeChat fails or times out; cleared by its timer.
let refusalTimer: ReturnType<typeof setTimeout> | null = null;
const subscribers = new Set<() => void>();

/** One stay on /portal/chat. decision: null while undecided, then fixed for the visit. */
interface ChatVisit {
  decision: 'native' | 'web' | null;
  timer: ReturnType<typeof setTimeout> | null;
}
let chatVisit: ChatVisit | null = null;

function decideVisit(visit: ChatVisit, decision: 'native' | 'web'): void {
  visit.decision = decision;
  if (visit.timer) clearTimeout(visit.timer);
  visit.timer = null;
}

/** True while the shell's native sign-in for the web user is still on its way. */
function nativeAuthUnderWay(): boolean {
  return nativeChatAdvertised() && (nativeAuthStatus === 'idle' || nativeAuthStatus === 'pending');
}

// An undecided visit becomes 'web' as soon as nothing native is coming: no
// open in flight, native chat not usable, and no native sign-in under way.
function settleVisit(): void {
  const visit = chatVisit;
  if (!visit || visit.decision !== null) return;
  if (opening || supportsNativeChat() || nativeAuthUnderWay()) return;
  decideVisit(visit, 'web');
}

function notify() {
  settleVisit();
  for (const fn of subscribers) fn();
}

/**
 * The capabilities in effect. The primary source is window.__3C_APP_CAPS__,
 * injected by the shell before page scripts run and read live here; any
 * `capabilities` message is an update merged over it flag by flag.
 */
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
  if (refusalTimer !== null || !nativeChatAdvertised() || nativeAuthUid === null) return false;
  return nativeAuthUid === currentWebUid();
}

/**
 * True while /portal/chat should show a holding state instead of the web chat:
 * nativeChat is advertised and the native sign-in or the open is still under
 * way (or native chat is usable and the visit is about to open it). False once
 * the visit has settled on the web chat, so the hold lasts at most
 * CHAT_HOLD_MAX_MS plus one open. Never true on the web.
 */
export function nativeChatPending(): boolean {
  if (refusalTimer !== null || !nativeChatAdvertised()) return false;
  if (chatVisit?.decision === 'web') return false;
  if (opening || nativeAuthUnderWay()) return true;
  return chatVisit !== null && chatVisit.decision === null && supportsNativeChat();
}

/**
 * Starts a visit to /portal/chat (AppBridgeHost, on entering the page; app
 * only). Native or web is decided once per visit: the web chat if nothing
 * native is coming, or if the native sign-in has not confirmed within
 * CHAT_HOLD_MAX_MS. Returns the function that ends the visit (on leaving).
 */
export function beginChatVisit(): () => void {
  endChatVisit();
  const visit: ChatVisit = { decision: null, timer: null };
  chatVisit = visit;
  visit.timer = setTimeout(() => {
    visit.timer = null;
    if (chatVisit !== visit || visit.decision !== null) return;
    decideVisit(visit, 'web');
    notify();
  }, CHAT_HOLD_MAX_MS);
  notify();
  return () => {
    if (chatVisit === visit) endChatVisit();
  };
}

function endChatVisit(): void {
  if (!chatVisit) return;
  if (chatVisit.timer) clearTimeout(chatVisit.timer);
  chatVisit = null;
  notify();
}

/** The current chat visit's decision: undefined with no visit, null while undecided. */
export function chatVisitDecision(): 'native' | 'web' | null | undefined {
  return chatVisit ? chatVisit.decision : undefined;
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

/** Chat stays on the web for NATIVE_CHAT_REFUSAL_MS (no retry on every navigation). */
function refuseNativeChat(): void {
  if (refusalTimer) clearTimeout(refusalTimer);
  refusalTimer = setTimeout(() => {
    refusalTimer = null;
    notify();
  }, NATIVE_CHAT_REFUSAL_MS);
}

/** True while a recent failed open keeps chat on the web. */
export function nativeChatRefused(): boolean {
  return refusalTimer !== null;
}

/**
 * Asks the shell to show native chat. Resolves true only on an ok reply; false
 * when native chat is not supported, the shell refused, or it did not answer
 * within 1.5 s. A refusal or timeout keeps chat on the web for
 * NATIVE_CHAT_REFUSAL_MS, so the next navigation does not try (and wait) again.
 */
export async function openNativeChat(channelId?: string | null): Promise<boolean> {
  if (!supportsNativeChat()) return false;
  opening = true;
  notify();
  try {
    await requestNative<'openNativeChat'>(channelId ? { type: 'openNativeChat', channelId } : { type: 'openNativeChat' });
    return true;
  } catch {
    refuseNativeChat();
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
  // Decided once per visit: the web chat already showed (do not pull the
  // person out mid-typing), or an open already ran for this visit.
  const visit = chatVisit;
  if (visit && visit.decision !== null) return false;
  if (visit) decideVisit(visit, 'native');
  const channelId = new URLSearchParams(search).get('channel');
  const ok = await openNativeChat(channelId);
  if (!ok) {
    if (visit && chatVisit === visit) {
      decideVisit(visit, 'web');
      notify();
    }
    return false;
  }
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
  if (chatVisit?.timer) clearTimeout(chatVisit.timer);
  chatVisit = null;
  if (refusalTimer) clearTimeout(refusalTimer);
  refusalTimer = null;
  subscribers.clear();
  chatNavigate = hardNavigate;
}
