import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// Mock the token verifier and adminDb so we can drive user status.
vi.mock('@/lib/auth/requireVerifiedAdmin', () => ({
  requireVerifiedUser: vi.fn(),
}));

const userGet = vi.fn();
const userDocs = new Map<string, Record<string, unknown>>();
vi.mock('@/lib/firebase/admin', () => ({
  adminDb: {
    collection: vi.fn((name: string) => {
      if (name !== 'users') throw new Error(`Unexpected collection: ${name}`);
      return {
        doc: vi.fn((uid: string) => ({ get: () => userGet(uid) })),
      };
    }),
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
  userDocs.clear();
  userGet.mockImplementation(async (uid: string) => ({ data: () => userDocs.get(uid) ?? {} }));
});

function userDoc(uid: string, data: Record<string, unknown>) {
  userDocs.set(uid, data);
}

describe('getVerifiedChatUser', () => {
  it('rejects when the token is invalid', async () => {
    mockVerify.mockResolvedValue({ ok: false, error: 'Invalid authentication token', status: 401 });
    const res = await getVerifiedChatUser(req());
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.status).toBe(401);
  });

  it('rejects an INACTIVE user even with a valid token and retained role', async () => {
    mockVerify.mockResolvedValue({ ok: true, uid: 'u1', name: 'Del Rep', email: 'd@x.com' });
    userDoc('u1', { status: 'inactive', fieldRole: 'l1_manager' });
    const res = await getVerifiedChatUser(req());
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.status).toBe(403);
  });

  it('rejects a pending self-signup with no field role', async () => {
    mockVerify.mockResolvedValue({ ok: true, uid: 'u1', name: 'Pending', email: 'p@x.com' });
    userDoc('u1', { status: 'pending' });
    const res = await getVerifiedChatUser(req());
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.status).toBe(403);
  });

  it('rejects a pending internal manager role outside the onboarding invite list', async () => {
    mockVerify.mockResolvedValue({ ok: true, uid: 'u1', name: 'Manager', email: 'm@x.com' });
    userDoc('u1', { status: 'pending', fieldRole: 'general_manager' });
    const res = await getVerifiedChatUser(req());
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.status).toBe(403);
  });

  it('accepts a pending hire with an onboarding field role', async () => {
    mockVerify.mockResolvedValue({ ok: true, uid: 'u1', name: 'New Hire', email: 'h@x.com' });
    userDoc('u1', { status: 'pending', fieldRole: 'entry_rep' });
    const res = await getVerifiedChatUser(req());
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.user.uid).toBe('u1');
      expect(res.user.fieldRole).toBe('entry_rep');
    }
  });

  it('accepts an active user and resolves their role', async () => {
    mockVerify.mockResolvedValue({ ok: true, uid: 'u1', name: 'Active Admin', email: 'a@x.com' });
    userDoc('u1', { status: 'active', role: 'admin' });
    const res = await getVerifiedChatUser(req());
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.user.uid).toBe('u1');
      expect(res.user.role).toBe('admin');
      expect(res.user.canModerate).toBe(true);
    }
  });
});
