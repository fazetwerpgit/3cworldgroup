import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// Same Admin SDK mock shape as requireVerifiedAdmin.test.ts: drive the decoded
// token and the caller's user doc directly.
const verifyIdToken = vi.fn();
const userGet = vi.fn();
const userDocs = new Map<string, Record<string, unknown> | null>();
vi.mock('@/lib/firebase/admin', () => ({
  adminAuth: { verifyIdToken: (token: string) => verifyIdToken(token) },
  adminDb: {
    collection: vi.fn((name: string) => {
      if (name !== 'users') throw new Error(`Unexpected collection: ${name}`);
      return {
        doc: vi.fn((uid: string) => ({
          get: () => userGet(uid),
        })),
      };
    }),
  },
}));

import {
  requireVerifiedAdmin,
  requireVerifiedManagement,
  requireVerifiedSelfOrManagement,
  requireVerifiedFieldManagerOrManagement,
  requireVerifiedRequester,
} from './requireVerifiedAdmin';

function req() {
  return new NextRequest('http://localhost/api/portal/forms/fiber-report', {
    headers: { authorization: 'Bearer good-token' },
  });
}

function callerIs(role: string) {
  userDocs.set('u1', { status: 'active', role, displayName: 'Jeremy' });
}

beforeEach(() => {
  verifyIdToken.mockReset();
  userGet.mockReset();
  userDocs.clear();
  userGet.mockImplementation(async (uid: string) => {
    const data = userDocs.get(uid);
    return { exists: data !== null && data !== undefined, data: () => data ?? undefined };
  });
  verifyIdToken.mockResolvedValue({ uid: 'u1' });
});

// Owner sits above admin, so every gate that admits an admin must admit an
// owner. These are the server-side chokepoints ~50 API routes depend on: a
// literal role comparison sneaking back into any of them locks the owner out of
// the portal, and nothing else in the suite would notice.
describe('owner satisfies the admin-level gates', () => {
  it('passes requireVerifiedAdmin', async () => {
    callerIs('owner');
    const res = await requireVerifiedAdmin(req());
    expect(res.ok).toBe(true);
  });

  it('passes requireVerifiedManagement with isAdmin and isOwner set', async () => {
    callerIs('owner');
    const res = await requireVerifiedManagement(req());
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.isAdmin).toBe(true);
      expect(res.isOwner).toBe(true);
    }
  });

  it('passes requireVerifiedSelfOrManagement for someone else’s data', async () => {
    callerIs('owner');
    const res = await requireVerifiedSelfOrManagement(req(), 'someone-else');
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.isManagement).toBe(true);
  });

  it('passes requireVerifiedFieldManagerOrManagement', async () => {
    callerIs('owner');
    const res = await requireVerifiedFieldManagerOrManagement(req());
    expect(res.ok).toBe(true);
  });

  it('resolves as management, admin and manager-or-above', async () => {
    callerIs('owner');
    const res = await requireVerifiedRequester(req());
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.role).toBe('owner');
      expect(res.isManagement).toBe(true);
      expect(res.isAdmin).toBe(true);
      expect(res.isManagerOrAbove).toBe(true);
    }
  });
});

// isOwner must stay narrower than isAdmin — it is what guards granting the
// owner role itself and, later, the comp-plan margin.
describe('admin does not reach the owner tier', () => {
  it('is admin-level but not owner', async () => {
    callerIs('admin');
    const res = await requireVerifiedManagement(req());
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.isAdmin).toBe(true);
      expect(res.isOwner).toBe(false);
    }
  });

  it('leaves operations below admin level', async () => {
    callerIs('operations');
    const management = await requireVerifiedManagement(req());
    expect(management.ok).toBe(true);
    if (management.ok) {
      expect(management.isAdmin).toBe(false);
      expect(management.isOwner).toBe(false);
    }
    const admin = await requireVerifiedAdmin(req());
    expect(admin.ok).toBe(false);
  });

  it('still refuses a field rep', async () => {
    userDocs.set('u1', { status: 'active', fieldRole: 'ae_tier_1' });
    expect((await requireVerifiedAdmin(req())).ok).toBe(false);
    expect((await requireVerifiedManagement(req())).ok).toBe(false);
  });

  // Status is checked before role: an owner whose account was deactivated is
  // revoked like anyone else.
  it('refuses an inactive owner', async () => {
    userDocs.set('u1', { status: 'inactive', role: 'owner' });
    const res = await requireVerifiedAdmin(req());
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.status).toBe(403);
  });
});
