import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { __resetBridgeForTests, parseNativeMessage, receiveNativeMessage } from './bridge';
import {
  __resetNativeChatForTests,
  chatTargetFromHref,
  installCapabilityListener,
  openNativeChat,
  openNativeChatForHref,
  setNativeAuthUid,
  supportsNativeChat,
} from './nativeChat';
import { installAppLinkHandling } from './links';

const APP_UA = 'Mozilla/5.0 (iPhone) AppleWebKit/605.1.15 Mobile/15E148 3CPortalApp/1.0.0';
const WEB_UA = 'Mozilla/5.0 (iPhone) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1';
const PAGE = 'https://www.3cworldgroup.com/portal/dashboard';

let posted: Record<string, unknown>[];
let win: Record<string, unknown>;
let docClick: ((e: unknown) => void) | null;

function stub({ inApp = true, caps }: { inApp?: boolean; caps?: unknown } = {}) {
  posted = [];
  docClick = null;
  win = {
    navigator: { userAgent: inApp ? APP_UA : WEB_UA },
    location: { href: PAGE, assign: vi.fn() },
    addEventListener: vi.fn(),
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

beforeEach(() => {
  __resetBridgeForTests();
  __resetNativeChatForTests();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('capabilities message', () => {
  it('parses known flags and drops the rest', () => {
    expect(parseNativeMessage(capsMessage({ nativeChat: true, other: 1 }))).toEqual(capsMessage({ nativeChat: true }));
    expect(parseNativeMessage(capsMessage('yes'))).toBeNull();
    expect(parseNativeMessage({ type: 'capabilities', capabilities: { nativeChat: true } })).toBeNull();
  });
});

describe('supportsNativeChat', () => {
  it('needs the capability AND a delivered native sign-in', () => {
    stub();
    installCapabilityListener();
    expect(supportsNativeChat()).toBe(false);
    receiveNativeMessage(capsMessage({ nativeChat: true }));
    expect(supportsNativeChat()).toBe(false);
    setNativeAuthUid('u1');
    expect(supportsNativeChat()).toBe(true);
    setNativeAuthUid(null);
    expect(supportsNativeChat()).toBe(false);
  });

  it('reads window.__3C_APP_CAPS__, and a later message overrides it', () => {
    stub({ caps: { nativeChat: true } });
    installCapabilityListener();
    setNativeAuthUid('u1');
    expect(supportsNativeChat()).toBe(true);
    receiveNativeMessage(capsMessage({ nativeChat: false }));
    expect(supportsNativeChat()).toBe(false);
  });

  it('is false in a browser even with the flags set', () => {
    stub({ inApp: false, caps: { nativeChat: true } });
    installCapabilityListener();
    setNativeAuthUid('u1');
    expect(supportsNativeChat()).toBe(false);
    expect(openNativeChat('c1')).toBe(false);
    expect(posted).toEqual([]);
  });
});

describe('openNativeChat', () => {
  beforeEach(() => {
    stub({ caps: { nativeChat: true } });
    setNativeAuthUid('u1');
  });

  it('posts openNativeChat with and without a channel', () => {
    expect(openNativeChat()).toBe(true);
    expect(openNativeChat('c1')).toBe(true);
    expect(posted).toEqual([{ type: 'openNativeChat' }, { type: 'openNativeChat', channelId: 'c1' }]);
  });

  it('matches only the chat page on this host', () => {
    expect(chatTargetFromHref('/portal/chat', PAGE)).toEqual({ channelId: null });
    expect(chatTargetFromHref('/portal/chat/?channel=abc', PAGE)).toEqual({ channelId: 'abc' });
    expect(chatTargetFromHref('/portal/chatter', PAGE)).toBeUndefined();
    expect(chatTargetFromHref('https://evil.example/portal/chat', PAGE)).toBeUndefined();
    expect(openNativeChatForHref('/portal/sales')).toBe(false);
    expect(openNativeChatForHref('/portal/chat?channel=abc')).toBe(true);
    expect(posted).toEqual([{ type: 'openNativeChat', channelId: 'abc' }]);
  });

  it('intercepts a chat link click instead of navigating', () => {
    const uninstall = installAppLinkHandling();
    const anchor = { getAttribute: () => '/portal/chat?channel=c9', hasAttribute: () => false, target: '' };
    const event = {
      defaultPrevented: false,
      button: 0,
      target: { closest: () => anchor },
      preventDefault: vi.fn(),
    };
    docClick!(event);
    expect(event.preventDefault).toHaveBeenCalled();
    expect(posted).toEqual([{ type: 'openNativeChat', channelId: 'c9' }]);
    uninstall();
  });

  it('leaves a chat link alone without the capability', () => {
    win.__3C_APP_CAPS__ = undefined;
    const uninstall = installAppLinkHandling();
    const anchor = { getAttribute: () => '/portal/chat', hasAttribute: () => false, target: '' };
    const event = { defaultPrevented: false, button: 0, target: { closest: () => anchor }, preventDefault: vi.fn() };
    docClick!(event);
    expect(event.preventDefault).not.toHaveBeenCalled();
    expect(posted).toEqual([]);
    uninstall();
  });
});
