import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const fake = vi.hoisted(() => {
  class NativeBridgeError extends Error {
    constructor(
      public code: string,
      message = code
    ) {
      super(message);
    }
  }
  return {
    requestNative: vi.fn(),
    isNativeApp: vi.fn(() => true),
    reportPushHealth: vi.fn(async () => {}),
    auth: { currentUser: null as null | { getIdToken: () => Promise<string | null> } },
    NativeBridgeError,
  };
});

vi.mock('@/lib/firebase/config', () => ({ auth: fake.auth }));
vi.mock('@/lib/push/reportPushHealth', () => ({ reportPushHealth: fake.reportPushHealth }));
vi.mock('./bridge', () => ({
  NativeBridgeError: fake.NativeBridgeError,
  requestNative: (...args: unknown[]) => fake.requestNative(...args),
}));
vi.mock('./isNativeApp', () => ({ isNativeApp: () => fake.isNativeApp() }));

import { nativePushNotAskedYet, registerNativePushToken, syncNativePush, unregisterNativePush } from './nativePush';

const TOKEN_KEY = '3c-native-push-token';
const fetchMock = vi.fn();
let store: Map<string, string>;
let storageBlocked: boolean;

function signIn(idToken: string | null = 'id-1') {
  fake.auth.currentUser = { getIdToken: vi.fn(async () => idToken) };
}

const sent = (call = 0) => {
  const [url, init] = fetchMock.mock.calls[call] as [string, RequestInit];
  return { url, method: init.method, headers: init.headers, body: JSON.parse(init.body as string) };
};

