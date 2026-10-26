import { beforeEach, describe, expect, it, vi } from 'vitest';

const fake = vi.hoisted(() => ({
  verifyIdToken: vi.fn(),
  reject: vi.fn(),
}));

vi.mock('@/lib/firebase/admin', () => ({ adminAuth: { verifyIdToken: fake.verifyIdToken }, adminDb: { fake: true } }));
vi.mock('@/lib/auth/unlinkedSocialSignIn', () => ({ rejectUnlinkedSocialSignIn: fake.reject }));

import { POST } from './route';

function request(token: string | null) {
  return new Request('http://localhost/api/portal/auth/unlinked-social', {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
  fake.verifyIdToken.mockImplementation(async (token: string) => {
    if (token === 'token-apple') return { uid: 'u-apple', firebase: { sign_in_provider: 'apple.com' } };
    throw new Error('bad token');
  });
  fake.reject.mockResolvedValue({ status: 'deleted', provider: 'apple.com' });
});

describe('POST /api/portal/auth/unlinked-social', () => {
  it('requires a verified ID token', async () => {
    expect((await POST(request(null))).status).toBe(401);
    expect((await POST(request('forged'))).status).toBe(401);
    expect(fake.reject).not.toHaveBeenCalled();
  });

  it("acts only on the token's own uid and sign-in provider", async () => {
    const res = await POST(request('token-apple'));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ deleted: true });
    expect(fake.reject).toHaveBeenCalledWith(expect.anything(), 'u-apple', 'apple.com');
  });

  it('reports a kept account without deleting', async () => {
    fake.reject.mockResolvedValue({ status: 'kept', reason: 'not_recent' });
    const res = await POST(request('token-apple'));
    expect(await res.json()).toEqual({ deleted: false, reason: 'not_recent' });
  });

  it('passes an existing profile through', async () => {
    fake.reject.mockResolvedValue({ status: 'has_profile' });
    expect(await (await POST(request('token-apple'))).json()).toEqual({ deleted: false, reason: 'has_profile' });
  });

  it('returns 500 when the cleanup throws', async () => {
    fake.reject.mockRejectedValue(new Error('boom'));
    expect((await POST(request('token-apple'))).status).toBe(500);
  });
});
