import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const fakeAuth = vi.hoisted(() => ({ currentUser: null as { uid: string } | null }));
vi.mock('@/lib/firebase/config', () => ({ auth: fakeAuth }));

import { __resetBridgeForTests, installNativeReceiver, parseNativeMessage, receiveNativeMessage } from './bridge';
import {
  CHAT_FALLBACK_PATH,
  CHAT_HOLD_MAX_MS,
  NATIVE_CHAT_REFUSAL_MS,
  __resetNativeChatForTests,
  beginChatVisit,
  chatVisitDecision,
  chatTargetFromHref,
  handleChatDeepLink,
  installCapabilityListener,
  nativeChatPending,
  nativeChatRefused,
  openNativeChat,
  openNativeChatForHref,
  readCapabilities,
  setNativeAuth,
  supportsNativeChat,
} from './nativeChat';
import { installAppLinkHandling } from './links';

const APP_UA = 'Mozilla/5.0 (iPhone) AppleWebKit/605.1.15 Mobile/15E148 3CPortalApp/1.0.0';
const WEB_UA = 'Mozilla/5.0 (iPhone) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1';
const PAGE = 'https://www.3cworldgroup.com/portal/dashboard';

let posted: Record<string, unknown>[];
let win: Record<string, unknown>;
let winListeners: Record<string, ((e: unknown) => void)[]>;
let docClick: ((e: unknown) => void) | null;

function stub({ inApp = true, caps }: { inApp?: boolean; caps?: unknown } = {}) {
  posted = [];
  docClick = null;
  winListeners = {};
  win = {
    navigator: { userAgent: inApp ? APP_UA : WEB_UA },
    location: { href: PAGE, assign: vi.fn() },
    addEventListener: (type: string, fn: (e: unknown) => void) => {
      (winListeners[type] ??= []).push(fn);
    },
    open: vi.fn(),
    ReactNativeWebView: { postMessage: (m: string) => posted.push(JSON.parse(m)) },
  };
  if (caps !== undefined) win.__3C_APP_CAPS__ = caps;
  vi.stubGlobal('window', win);
  vi.stubGlobal('document', {
    addEventListener: (type: string, fn: (e: unknown) => void) => {
      if (type === 'click') docClick = fn;
    },
    removeEventListener: vi.fn(),
  });
}

const capsMessage = (capabilities: unknown) => ({ source: '3c-shell', type: 'capabilities', capabilities });

/** Answers the last request the web sent. */
function reply(ok: boolean) {
  const id = posted[posted.length - 1].id as string;
  receiveNativeMessage(
    ok ? { source: '3c-shell', type: 'reply', id, ok: true } : { source: '3c-shell', type: 'reply', id, ok: false, error: 'no', code: 'failed' }
  );
}

/** In the app, nativeChat advertised, shell signed in as the web user u1. */
function ready() {
  stub({ caps: { nativeChat: true } });
  fakeAuth.currentUser = { uid: 'u1' };
  setNativeAuth('ok', 'u1');
}

function chatClick(href: string) {
  const anchor = { getAttribute: () => href, hasAttribute: () => false, target: '' };
  const event = { defaultPrevented: false, button: 0, target: { closest: () => anchor }, preventDefault: vi.fn() };
  docClick!(event);
  return event;
}

