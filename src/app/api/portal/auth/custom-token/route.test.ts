import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

// Drives the real requireVerifiedUser gate against a mocked Admin SDK, so these
// tests cover the revocation check and the status gate, not a stubbed helper.
const fake = vi.hoisted(() => ({
  verifyIdToken: vi.fn(),
  createCustomToken: vi.fn(),
  userDoc: null as Record<string, unknown> | null,
}));

vi.mock('@/lib/firebase/admin', () => ({
  adminAuth: {
    verifyIdToken: (...args: unknown[]) => fake.verifyIdToken(...args),
    createCustomToken: (...args: unknown[]) => fake.createCustomToken(...args),
  },
  adminDb: {
    collection: () => ({
      doc: () => ({
        get: async () => ({ exists: fake.userDoc !== null, data: () => fake.userDoc ?? undefined }),
      }),
    }),
  },
}));

import { POST } from './route';

function req(authorization: string | null = 'Bearer id-token', body?: unknown) {
  return new NextRequest('http://localhost/api/portal/auth/custom-token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(authorization ? { Authorization: authorization } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

let uidCounter = 0;

beforeEach(() => {
  vi.clearAllMocks();
  // A fresh uid per test keeps the per-uid limiter from carrying over.
  uidCounter += 1;
  const uid = `u${uidCounter}`;
  fake.verifyIdToken.mockResolvedValue({ uid });
  fake.createCustomToken.mockImplementation(async (u: string) => `custom-for-${u}`);
  fake.userDoc = { status: 'active', role: 'user', fieldRole: 'sales_rep', email: 'rep@example.com' };
});

describe('POST /api/portal/auth/custom-token', () => {
  it('rejects a request with no token', async () => {
    const res = await POST(req(null));
    expect(res.status).toBe(401);
    expect(fake.verifyIdToken).not.toHaveBeenCalled();
    expect(fake.createCustomToken).not.toHaveBeenCalled();
  });

  it('rejects a revoked token (verifies with checkRevoked)', async () => {
    fake.verifyIdToken.mockRejectedValue(Object.assign(new Error('revoked'), { code: 'auth/id-token-revoked' }));
    const res = await POST(req());
    expect(res.status).toBe(401);
    expect(fake.verifyIdToken).toHaveBeenCalledWith('id-token', true);
    expect(fake.createCustomToken).not.toHaveBeenCalled();
  });

  it('answers 503 when the Auth backend fails without an auth/* code', async () => {
    fake.verifyIdToken.mockRejectedValue(Object.assign(new Error('socket hang up'), { code: 'app/network-error' }));
    const res = await POST(req());
    expect(res.status).toBe(503);
    expect(fake.createCustomToken).not.toHaveBeenCalled();
  });

  it('rejects an inactive user', async () => {
    fake.userDoc = { status: 'inactive', fieldRole: 'entry_rep' };
    const res = await POST(req());
    expect(res.status).toBe(403);
    expect(fake.createCustomToken).not.toHaveBeenCalled();
  });

  it('mints for a hire mid-onboarding (pending with a field role), as chat does', async () => {
    fake.userDoc = { status: 'pending', fieldRole: 'entry_rep' };
    const res = await POST(req());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ token: `custom-for-u${uidCounter}` });
  });

  it('rejects an unapproved self-signup (pending, no field role)', async () => {
    fake.userDoc = { status: 'pending' };
    expect((await POST(req())).status).toBe(403);
    expect(fake.createCustomToken).not.toHaveBeenCalled();
  });

  it.each(['rejected', 'disabled', undefined])('rejects a user whose status is %s', async (status) => {
    fake.userDoc = { status, fieldRole: 'entry_rep' };
    expect((await POST(req())).status).toBe(403);
    expect(fake.createCustomToken).not.toHaveBeenCalled();
  });

  it('rejects a disabled Firebase account even when the doc says pending', async () => {
    fake.userDoc = { status: 'pending', fieldRole: 'entry_rep' };
    fake.verifyIdToken.mockRejectedValue(Object.assign(new Error('disabled'), { code: 'auth/user-disabled' }));
    expect((await POST(req())).status).toBe(401);
    expect(fake.createCustomToken).not.toHaveBeenCalled();
  });

  it('rejects a token with no user doc', async () => {
    fake.userDoc = null;
    expect((await POST(req())).status).toBe(403);
    expect(fake.createCustomToken).not.toHaveBeenCalled();
  });

  it('mints a custom token for the verified uid', async () => {
    const res = await POST(req());
    expect(res.status).toBe(200);
    expect(res.headers.get('Cache-Control')).toBe('no-store');
    expect(await res.json()).toEqual({ token: `custom-for-u${uidCounter}` });
    expect(fake.createCustomToken).toHaveBeenCalledWith(`u${uidCounter}`);
  });

  it('ignores a uid in the body', async () => {
    const res = await POST(req('Bearer id-token', { uid: 'someone-else' }));
    expect(res.status).toBe(200);
    expect(fake.createCustomToken).toHaveBeenCalledTimes(1);
    expect(fake.createCustomToken).toHaveBeenCalledWith(`u${uidCounter}`);
  });

  it('rate-limits a looping client', async () => {
    const statuses: number[] = [];
    for (let i = 0; i < 11; i += 1) statuses.push((await POST(req())).status);
    expect(statuses.slice(0, 10).every((s) => s === 200)).toBe(true);
    expect(statuses[10]).toBe(429);
  });
});
