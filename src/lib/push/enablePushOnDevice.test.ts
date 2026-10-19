import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const fake = vi.hoisted(() => ({
  requestPushTokenDetailed: vi.fn(async (): Promise<{ token: string | null; detail: string }> => ({ token: 'fcm-1', detail: 'ok' })),
  fetch: vi.fn<(...args: unknown[]) => Promise<{ ok: boolean; status: number }>>(async () => ({ ok: true, status: 200 })),
  auth: { currentUser: null as null | { getIdToken: () => Promise<string | null> } },
}));

vi.mock('@/lib/firebase/config', () => ({ auth: fake.auth }));
vi.mock('@/lib/firebase/messaging', () => ({ requestPushTokenDetailed: fake.requestPushTokenDetailed }));

import { askAndEnablePush, enablePushOnDevice, enablePushOnDeviceDetailed, unregisterPushOnDevice } from './enablePushOnDevice';

let answer: NotificationPermission;
const requestPermission = vi.fn(async () => answer);

beforeEach(() => {
  answer = 'granted';
  requestPermission.mockClear();
  fake.requestPushTokenDetailed.mockClear();
  fake.fetch.mockClear();
  fake.auth.currentUser = { getIdToken: async () => 'id-token' };
  vi.stubGlobal('Notification', { permission: 'default', requestPermission });
  vi.stubGlobal('fetch', fake.fetch);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('askAndEnablePush', () => {
  it('asks synchronously, inside the tap, before any await', () => {
    void askAndEnablePush();
    expect(requestPermission).toHaveBeenCalledTimes(1);
  });

  it('registers the token through the shared path once granted', async () => {
    const out = await askAndEnablePush();
    expect(out).toEqual({ result: 'enabled', permission: 'granted', detail: 'ok' });
    expect(fake.fetch).toHaveBeenCalledWith('/api/portal/push/register', expect.objectContaining({ method: 'POST' }));
  });

  it('stops at a no, without registering', async () => {
    answer = 'denied';
    expect(await askAndEnablePush()).toEqual({ result: 'blocked', permission: 'denied', detail: 'permission-denied' });
    answer = 'default';
    expect((await askAndEnablePush()).permission).toBe('default');
    expect(fake.requestPushTokenDetailed).not.toHaveBeenCalled();
    expect(fake.fetch).not.toHaveBeenCalled();
  });

  it('reports a failed registration', async () => {
    fake.fetch.mockResolvedValueOnce({ ok: false, status: 500 });
    expect(await askAndEnablePush()).toEqual({ result: 'failed', permission: 'granted', detail: 'register-http-500' });
  });
});

describe('askAndEnablePush when the prompt throws', () => {
  it('fails with the current permission and the error', async () => {
    requestPermission.mockRejectedValueOnce(new Error('not allowed here'));
    expect(await askAndEnablePush()).toEqual({ result: 'failed', permission: 'default', detail: 'request-threw: not allowed here' });
    requestPermission.mockRejectedValueOnce('weird');
    expect((await askAndEnablePush()).detail).toBe('request-threw');
    expect(fake.fetch).not.toHaveBeenCalled();
  });
});

describe('enablePushOnDeviceDetailed', () => {
  it('registers the FCM token with the ID token', async () => {
    expect(await enablePushOnDeviceDetailed()).toEqual({ result: 'enabled', detail: 'ok' });
    expect(fake.fetch).toHaveBeenCalledWith('/api/portal/push/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer id-token' },
      body: JSON.stringify({ token: 'fcm-1' }),
    });
    expect(await enablePushOnDevice()).toBe('enabled');
  });

  it('is blocked, without registering, when there is no token', async () => {
    fake.requestPushTokenDetailed.mockResolvedValueOnce({ token: null, detail: 'permission-denied' });
    expect(await enablePushOnDeviceDetailed()).toEqual({ result: 'blocked', detail: 'permission-denied' });
    expect(fake.fetch).not.toHaveBeenCalled();
  });

  it('fails with the error, cut to 200 characters, when anything throws', async () => {
    fake.requestPushTokenDetailed.mockRejectedValueOnce(new TypeError('x'.repeat(300)));
    const out = await enablePushOnDeviceDetailed();
    expect(out.result).toBe('failed');
    expect(out.detail).toMatch(/^TypeError: x+$/);
    expect(out.detail).toHaveLength(200);
    fake.requestPushTokenDetailed.mockRejectedValueOnce('weird');
    expect(await enablePushOnDeviceDetailed()).toEqual({ result: 'failed', detail: 'unknown' });
  });

  it('sends an empty bearer when signed out (the server refuses it)', async () => {
    fake.auth.currentUser = null;
    fake.fetch.mockResolvedValueOnce({ ok: false, status: 401 });
    expect(await enablePushOnDeviceDetailed()).toEqual({ result: 'failed', detail: 'register-http-401' });
    expect((fake.fetch.mock.calls[0][1] as { headers: Record<string, string> }).headers.Authorization).toBe('Bearer ');
  });
});

describe('unregisterPushOnDevice', () => {
  beforeEach(() => {
    vi.stubGlobal('window', { Notification: {} });
    vi.stubGlobal('Notification', { permission: 'granted', requestPermission });
  });

  it("deletes this device's FCM token from the account, without prompting", async () => {
    await unregisterPushOnDevice();
    expect(requestPermission).not.toHaveBeenCalled();
    expect(fake.fetch).toHaveBeenCalledWith('/api/portal/push/register', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer id-token' },
      body: JSON.stringify({ token: 'fcm-1' }),
    });
  });

  it('does nothing unless permission is already granted', async () => {
    vi.stubGlobal('Notification', { permission: 'default', requestPermission });
    await unregisterPushOnDevice();
    expect(fake.requestPushTokenDetailed).not.toHaveBeenCalled();
    expect(fake.fetch).not.toHaveBeenCalled();
  });

  it('does nothing without the Notification API (server, iPhone Safari tab)', async () => {
    vi.stubGlobal('window', {});
    await unregisterPushOnDevice();
    vi.stubGlobal('window', undefined);
    await unregisterPushOnDevice();
    expect(fake.fetch).not.toHaveBeenCalled();
  });

  it('does nothing when signed out or with no token', async () => {
    fake.auth.currentUser = { getIdToken: async () => null };
    await unregisterPushOnDevice();
    expect(fake.requestPushTokenDetailed).not.toHaveBeenCalled();
    fake.auth.currentUser = { getIdToken: async () => 'id-token' };
    fake.requestPushTokenDetailed.mockResolvedValueOnce({ token: null, detail: 'no-token' });
    await unregisterPushOnDevice();
    expect(fake.fetch).not.toHaveBeenCalled();
  });

  it('never throws (sign-out must go on)', async () => {
    fake.fetch.mockRejectedValueOnce(new TypeError('offline'));
    await expect(unregisterPushOnDevice()).resolves.toBeUndefined();
    fake.requestPushTokenDetailed.mockRejectedValueOnce(new Error('messaging unsupported'));
    await expect(unregisterPushOnDevice()).resolves.toBeUndefined();
  });
});
