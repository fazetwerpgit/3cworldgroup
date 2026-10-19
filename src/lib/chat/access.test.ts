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
  it('gives a demo account a working identity that reaches no channel audience', async () => {
    mockVerify.mockResolvedValue({ ok: true, uid: 'demo', name: 'App Review', email: 'a@x.com' });
    userDoc('demo', { status: 'active', role: 'rep', fieldRole: 'entry_level_rep', demoAccount: true });
    const res = await getVerifiedChatUser(req());
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.user.role).toBeUndefined();
      expect(res.user.fieldRole).toBeUndefined();
      expect(res.user.canModerate).toBe(false);
      expect(res.user.demoAccount).toBe(true);
    }
  });

  it('keeps the field role of an ordinary active rep', async () => {
    mockVerify.mockResolvedValue({ ok: true, uid: 'u2', name: 'Rep', email: 'r@x.com' });
    userDoc('u2', { status: 'active', fieldRole: 'entry_level_rep', demoAccount: false });
    const res = await getVerifiedChatUser(req());
    expect(res.ok && res.user.fieldRole).toBe('entry_level_rep');
    expect(res.ok && res.user.demoAccount).toBe(false);
  });

  it('never uses a full email as the chat display name', async () => {
    mockVerify.mockResolvedValue({ ok: true, uid: 'u3', name: 'jdoe@gmail.com', email: 'jdoe@gmail.com' });
    userDoc('u3', { status: 'active', fieldRole: 'entry_level_rep', email: 'jdoe@gmail.com' });
    const res = await getVerifiedChatUser(req());
    expect(res.ok && res.user.displayName).toBe('jdoe');
  });

  it('uses the profile displayName when set, else a neutral fallback', async () => {
    mockVerify.mockResolvedValue({ ok: true, uid: 'u4', name: 'Jane Doe', email: 'jane@x.com' });
    userDoc('u4', { status: 'active', fieldRole: 'entry_level_rep', displayName: 'Jane Doe', email: 'jane@x.com' });
    const named = await getVerifiedChatUser(req());
    expect(named.ok && named.user.displayName).toBe('Jane Doe');

    mockVerify.mockResolvedValue({ ok: true, uid: 'u5', name: 'u5', email: '' });
    userDoc('u5', { status: 'active', fieldRole: 'entry_level_rep' });
    const blank = await getVerifiedChatUser(req());
    expect(blank.ok && blank.user.displayName).toBe('3C User');
  });

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
