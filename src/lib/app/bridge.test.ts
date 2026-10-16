import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  BRIDGE_VERSION,
  NativeBridgeError,
  __resetBridgeForTests,
  nativeHaptic,
  onNativeMessage,
  parseNativeMessage,
  postToNative,
  receiveNativeMessage,
  requestNative,
} from './bridge';

const APP_UA = 'Mozilla/5.0 (iPhone) AppleWebKit/605.1.15 Mobile/15E148 3CPortalApp/1.0.0';

let posted: string[];
let windowListeners: Record<string, Array<(e: unknown) => void>>;

function stubApp({ ua = APP_UA, bridge = true }: { ua?: string; bridge?: boolean } = {}) {
  posted = [];
  windowListeners = {};
  const win: Record<string, unknown> = {
    navigator: { userAgent: ua },
    addEventListener: (type: string, fn: (e: unknown) => void) => {
      (windowListeners[type] ??= []).push(fn);
    },
  };
  if (bridge) win.ReactNativeWebView = { postMessage: (m: string) => posted.push(m) };
  vi.stubGlobal('window', win);
  vi.stubGlobal('document', { addEventListener: vi.fn() });
}

/** The last web -> native message, parsed. */
function lastPosted(): Record<string, unknown> {
  return JSON.parse(posted[posted.length - 1]);
}

