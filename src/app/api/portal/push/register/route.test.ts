import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const fake = vi.hoisted(() => ({
  set: vi.fn(async () => undefined),
  gate: vi.fn(),
  claim: vi.fn(async (..._args: unknown[]) => ({ removedFrom: [] as string[] })),
}));

vi.mock('@/lib/firebase/admin', () => ({
  adminDb: { collection: () => ({ doc: () => ({ set: fake.set }) }) },
}));
vi.mock('firebase-admin/firestore', () => ({
  FieldValue: {
    arrayUnion: (...items: unknown[]) => ({ __union: items }),
    arrayRemove: (...items: unknown[]) => ({ __remove: items }),
    serverTimestamp: () => '__TS__',
  },
}));
vi.mock('@/lib/auth/requireVerifiedAdmin', () => ({ requireVerifiedUser: fake.gate }));
vi.mock('@/lib/push/claimPushToken', () => ({ claimPushToken: fake.claim }));

import { DELETE, POST } from './route';

function req(method: 'POST' | 'DELETE', body: unknown) {
  return new NextRequest('http://localhost/api/portal/push/register', {
    method,
    headers: { Authorization: 'Bearer t', 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  fake.gate.mockResolvedValue({ ok: true, uid: 'u1' });
});

describe('/api/portal/push/register', () => {
  it('registers a web token (no platform) through claimPushToken', async () => {
    expect((await POST(req('POST', { token: ' web-1 ' }))).status).toBe(200);
    expect(fake.claim).toHaveBeenCalledWith(expect.anything(), 'u1', 'web-1', 'web');
  });

  it('registers an iOS app token as ios-native', async () => {
    expect((await POST(req('POST', { token: 'n-1', platform: 'ios-native' }))).status).toBe(200);
    expect(fake.claim).toHaveBeenCalledWith(expect.anything(), 'u1', 'n-1', 'ios-native');
  });

  it('still succeeds when the token moved from another account', async () => {
    fake.claim.mockResolvedValueOnce({ removedFrom: ['old-rep'] });
    const info = vi.spyOn(console, 'info').mockImplementation(() => {});
    expect((await POST(req('POST', { token: 'n-1', platform: 'ios-native' }))).status).toBe(200);
    expect(info).toHaveBeenCalledTimes(1);
    expect(String(info.mock.calls[0][0])).not.toContain('n-1');
    info.mockRestore();
  });

  it('answers 500 when the transaction fails', async () => {
    fake.claim.mockRejectedValueOnce(new Error('contention'));
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect((await POST(req('POST', { token: 'n-1', platform: 'ios-native' }))).status).toBe(500);
    err.mockRestore();
  });

  it('removes from the matching list', async () => {
    await DELETE(req('DELETE', { token: 'n-1', platform: 'ios-native' }));
    expect(fake.set).toHaveBeenLastCalledWith(
      { nativePushTokens: { __remove: [{ token: 'n-1', platform: 'ios-native' }] } },
      { merge: true }
    );
    await DELETE(req('DELETE', { token: 'web-1' }));
    expect(fake.set).toHaveBeenLastCalledWith({ pushTokens: { __remove: ['web-1'] } }, { merge: true });
  });

  it('rejects an unknown platform', async () => {
    expect((await POST(req('POST', { token: 'x', platform: 'android' }))).status).toBe(400);
    expect(fake.claim).not.toHaveBeenCalled();
  });
});
