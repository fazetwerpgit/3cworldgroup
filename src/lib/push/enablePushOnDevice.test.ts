import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const fake = vi.hoisted(() => ({
  requestPushTokenDetailed: vi.fn(async () => ({ token: 'fcm-1', detail: 'ok' })),
  fetch: vi.fn(async () => ({ ok: true, status: 200 })),
}));

vi.mock('@/lib/firebase/config', () => ({ auth: { currentUser: { getIdToken: async () => 'id-token' } } }));
vi.mock('@/lib/firebase/messaging', () => ({ requestPushTokenDetailed: fake.requestPushTokenDetailed }));

import { askAndEnablePush } from './enablePushOnDevice';

let answer: NotificationPermission;
const requestPermission = vi.fn(async () => answer);

beforeEach(() => {
  answer = 'granted';
  requestPermission.mockClear();
  fake.requestPushTokenDetailed.mockClear();
  fake.fetch.mockClear();
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
