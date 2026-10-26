import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const fake = vi.hoisted(() => ({
  providers: ['apple.com'] as string[],
  profileExists: true,
  store: vi.fn(),
  adminAuth: {
    verifyIdToken: vi.fn(async (token: string) => {
      if (!token.startsWith('token-')) throw new Error('bad token');
      return { uid: token.slice(6) };
    }),
    getUser: vi.fn(),
  },
}));

vi.mock('@/lib/firebase/admin', () => ({
  adminDb: { doc: () => ({ get: async () => ({ exists: fake.profileExists }) }) },
  adminAuth: fake.adminAuth,
}));
vi.mock('@/lib/auth/appleSignIn', () => ({ storeAppleRefreshToken: fake.store }));

import { POST } from './route';

function request(body: unknown, token: string | null = 'token-u1') {
  return new NextRequest('http://localhost/api/portal/auth/apple-token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  fake.providers = ['apple.com'];
  fake.profileExists = true;
  fake.adminAuth.getUser.mockImplementation(async () => ({ providerData: fake.providers.map((providerId) => ({ providerId })) }));
  fake.store.mockResolvedValue({ status: 'stored' });
});

describe('POST /api/portal/auth/apple-token', () => {
  it('requires a verified ID token', async () => {
    expect((await POST(request({ authorizationCode: 'c' }, null))).status).toBe(401);
    expect((await POST(request({ authorizationCode: 'c' }, 'forged'))).status).toBe(401);
    expect(fake.store).not.toHaveBeenCalled();
  });

  it('requires a code', async () => {
    expect((await POST(request({}))).status).toBe(400);
    expect((await POST(request({ authorizationCode: 'x'.repeat(5000) }))).status).toBe(400);
  });

  it('refuses an account that does not sign in with Apple', async () => {
    fake.providers = ['google.com'];
    expect((await POST(request({ authorizationCode: 'c' }))).status).toBe(409);
    expect(fake.store).not.toHaveBeenCalled();
  });

  it('stores the token for the uid from the ID token only', async () => {
    const res = await POST(request({ authorizationCode: ' code-abc ', uid: 'someone-else' }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ stored: true });
    expect(fake.store).toHaveBeenCalledWith(expect.anything(), 'u1', 'code-abc');
  });

  it('answers 200 stored:false when the Apple key is not configured', async () => {
    fake.store.mockResolvedValue({ status: 'not_configured', missing: ['APPLE_KEY_ID'] });
    const res = await POST(request({ authorizationCode: 'c' }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ stored: false, reason: 'not_configured' });
  });

  it('answers 502 when Apple refuses the code', async () => {
    fake.store.mockResolvedValue({ status: 'failed', error: 'invalid_grant' });
    expect((await POST(request({ authorizationCode: 'c' }))).status).toBe(502);
  });

  it('stores nothing for a sign-in with no portal account (rejected and deleted)', async () => {
    fake.profileExists = false;
    expect((await POST(request({ authorizationCode: 'c' }))).status).toBe(404);
    expect(fake.store).not.toHaveBeenCalled();
  });
});