beforeEach(() => {
  __resetBridgeForTests();
  stubApp();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('postToNative', () => {
  it('sends JSON over ReactNativeWebView.postMessage in the app', () => {
    expect(postToNative({ type: 'openExternal', url: 'https://meet.google.com/abc' })).toBe(true);
    expect(lastPosted()).toEqual({ type: 'openExternal', url: 'https://meet.google.com/abc' });
  });

  it('sends nothing in a normal browser, even if a postMessage object exists', () => {
    stubApp({ ua: 'Mozilla/5.0 (iPhone) Safari/604.1' });
    expect(postToNative({ type: 'haptic', style: 'success' })).toBe(false);
    expect(posted).toEqual([]);
  });

  it('returns false when the app has no bridge channel', () => {
    stubApp({ bridge: false });
    expect(postToNative({ type: 'haptic', style: 'light' })).toBe(false);
  });

  it('haptic is fire-and-forget with no id', () => {
    nativeHaptic('success');
    expect(lastPosted()).toEqual({ type: 'haptic', style: 'success' });
  });
});

describe('parseNativeMessage', () => {
  it('accepts replies and push token events from the shell, as object or JSON', () => {
    expect(parseNativeMessage({ source: '3c-shell', type: 'reply', id: 'a', ok: true, result: { x: 1 } })).toEqual({
      source: '3c-shell',
      type: 'reply',
      id: 'a',
      ok: true,
      result: { x: 1 },
    });
    expect(parseNativeMessage(JSON.stringify({ source: '3c-shell', type: 'pushToken', token: 't1' }))).toEqual({
      source: '3c-shell',
      type: 'pushToken',
      token: 't1',
    });
  });

  it('ignores anything without the shell source tag', () => {
    expect(parseNativeMessage({ type: 'reply', id: 'a', ok: true })).toBeNull();
    expect(parseNativeMessage({ source: 'other', type: 'pushToken', token: 't' })).toBeNull();
    expect(parseNativeMessage('not json')).toBeNull();
    expect(parseNativeMessage(null)).toBeNull();
  });

  it('rejects malformed shapes', () => {
    expect(parseNativeMessage({ source: '3c-shell', type: 'reply', ok: true })).toBeNull();
    expect(parseNativeMessage({ source: '3c-shell', type: 'reply', id: 'a' })).toBeNull();
    expect(parseNativeMessage({ source: '3c-shell', type: 'pushToken', token: '' })).toBeNull();
    expect(parseNativeMessage({ source: '3c-shell', type: 'mystery' })).toBeNull();
  });

  it('keeps only known error codes and fills a missing error text', () => {
    expect(parseNativeMessage({ source: '3c-shell', type: 'reply', id: 'a', ok: false, code: 'weird' })).toEqual({
      source: '3c-shell',
      type: 'reply',
      id: 'a',
      ok: false,
      error: 'The app could not finish that.',
    });
    expect(
      parseNativeMessage({ source: '3c-shell', type: 'reply', id: 'a', ok: false, error: 'nope', code: 'canceled' })
    ).toMatchObject({ code: 'canceled', error: 'nope' });
  });
});

describe('requestNative', () => {
  it('posts the request with an id and resolves with the matching reply', async () => {
    const pending = requestNative<'pushToken'>({ type: 'pushToken', prompt: true });
    const sent = lastPosted();
    expect(sent).toMatchObject({ type: 'pushToken', prompt: true });
    expect(typeof sent.id).toBe('string');

    receiveNativeMessage({ source: '3c-shell', type: 'reply', id: 'someone-else', ok: true, result: { token: 'x' } });
    receiveNativeMessage({
      source: '3c-shell',
      type: 'reply',
      id: sent.id,
      ok: true,
      result: { token: 'apns-fcm-token', permission: 'granted' },
    });
    await expect(pending).resolves.toEqual({ token: 'apns-fcm-token', permission: 'granted' });
  });

  it('gives every request its own id', () => {
    void requestNative<'share'>({ type: 'share', url: 'https://x' }).catch(() => {});
    void requestNative<'share'>({ type: 'share', url: 'https://y' }).catch(() => {});
    const ids = posted.map((m) => JSON.parse(m).id);
    expect(new Set(ids).size).toBe(2);
  });

  it('rejects with the code from a failed reply', async () => {
    const pending = requestNative<'nativeSignIn'>({ type: 'nativeSignIn', provider: 'apple', nonce: 'abc' });
    const { id } = lastPosted();
    receiveNativeMessage({ source: '3c-shell', type: 'reply', id, ok: false, error: 'Not set up', code: 'not_configured' });
    await expect(pending).rejects.toMatchObject({ name: 'NativeBridgeError', code: 'not_configured', message: 'Not set up' });
  });

  it("rejects with 'no_bridge' outside the app", async () => {
    stubApp({ ua: 'Mozilla/5.0 Safari/604.1' });
    await expect(requestNative<'biometricLock'>({ type: 'biometricLock' })).rejects.toMatchObject({ code: 'no_bridge' });
  });

  it("rejects with 'timeout' when the shell never answers", async () => {
    vi.useFakeTimers();
    const pending = requestNative<'saveFile'>(
      { type: 'saveFile', filename: 'a.csv', mimeType: 'text/csv', base64: 'YQ==' },
      { timeoutMs: 1000 }
    );
    vi.advanceTimersByTime(1001);
    await expect(pending).rejects.toBeInstanceOf(NativeBridgeError);
    await expect(pending).rejects.toMatchObject({ code: 'timeout' });
  });
});

describe('native -> web receiver', () => {
  it('exposes window.__3C_BRIDGE__.receive and listens for message events', async () => {
    const seen: unknown[] = [];
    onNativeMessage((m) => seen.push(m));
    const w = window as unknown as { __3C_BRIDGE__: { version: number; receive: (m: unknown) => void } };
    expect(w.__3C_BRIDGE__.version).toBe(BRIDGE_VERSION);

    w.__3C_BRIDGE__.receive({ source: '3c-shell', type: 'pushToken', token: 'rotated' });
    windowListeners.message[0]({ data: JSON.stringify({ source: '3c-shell', type: 'pushToken', token: 'via-event' }) });
    windowListeners.message[0]({ data: { type: 'pushToken', token: 'not-ours' } });

    expect(seen).toEqual([
      { source: '3c-shell', type: 'pushToken', token: 'rotated' },
      { source: '3c-shell', type: 'pushToken', token: 'via-event' },
    ]);
  });

  it('drops message events from another window (an iframe), including unsolicited push tokens and replies', async () => {
    const seen: unknown[] = [];
    onNativeMessage((m) => seen.push(m));
    const iframeWindow = {};
    windowListeners.message[0]({ source: iframeWindow, data: { source: '3c-shell', type: 'pushToken', token: 'evil' } });

    const pending = requestNative<'pushToken'>({ type: 'pushToken', prompt: false }, { timeoutMs: 50 });
    const { id } = lastPosted();
    windowListeners.message[0]({
      source: iframeWindow,
      data: { source: '3c-shell', type: 'reply', id, ok: true, result: { token: 'evil', permission: 'granted' } },
    });
    // The same message from this window itself is accepted.
    windowListeners.message[0]({ source: window, data: { source: '3c-shell', type: 'pushToken', token: 'mine' } });

    expect(seen).toEqual([{ source: '3c-shell', type: 'pushToken', token: 'mine' }]);
    await expect(pending).rejects.toMatchObject({ code: 'timeout' });
  });

  it('unsubscribes', () => {
    const seen: unknown[] = [];
    const off = onNativeMessage((m) => seen.push(m));
    off();
    receiveNativeMessage({ source: '3c-shell', type: 'pushToken', token: 't' });
    expect(seen).toEqual([]);
  });
});
