import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const fake = vi.hoisted(() => ({
  auth: { currentUser: null as null | { getIdToken: () => Promise<string> } },
  isStandaloneApp: vi.fn(() => false),
}));

vi.mock('@/lib/firebase/config', () => ({ auth: fake.auth }));
vi.mock('@/lib/pwa/standalone', () => ({ isStandaloneApp: () => fake.isStandaloneApp() }));

import { currentPermission, reportPushHealth } from './reportPushHealth';

const fetchMock = vi.fn();
const sent = () => {
  const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
  return { url, method: init.method, headers: init.headers, body: JSON.parse(init.body as string) };
};

beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockResolvedValue({ ok: true });
  vi.stubGlobal('fetch', fetchMock);
  fake.auth.currentUser = { getIdToken: async () => 'id-1' };
  fake.isStandaloneApp.mockReturnValue(false);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('reportPushHealth', () => {
  it('posts what this device saw, with the ID token, and leaves platform off on the web', async () => {
    fake.isStandaloneApp.mockReturnValue(true);
    await reportPushHealth({ supported: true, permission: 'granted', result: 'enabled / ok' });
    expect(sent()).toEqual({
      url: '/api/portal/push/health',
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer id-1' },
      body: { supported: true, permission: 'granted', result: 'enabled / ok', standalone: true },
    });
  });

  it('tags a report from the iOS app as ios-native', async () => {
    await reportPushHealth({ supported: true, permission: 'denied', result: 'no-token / denied', platform: 'ios-native' });
    expect(sent().body).toEqual({
      supported: true,
      permission: 'denied',
      result: 'no-token / denied',
      standalone: false,
      platform: 'ios-native',
    });
  });

  it('still sends (with an empty bearer the server refuses) when signed out', async () => {
    fake.auth.currentUser = null;
    await reportPushHealth({ supported: false, permission: 'no-api', result: 'unsupported' });
    expect(sent().headers).toEqual({ 'Content-Type': 'application/json', Authorization: 'Bearer ' });
  });

  it('never throws: not on a network failure, a token failure or a standalone check that throws', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('offline'));
    await expect(reportPushHealth({ supported: true, permission: 'granted', result: 'x' })).resolves.toBeUndefined();

    fake.auth.currentUser = { getIdToken: () => Promise.reject(new Error('token expired')) };
    await expect(reportPushHealth({ supported: true, permission: 'granted', result: 'x' })).resolves.toBeUndefined();

    fake.auth.currentUser = { getIdToken: async () => 'id-1' };
    fake.isStandaloneApp.mockImplementationOnce(() => {
      throw new ReferenceError('navigator is not defined');
    });
    await expect(reportPushHealth({ supported: true, permission: 'granted', result: 'x' })).resolves.toBeUndefined();
  });
});

describe('currentPermission', () => {
  it("reads Notification.permission, or 'no-api' where there is none (an iPhone Safari tab)", () => {
    vi.stubGlobal('Notification', { permission: 'denied' });
    expect(currentPermission()).toBe('denied');
    vi.unstubAllGlobals();
    vi.stubGlobal('Notification', undefined);
    expect(currentPermission()).toBe('no-api');
  });
});
