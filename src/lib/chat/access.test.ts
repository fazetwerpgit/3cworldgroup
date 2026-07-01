import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// Mock the token verifier and adminDb so we can drive user status.
vi.mock('@/lib/auth/requireVerifiedAdmin', () => ({
  requireVerifiedUser: vi.fn(),
}));

const userGet = vi.fn();
vi.mock('@/lib/firebase/admin', () => ({
  adminDb: {
    collection: () => ({ doc: () => ({ get: userGet }) }),
  },
}));

import { getVerifiedChatUser } from './access';
import { requireVerifiedUser } from '@/lib/auth/requireVerifiedAdmin';

const mockVerify = requireVerifiedUser as unknown as ReturnType<typeof vi.fn>;

function req() {
  return new NextRequest('http://localhost/api/portal/chat/messages');
}

beforeEach(() => {
  mockVerify.mockReset();
  userGet.mockReset();
});

describe('getVerifiedChatUser', () => {
  it('rejects when the token is invalid', async () => {
    mockVerify.mockResolvedValue({ ok: false, error: 'Invalid authentication token', status: 401 });
    const res = await getVerifiedChatUser(req());
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.status).toBe(401);
  });

  it('rejects an INACTIVE user even with a valid token and retained role', async () => {
    mockVerify.mockResolvedValue({ ok: true, uid: 'u1', name: 'Del Rep', email: 'd@x.com' });
    userGet.mockResolvedValue({ data: () => ({ status: 'inactive', fieldRole: 'l1_manager' }) });
    const res = await getVerifiedChatUser(req());
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.status).toBe(403);
  });

  it('rejects a pending user', async () => {
    mockVerify.mockResolvedValue({ ok: true, uid: 'u1', name: 'Pending', email: 'p@x.com' });
    userGet.mockResolvedValue({ data: () => ({ status: 'pending', fieldRole: 'entry_rep' }) });
    const res = await getVerifiedChatUser(req());
    expect(res.ok).toBe(false);
  });

  it('accepts an active user and resolves their role', async () => {
    mockVerify.mockResolvedValue({ ok: true, uid: 'u1', name: 'Active Admin', email: 'a@x.com' });
    userGet.mockResolvedValue({ data: () => ({ status: 'active', role: 'admin' }) });
    const res = await getVerifiedChatUser(req());
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.user.uid).toBe('u1');
      expect(res.user.role).toBe('admin');
      expect(res.user.canModerate).toBe(true);
    }
  });
});