beforeEach(() => {
  __resetBridgeForTests();
  __resetNativeChatForTests();
  fakeAuth.currentUser = null;
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('capabilities message', () => {
  it('parses known flags and drops the rest', () => {
    expect(parseNativeMessage(capsMessage({ nativeChat: true, other: 1 }))).toEqual(capsMessage({ nativeChat: true }));
    expect(parseNativeMessage(capsMessage('yes'))).toBeNull();
    expect(parseNativeMessage({ type: 'capabilities', capabilities: { nativeChat: true } })).toBeNull();
  });

  it('ignores a capabilities message from an iframe (another window as source)', () => {
    stub();
    fakeAuth.currentUser = { uid: 'u1' };
    installCapabilityListener();
    installNativeReceiver();
    setNativeAuth('ok', 'u1');
    for (const fn of winListeners.message) fn({ source: { other: true }, data: capsMessage({ nativeChat: true }) });
    expect(supportsNativeChat()).toBe(false);
    for (const fn of winListeners.message) fn({ source: win, data: capsMessage({ nativeChat: true }) });
    expect(supportsNativeChat()).toBe(true);
  });
});

describe('supportsNativeChat', () => {
  it('needs the capability AND an ok native sign-in for the current web uid', () => {
    stub();
    fakeAuth.currentUser = { uid: 'u1' };
    installCapabilityListener();
    receiveNativeMessage(capsMessage({ nativeChat: true }));
    expect(supportsNativeChat()).toBe(false);
    setNativeAuth('pending');
    expect(supportsNativeChat()).toBe(false);
    setNativeAuth('ok', 'u1');
    expect(supportsNativeChat()).toBe(true);
    fakeAuth.currentUser = { uid: 'u2' };
    expect(supportsNativeChat()).toBe(false);
  });

  it('the injected window.__3C_APP_CAPS__ alone is enough (primary source, no message needed)', () => {
    ready();
    // No capability listener, no message: the injected value is read directly.
    expect(readCapabilities()).toEqual({ nativeChat: true });
    expect(supportsNativeChat()).toBe(true);
  });

  it('a capabilities message updates an injected false; flags it omits keep the injected value', () => {
    stub({ caps: { nativeChat: false } });
    fakeAuth.currentUser = { uid: 'u1' };
    setNativeAuth('ok', 'u1');
    installCapabilityListener();
    expect(supportsNativeChat()).toBe(false);
    receiveNativeMessage(capsMessage({}));
    expect(readCapabilities()).toEqual({ nativeChat: false });
    receiveNativeMessage(capsMessage({ nativeChat: true }));
    expect(supportsNativeChat()).toBe(true);
  });

  it('a later {nativeChat:false} backs out of an injected true', () => {
    ready();
    installCapabilityListener();
    expect(supportsNativeChat()).toBe(true);
    receiveNativeMessage(capsMessage({ nativeChat: false }));
    expect(supportsNativeChat()).toBe(false);
  });

  it('is false in a browser even with the flags set', async () => {
    stub({ inApp: false, caps: { nativeChat: true } });
    fakeAuth.currentUser = { uid: 'u1' };
    setNativeAuth('ok', 'u1');
    expect(supportsNativeChat()).toBe(false);
    expect(nativeChatPending()).toBe(false);
    expect(await openNativeChat('c1')).toBe(false);
    expect(posted).toEqual([]);
  });
});

describe('holding state', () => {
  it('is pending while native auth is idle/pending or an open is in flight', async () => {
    stub({ caps: { nativeChat: true } });
    fakeAuth.currentUser = { uid: 'u1' };
    expect(nativeChatPending()).toBe(true);
    setNativeAuth('failed');
    expect(nativeChatPending()).toBe(false);
    setNativeAuth('ok', 'u1');
    expect(nativeChatPending()).toBe(false);
    const opened = openNativeChat();
    expect(nativeChatPending()).toBe(true);
    reply(true);
    await opened;
    expect(nativeChatPending()).toBe(false);
  });

  it('is never pending without the capability', () => {
    stub();
    expect(nativeChatPending()).toBe(false);
  });
});

describe('openNativeChat', () => {
  beforeEach(ready);

  it('is a request with an id; ok reply resolves true', async () => {
    const opened = openNativeChat('c1');
    expect(posted[0]).toMatchObject({ type: 'openNativeChat', channelId: 'c1' });
    expect(typeof posted[0].id).toBe('string');
    reply(true);
    expect(await opened).toBe(true);
    const list = openNativeChat();
    expect(posted[1]).not.toHaveProperty('channelId');
    reply(true);
    expect(await list).toBe(true);
  });

  it('matches only the chat page on this host', () => {
    expect(chatTargetFromHref('/portal/chat', PAGE)).toEqual({ channelId: null });
    expect(chatTargetFromHref('/portal/chat/?channel=abc', PAGE)).toEqual({ channelId: 'abc' });
    expect(chatTargetFromHref('/portal/chatter', PAGE)).toBeUndefined();
    expect(chatTargetFromHref('https://evil.example/portal/chat', PAGE)).toBeUndefined();
    expect(openNativeChatForHref('/portal/sales')).toBe(false);
  });

  it('a failed native open falls back to navigating', async () => {
    const navigate = vi.fn();
    expect(openNativeChatForHref('/portal/chat?channel=abc', navigate)).toBe(true);
    expect(posted[0]).toMatchObject({ type: 'openNativeChat', channelId: 'abc' });
    reply(false);
    await vi.waitFor(() => expect(navigate).toHaveBeenCalledWith('/portal/chat?channel=abc'));
  });

  it('no answer within 1.5 s falls back to navigating', async () => {
    vi.useFakeTimers();
    const navigate = vi.fn();
    openNativeChatForHref('/portal/chat', navigate);
    await vi.advanceTimersByTimeAsync(1499);
    expect(navigate).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(navigate).toHaveBeenCalledWith('/portal/chat');
  });

  it('an ok open does not navigate', async () => {
    const navigate = vi.fn();
    openNativeChatForHref('/portal/chat', navigate);
    reply(true);
    await Promise.resolve();
    await Promise.resolve();
    expect(navigate).not.toHaveBeenCalled();
  });

  it('intercepts a chat link click instead of navigating', () => {
    const uninstall = installAppLinkHandling();
    const event = chatClick('/portal/chat?channel=c9');
    expect(event.preventDefault).toHaveBeenCalled();
    expect(posted[0]).toMatchObject({ type: 'openNativeChat', channelId: 'c9' });
    uninstall();
  });

  it('leaves a chat link alone without the capability', () => {
    win.__3C_APP_CAPS__ = undefined;
    const uninstall = installAppLinkHandling();
    const event = chatClick('/portal/chat');
    expect(event.preventDefault).not.toHaveBeenCalled();
    expect(posted).toEqual([]);
    uninstall();
  });
});

describe('handleChatDeepLink', () => {
  beforeEach(ready);
  const router = () => ({ back: vi.fn(), replace: vi.fn() });

  it('opens the linked channel and replaces with the dashboard only after ok (cold load)', async () => {
    const r = router();
    const done = handleChatDeepLink('/portal/chat', '?channel=c7', r, 1);
    expect(posted[0]).toMatchObject({ type: 'openNativeChat', channelId: 'c7' });
    expect(r.replace).not.toHaveBeenCalled();
    reply(true);
    expect(await done).toBe(true);
    expect(r.replace).toHaveBeenCalledWith(CHAT_FALLBACK_PATH);
    expect(r.back).not.toHaveBeenCalled();
  });

  it('steps back instead when there is history', async () => {
    const r = router();
    const done = handleChatDeepLink('/portal/chat/', '', r, 3);
    reply(true);
    await done;
    expect(r.back).toHaveBeenCalled();
    expect(r.replace).not.toHaveBeenCalled();
  });

  it('stays on the web chat when the shell refuses', async () => {
    const r = router();
    const done = handleChatDeepLink('/portal/chat', '?channel=c7', r, 1);
    reply(false);
    expect(await done).toBe(false);
    expect(r.back).not.toHaveBeenCalled();
    expect(r.replace).not.toHaveBeenCalled();
  });

  it('does nothing off the chat page or without support', async () => {
    const r = router();
    expect(await handleChatDeepLink('/portal/sales', '', r, 1)).toBe(false);
    setNativeAuth('signedOut');
    expect(await handleChatDeepLink('/portal/chat', '', r, 1)).toBe(false);
    expect(posted).toEqual([]);
  });
});

describe('chat visit (decided once, holding capped)', () => {
  const router = () => ({ back: vi.fn(), replace: vi.fn() });

  function waitingForAuth() {
    stub({ caps: { nativeChat: true } });
    fakeAuth.currentUser = { uid: 'u1' };
  }

  it('holds at most CHAT_HOLD_MAX_MS for the native sign-in, then shows the web chat', async () => {
    vi.useFakeTimers();
    waitingForAuth();
    beginChatVisit();
    expect(nativeChatPending()).toBe(true);
    await vi.advanceTimersByTimeAsync(CHAT_HOLD_MAX_MS - 1);
    expect(nativeChatPending()).toBe(true);
    await vi.advanceTimersByTimeAsync(1);
    expect(nativeChatPending()).toBe(false);
    expect(chatVisitDecision()).toBe('web');
  });

  it('a late native sign-in after the web chat showed does not open native chat', async () => {
    vi.useFakeTimers();
    waitingForAuth();
    beginChatVisit();
    await vi.advanceTimersByTimeAsync(CHAT_HOLD_MAX_MS);
    setNativeAuth('ok', 'u1');
    expect(supportsNativeChat()).toBe(true);
    expect(nativeChatPending()).toBe(false);
    expect(await handleChatDeepLink('/portal/chat', '?channel=c1', router(), 1)).toBe(false);
    expect(posted).toEqual([]);
  });

  it('a failed sign-in settles the visit on the web at once; a later ok does not yank', async () => {
    waitingForAuth();
    beginChatVisit();
    setNativeAuth('failed');
    expect(chatVisitDecision()).toBe('web');
    expect(nativeChatPending()).toBe(false);
    setNativeAuth('ok', 'u1');
    expect(await handleChatDeepLink('/portal/chat', '', router(), 1)).toBe(false);
    expect(posted).toEqual([]);
  });

  it('a sign-in that confirms within the cap opens native chat; the hold covers the gap', async () => {
    vi.useFakeTimers();
    waitingForAuth();
    beginChatVisit();
    await vi.advanceTimersByTimeAsync(2500);
    setNativeAuth('ok', 'u1');
    // Usable but not opened yet: keep holding so the web chat does not flash.
    expect(nativeChatPending()).toBe(true);
    const r = router();
    const done = handleChatDeepLink('/portal/chat', '?channel=c1', r, 1);
    expect(chatVisitDecision()).toBe('native');
    expect(posted[0]).toMatchObject({ type: 'openNativeChat', channelId: 'c1' });
    // The cap passing (t=3000) does not cut into an open already under way.
    await vi.advanceTimersByTimeAsync(1000);
    expect(nativeChatPending()).toBe(true);
    expect(chatVisitDecision()).toBe('native');
    reply(true);
    expect(await done).toBe(true);
    expect(r.replace).toHaveBeenCalledWith(CHAT_FALLBACK_PATH);
  });

  it('opens at most once per visit; a failed open settles on the web', async () => {
    ready();
    beginChatVisit();
    const first = handleChatDeepLink('/portal/chat', '', router(), 1);
    expect(await handleChatDeepLink('/portal/chat', '', router(), 1)).toBe(false);
    reply(false);
    expect(await first).toBe(false);
    expect(chatVisitDecision()).toBe('web');
    expect(nativeChatPending()).toBe(false);
    expect(posted).toHaveLength(1);
  });

  it('a new visit decides afresh', () => {
    waitingForAuth();
    const end = beginChatVisit();
    setNativeAuth('failed');
    expect(chatVisitDecision()).toBe('web');
    end();
    expect(chatVisitDecision()).toBeUndefined();
    setNativeAuth('pending');
    beginChatVisit();
    expect(chatVisitDecision()).toBeNull();
    expect(nativeChatPending()).toBe(true);
  });
});

describe('refusal after a failed open', () => {
  beforeEach(ready);

  it('a timed-out openNativeChatForHref keeps chat on the web for a while, then retries', async () => {
    vi.useFakeTimers();
    const navigate = vi.fn();
    expect(openNativeChatForHref('/portal/chat', navigate)).toBe(true);
    await vi.advanceTimersByTimeAsync(1500);
    expect(navigate).toHaveBeenCalledWith('/portal/chat');
    expect(nativeChatRefused()).toBe(true);
    expect(supportsNativeChat()).toBe(false);
    // The fallback lands on /portal/chat: the visit goes straight to the web chat.
    beginChatVisit();
    expect(nativeChatPending()).toBe(false);
    expect(chatVisitDecision()).toBe('web');
    // Later navigations are not intercepted (no second 1.5 s wait).
    expect(openNativeChatForHref('/portal/chat', navigate)).toBe(false);
    expect(posted).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(NATIVE_CHAT_REFUSAL_MS);
    expect(nativeChatRefused()).toBe(false);
    expect(supportsNativeChat()).toBe(true);
    expect(openNativeChatForHref('/portal/chat', navigate)).toBe(true);
    expect(posted).toHaveLength(2);
  });

  it('a refused reply sets it too; an ok open does not', async () => {
    const okOpen = openNativeChat();
    reply(true);
    await okOpen;
    expect(nativeChatRefused()).toBe(false);
    const failed = openNativeChat();
    reply(false);
    await failed;
    expect(nativeChatRefused()).toBe(true);
    expect(await handleChatDeepLink('/portal/chat', '', { back: vi.fn(), replace: vi.fn() }, 1)).toBe(false);
    expect(posted).toHaveLength(2);
  });
});
