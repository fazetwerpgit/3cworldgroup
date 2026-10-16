import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const fake = vi.hoisted(() => ({
  set: vi.fn(async () => undefined),
  gate: vi.fn(),
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
  it('stores a web token exactly as before (no platform)', async () => {
    expect((await POST(req('POST', { token: 'web-1' }))).status).toBe(200);
    expect(fake.set).toHaveBeenCalledWith(
      { pushTokens: { __union: ['web-1'] }, pushTokensUpdatedAt: '__TS__' },
      { merge: true }
    );
  });

  it("stores an iOS app token platform-tagged on nativePushTokens", async () => {
    expect((await POST(req('POST', { token: 'n-1', platform: 'ios-native' }))).status).toBe(200);
    expect(fake.set).toHaveBeenCalledWith(
      { nativePushTokens: { __union: [{ token: 'n-1', platform: 'ios-native' }] }, pushTokensUpdatedAt: '__TS__' },
      { merge: true }
    );
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
    expect(fake.set).not.toHaveBeenCalled();
  });
});
