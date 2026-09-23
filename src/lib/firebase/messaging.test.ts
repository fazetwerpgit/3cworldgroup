// @vitest-environment jsdom
//
// A failed getToken resets the push subscription (unsubscribe + retry) only
// when the device is online and the failure isn't a network error; on weak
// signal the existing subscription is kept for the next refresh.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const getToken = vi.fn();
vi.mock('firebase/messaging', () => ({
  getMessaging: vi.fn(() => ({})),
  getToken: (...args: unknown[]) => getToken(...args),
  isSupported: vi.fn(async () => true),
}));
vi.mock('./config', () => ({ app: {} }));

const unsubscribe = vi.fn(async () => true);
let online = true;

beforeEach(() => {
  vi.resetModules();
  vi.stubEnv('NEXT_PUBLIC_FIREBASE_VAPID_KEY', 'test-vapid');
  getToken.mockReset();
  unsubscribe.mockClear();
  online = true;
  vi.stubGlobal('Notification', { permission: 'granted', requestPermission: vi.fn() });
  Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => online });
  Object.defineProperty(navigator, 'serviceWorker', {
    configurable: true,
    value: { register: vi.fn(async () => ({ pushManager: { getSubscription: async () => ({ unsubscribe }) } })) },
  });
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

async function request() {
  const { requestPushTokenDetailed } = await import('./messaging');
  return requestPushTokenDetailed();
}

describe('requestPushTokenDetailed', () => {
  it('resets a broken subscription while online', async () => {
    getToken.mockRejectedValueOnce(new Error('Registration failed - push service error')).mockResolvedValueOnce('fresh');
    expect(await request()).toEqual({ token: 'fresh', detail: 'ok-after-resubscribe' });
    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });

  it('keeps the subscription when the failure is a network error', async () => {
    getToken.mockRejectedValue(new TypeError('Load failed'));
    const result = await request();
    expect(result.token).toBeNull();
    expect(result.detail).toMatch(/^token-failed-kept/);
    expect(unsubscribe).not.toHaveBeenCalled();
    expect(getToken).toHaveBeenCalledTimes(1);
  });

  it('keeps the subscription while offline, whatever the error', async () => {
    online = false;
    getToken.mockRejectedValue(new Error('Registration failed - push service error'));
    expect((await request()).detail).toMatch(/^token-failed-kept/);
    expect(unsubscribe).not.toHaveBeenCalled();
  });
});