beforeEach(() => {
  fake.requestNative.mockReset();
  fake.reportPushHealth.mockClear();
  fake.isNativeApp.mockReturnValue(true);
  fake.auth.currentUser = null;
  fetchMock.mockReset();
  fetchMock.mockResolvedValue({ ok: true, status: 200 });
  vi.stubGlobal('fetch', fetchMock);
  store = new Map();
  storageBlocked = false;
  const guard = () => {
    if (storageBlocked) throw new Error('SecurityError');
  };
  vi.stubGlobal('window', {
    localStorage: {
      getItem: (k: string) => (guard(), store.get(k) ?? null),
      setItem: (k: string, v: string) => (guard(), void store.set(k, v)),
      removeItem: (k: string) => (guard(), void store.delete(k)),
    },
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('nativePushNotAskedYet', () => {
  it('is true only with no token and an undetermined permission, and never prompts', async () => {
    fake.requestNative.mockResolvedValue({ permission: 'undetermined' });
    await expect(nativePushNotAskedYet()).resolves.toBe(true);
    expect(fake.requestNative).toHaveBeenCalledWith({ type: 'pushToken', prompt: false });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(fake.reportPushHealth).not.toHaveBeenCalled();
  });

  it('is false when alerts are on or were refused', async () => {
    fake.requestNative.mockResolvedValueOnce({ permission: 'granted', token: 't' });
    await expect(nativePushNotAskedYet()).resolves.toBe(false);
    fake.requestNative.mockResolvedValueOnce({ permission: 'denied' });
    await expect(nativePushNotAskedYet()).resolves.toBe(false);
  });

  it('is false outside the app or when the bridge fails', async () => {
    fake.requestNative.mockRejectedValue(new Error('timeout'));
    await expect(nativePushNotAskedYet()).resolves.toBe(false);
    fake.isNativeApp.mockReturnValue(false);
    await expect(nativePushNotAskedYet()).resolves.toBe(false);
  });
});

describe('registerNativePushToken', () => {
  it('posts the token as an ios-native token with the ID token, and remembers it', async () => {
    signIn('id-1');
    await expect(registerNativePushToken('apns-1')).resolves.toBe(true);
    expect(sent()).toEqual({
      url: '/api/portal/push/register',
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer id-1' },
      body: { token: 'apns-1', platform: 'ios-native' },
    });
    expect(store.get(TOKEN_KEY)).toBe('apns-1');
  });

  it('does nothing outside the app or when signed out', async () => {
    fake.isNativeApp.mockReturnValue(false);
    signIn();
    await expect(registerNativePushToken('apns-1')).resolves.toBe(false);
    fake.isNativeApp.mockReturnValue(true);
    fake.auth.currentUser = null;
    await expect(registerNativePushToken('apns-1')).resolves.toBe(false);
    signIn(null);
    await expect(registerNativePushToken('apns-1')).resolves.toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('is false, and remembers nothing, when the server refuses or the network fails', async () => {
    signIn();
    fetchMock.mockResolvedValueOnce({ ok: false, status: 500 });
    await expect(registerNativePushToken('apns-1')).resolves.toBe(false);
    expect(store.has(TOKEN_KEY)).toBe(false);
    fetchMock.mockRejectedValueOnce(new TypeError('offline'));
    await expect(registerNativePushToken('apns-1')).resolves.toBe(false);
  });

  it('still reports success when storage is blocked', async () => {
    signIn();
    storageBlocked = true;
    await expect(registerNativePushToken('apns-1')).resolves.toBe(true);
  });
});

describe('syncNativePush', () => {
  it('is an error outside the app, without asking the shell or reporting', async () => {
    fake.isNativeApp.mockReturnValue(false);
    expect(await syncNativePush({ prompt: true })).toEqual({ state: 'error', message: 'Not running in the 3C app.' });
    expect(fake.requestNative).not.toHaveBeenCalled();
    expect(fake.reportPushHealth).not.toHaveBeenCalled();
  });

  it('registers a granted token and reports it on', async () => {
    signIn();
    fake.requestNative.mockResolvedValue({ permission: 'granted', token: 'apns-1' });
    expect(await syncNativePush({ prompt: true })).toEqual({ state: 'on' });
    expect(fake.requestNative).toHaveBeenCalledWith({ type: 'pushToken', prompt: true });
    expect(sent().body).toEqual({ token: 'apns-1', platform: 'ios-native' });
    expect(fake.reportPushHealth).toHaveBeenCalledWith({
      supported: true,
      permission: 'granted',
      result: 'enabled / native',
      platform: 'ios-native',
    });
  });

  it('passes the silent flag through on app open', async () => {
    fake.requestNative.mockResolvedValue({ permission: 'undetermined' });
    await syncNativePush({ prompt: false });
    expect(fake.requestNative).toHaveBeenCalledWith({ type: 'pushToken', prompt: false });
  });

  it("is an error when the token can't be saved", async () => {
    signIn();
    fetchMock.mockResolvedValue({ ok: false, status: 503 });
    fake.requestNative.mockResolvedValue({ permission: 'granted', token: 'apns-1' });
    expect(await syncNativePush({ prompt: true })).toEqual({
      state: 'error',
      message: "Couldn't save this phone for notifications. Try again.",
    });
    expect(fake.reportPushHealth).toHaveBeenCalledWith(expect.objectContaining({ permission: 'granted', result: 'failed / register' }));
  });

  it('is off with the permission when the shell has no token', async () => {
    fake.requestNative.mockResolvedValue({ permission: 'denied' });
    expect(await syncNativePush({ prompt: true })).toEqual({ state: 'off', permission: 'denied' });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(fake.reportPushHealth).toHaveBeenCalledWith(expect.objectContaining({ permission: 'denied', result: 'no-token / denied' }));
  });

  it('reads a denied bridge error as off/denied', async () => {
    fake.requestNative.mockRejectedValue(new fake.NativeBridgeError('denied'));
    expect(await syncNativePush({ prompt: true })).toEqual({ state: 'off', permission: 'denied' });
    expect(fake.reportPushHealth).toHaveBeenCalledWith(expect.objectContaining({ permission: 'denied', result: 'failed / denied' }));
  });

  it('reads any other bridge error, or a plain throw, as an error with an unknown permission', async () => {
    fake.requestNative.mockRejectedValueOnce(new fake.NativeBridgeError('timeout'));
    expect(await syncNativePush({ prompt: true })).toEqual({ state: 'error', message: "Couldn't turn on notifications. Try again." });
    expect(fake.reportPushHealth).toHaveBeenLastCalledWith(expect.objectContaining({ permission: 'unknown', result: 'failed / timeout' }));

    fake.requestNative.mockRejectedValueOnce(new Error('boom'));
    expect((await syncNativePush({ prompt: false })).state).toBe('error');
    expect(fake.reportPushHealth).toHaveBeenLastCalledWith(expect.objectContaining({ permission: 'unknown', result: 'failed / failed' }));
  });
});

describe('unregisterNativePush', () => {
  it("deletes this phone's last registered token from the account and forgets it", async () => {
    signIn('id-2');
    store.set(TOKEN_KEY, 'apns-9');
    await unregisterNativePush();
    expect(sent()).toEqual({
      url: '/api/portal/push/register',
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer id-2' },
      body: { token: 'apns-9', platform: 'ios-native' },
    });
    expect(store.has(TOKEN_KEY)).toBe(false);
  });

  it('does nothing outside the app, with no token on record, or when signed out', async () => {
    signIn();
    fake.isNativeApp.mockReturnValue(false);
    store.set(TOKEN_KEY, 'apns-9');
    await unregisterNativePush();
    fake.isNativeApp.mockReturnValue(true);
    store.clear();
    await unregisterNativePush();
    store.set(TOKEN_KEY, 'apns-9');
    fake.auth.currentUser = null;
    await unregisterNativePush();
    signIn(null);
    await unregisterNativePush();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(store.get(TOKEN_KEY)).toBe('apns-9');
  });

  it('keeps the token on record when the network fails, and never throws', async () => {
    signIn();
    store.set(TOKEN_KEY, 'apns-9');
    fetchMock.mockRejectedValueOnce(new TypeError('offline'));
    await expect(unregisterNativePush()).resolves.toBeUndefined();
    expect(store.get(TOKEN_KEY)).toBe('apns-9');
  });

  it('does nothing when storage is blocked (no token can be read)', async () => {
    signIn();
    storageBlocked = true;
    await unregisterNativePush();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
