import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// Mock the Admin SDK so we can drive the decoded token and the user doc directly.
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
  requireVerifiedUser,
  requireVerifiedManagement,
  requireVerifiedSelfOrManagement,
  requireVerifiedFieldManagerOrManagement,
  requireVerifiedAdmin,
  requireVerifiedRequester,
} from './requireVerifiedAdmin';

// A request carrying a Bearer token, unless a raw header is supplied.
function req(
  authorization: string | null = 'Bearer good-token',
  pathname = '/api/portal/forms/fiber-report'
) {
  return new NextRequest(`http://localhost${pathname}`, {
    headers: authorization ? { authorization } : {},
  });
}

// The user doc the mocked Firestore returns for the token's uid.
function userDoc(data: Record<string, unknown> | null) {
  userDocs.set('u1', data);
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

describe('requireVerifiedUser — token handling', () => {
  it('rejects a request with no Authorization header', async () => {
    const res = await requireVerifiedUser(req(null));
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.status).toBe(401);
      expect(res.error).toBe('Missing authentication token');
    }
    expect(verifyIdToken).not.toHaveBeenCalled();
  });

  it('rejects a malformed Authorization header that is not a Bearer token', async () => {
    const res = await requireVerifiedUser(req('Basic dXNlcjpwYXNz'));
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.status).toBe(401);
      expect(res.error).toBe('Missing authentication token');
    }
    expect(verifyIdToken).not.toHaveBeenCalled();
  });

  it('rejects a token the Admin SDK refuses to verify', async () => {
    verifyIdToken.mockRejectedValue(new Error('Firebase ID token has expired'));
    const res = await requireVerifiedUser(req());
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.status).toBe(401);
      expect(res.error).toBe('Invalid authentication token');
    }
    expect(userGet).not.toHaveBeenCalled();
  });

  it('rejects a valid token whose user doc does not exist', async () => {
    userDoc(null);
    const res = await requireVerifiedUser(req());
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.status).toBe(403);
      expect(res.error).toBe('User not found');
    }
  });

  // The mock stands in for the real Admin SDK regardless of what string it's handed,
  // so a passing suite proves nothing about the 'Bearer ' slice unless something
  // actually inspects the argument. These pin the exact value that crosses the boundary.
  it('forwards the Admin SDK exactly the bare token — no Bearer prefix, no leading space', async () => {
    userDoc({ status: 'active', fieldRole: 'entry_rep' });
    await requireVerifiedUser(req('Bearer good-token'));
    expect(verifyIdToken).toHaveBeenCalledTimes(1);
    expect(verifyIdToken).toHaveBeenCalledWith('good-token');
  });

  it('rejects a Bearer header with no token after it, and never calls the Admin SDK', async () => {
    const res = await requireVerifiedUser(req('Bearer'));
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.status).toBe(401);
      expect(res.error).toBe('Missing authentication token');
    }
    expect(verifyIdToken).not.toHaveBeenCalled();
  });

  it('rejects a header with no "Bearer " prefix at all, and never calls the Admin SDK', async () => {
    const res = await requireVerifiedUser(req('good-token'));
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.status).toBe(401);
      expect(res.error).toBe('Missing authentication token');
    }
    expect(verifyIdToken).not.toHaveBeenCalled();
  });
});

describe('requireVerifiedUser — account status', () => {
  it('accepts an active user and returns their stamped identity', async () => {
    userDoc({ status: 'active', displayName: 'Active Rep', email: 'a@x.com', fieldRole: 'entry_rep' });
    const res = await requireVerifiedUser(req());
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.uid).toBe('u1');
      expect(res.name).toBe('Active Rep');
      expect(res.email).toBe('a@x.com');
    }
  });

  it('rejects an unapproved self-signup (pending, no field role) by default', async () => {
    userDoc({ status: 'pending', email: 'bot@x.com' });
    const res = await requireVerifiedUser(req());
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.status).toBe(403);
      expect(res.error).toBe('Account is pending approval');
    }
  });

  it('rejects a mid-onboarding rep on a path outside the allowlist', async () => {
    userDoc({ status: 'pending', fieldRole: 'entry_rep', email: 'new@x.com' });
    const res = await requireVerifiedUser(req('Bearer good-token', '/api/portal/sales'));
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.status).toBe(403);
  });

  it('admits a pending hire on an allowlisted path', async () => {
    userDoc({ status: 'pending', fieldRole: 'entry_rep', displayName: 'New Rep', email: 'new@x.com' });
    const res = await requireVerifiedUser(req('Bearer good-token', '/api/portal/training'));
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.name).toBe('New Rep');
  });

  it('refuses a pending self-signup with no field role on an allowlisted path', async () => {
    userDoc({ status: 'pending', email: 'bot@x.com' });
    const res = await requireVerifiedUser(req('Bearer good-token', '/api/portal/training'));
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.status).toBe(403);
      expect(res.error).toBe('Account is pending approval');
    }
  });

  it('still rejects a pending doc whose fieldRole is not a real role value', async () => {
    userDoc({ status: 'pending', fieldRole: 'ceo', email: 'bot@x.com' });
    const res = await requireVerifiedUser(req('Bearer good-token', '/api/portal/training'));
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.status).toBe(403);
  });

  it('rejects a decommissioned rep who kept a valid token and their field role', async () => {
    userDoc({ status: 'inactive', fieldRole: 'entry_rep', email: 'gone@x.com' });
    const res = await requireVerifiedUser(req());
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.status).toBe(403);
      expect(res.error).toBe('Account is not active');
    }
  });

  it('refuses a deactivated account on an allowlisted path', async () => {
    userDoc({ status: 'inactive', fieldRole: 'entry_rep', email: 'gone@x.com' });
    const res = await requireVerifiedUser(req('Bearer good-token', '/api/portal/training'));
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.status).toBe(403);
      expect(res.error).toBe('Account is not active');
    }
  });

  it('rejects a legacy doc with no status field at all', async () => {
    userDoc({ email: 'legacy@x.com', fieldRole: 'entry_rep' });
    const res = await requireVerifiedUser(req());
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.status).toBe(403);
  });
});

describe('requireVerifiedAdmin', () => {
  it('accepts an active admin', async () => {
    userDoc({ status: 'active', role: 'admin', displayName: 'Boss', email: 'boss@x.com' });
    const res = await requireVerifiedAdmin(req());
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.uid).toBe('u1');
      expect(res.name).toBe('Boss');
    }
  });

  it('rejects a decommissioned admin who retained role: admin', async () => {
    userDoc({ status: 'inactive', role: 'admin', displayName: 'Ex Boss' });
    const res = await requireVerifiedAdmin(req());
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.status).toBe(403);
      // Revoked, not a role failure — the status gate runs first.
      expect(res.error).toBe('Account is not active');
    }
  });

  it('rejects a pending account regardless of what role its doc claims', async () => {
    userDoc({ status: 'pending', role: 'admin', fieldRole: 'entry_rep' });
    const res = await requireVerifiedAdmin(req());
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.status).toBe(403);
  });

  it('rejects an active non-admin with the admin-access error', async () => {
    userDoc({ status: 'active', fieldRole: 'entry_rep' });
    const res = await requireVerifiedAdmin(req());
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.status).toBe(403);
      expect(res.error).toBe('Forbidden: admin access required');
    }
  });

  it('rejects a missing token and a non-existent user doc', async () => {
    const noToken = await requireVerifiedAdmin(req(null));
    expect(noToken.ok).toBe(false);
    if (!noToken.ok) expect(noToken.status).toBe(401);

    userDoc(null);
    const noDoc = await requireVerifiedAdmin(req());
    expect(noDoc.ok).toBe(false);
    if (!noDoc.ok) expect(noDoc.error).toBe('User not found');
  });
});

describe('requireVerifiedManagement', () => {
  it('accepts active operations and reports isAdmin false', async () => {
    userDoc({ status: 'active', role: 'operations', displayName: 'Ops' });
    const res = await requireVerifiedManagement(req());
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.name).toBe('Ops');
      expect(res.isAdmin).toBe(false);
    }
  });

  it('reports isAdmin true for an admin', async () => {
    userDoc({ status: 'active', role: 'admin', displayName: 'Boss' });
    const res = await requireVerifiedManagement(req());
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.isAdmin).toBe(true);
  });

  it('rejects deactivated operations who kept their role', async () => {
    userDoc({ status: 'inactive', role: 'operations', displayName: 'Ex Ops' });
    const res = await requireVerifiedManagement(req());
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toBe('Account is not active');
  });
});

// The helper the rep-facing onboarding routes use — the one place where the
// status gate and the self/management boundary have to hold at the same time.
describe('requireVerifiedSelfOrManagement', () => {
  it('accepts an active user acting on their own data', async () => {
    userDoc({ status: 'active', fieldRole: 'entry_rep', displayName: 'Rep' });
    const res = await requireVerifiedSelfOrManagement(req(), 'u1');
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.isManagement).toBe(false);
  });

  it('rejects an active user reaching for someone else’s data', async () => {
    userDoc({ status: 'active', fieldRole: 'entry_rep' });
    const res = await requireVerifiedSelfOrManagement(req(), 'someone-else');
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.status).toBe(403);
      expect(res.error).toBe('Forbidden: you can only access your own data');
    }
  });

  it('accepts management acting on another user and flags isManagement', async () => {
    userDoc({ status: 'active', role: 'operations', displayName: 'Ops' });
    const res = await requireVerifiedSelfOrManagement(req(), 'someone-else');
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.isManagement).toBe(true);
  });

  it("uses the caller's document, not the target's, to decide management access", async () => {
    userDocs.set('u1', { status: 'active', fieldRole: 'entry_rep' });
    userDocs.set('target-user', { status: 'active', role: 'operations' });

    const res = await requireVerifiedSelfOrManagement(req(), 'target-user');

    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.status).toBe(403);
      expect(res.error).toBe('Forbidden: you can only access your own data');
    }
    expect(userGet).toHaveBeenCalledWith('u1');
    expect(userGet).not.toHaveBeenCalledWith('target-user');
  });

  it('rejects a mid-onboarding rep on their own data without the opt-in', async () => {
    userDoc({ status: 'pending', fieldRole: 'entry_rep' });
    const res = await requireVerifiedSelfOrManagement(req(), 'u1');
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toBe('Account is pending approval');
  });

  it('accepts a mid-onboarding rep on their own data on an allowlisted path', async () => {
    userDoc({ status: 'pending', fieldRole: 'entry_rep', displayName: 'New Rep' });
    const res = await requireVerifiedSelfOrManagement(
      req('Bearer good-token', '/api/portal/training/progress'),
      'u1'
    );
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.isManagement).toBe(false);
  });

  it('still confines a mid-onboarding rep to their own data on an allowlisted path', async () => {
    userDoc({ status: 'pending', fieldRole: 'entry_rep' });
    const res = await requireVerifiedSelfOrManagement(
      req('Bearer good-token', '/api/portal/training/progress'),
      'someone-else'
    );
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toBe('Forbidden: you can only access your own data');
  });

  it('rejects an unapproved self-signup on its own data on an allowlisted path', async () => {
    userDoc({ status: 'pending', email: 'bot@x.com' });
    const res = await requireVerifiedSelfOrManagement(
      req('Bearer good-token', '/api/portal/training/progress'),
      'u1'
    );
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toBe('Account is pending approval');
  });

  it('rejects a decommissioned rep on their own data on an allowlisted path', async () => {
    userDoc({ status: 'inactive', fieldRole: 'entry_rep' });
    const res = await requireVerifiedSelfOrManagement(
      req('Bearer good-token', '/api/portal/training/progress'),
      'u1'
    );
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toBe('Account is not active');
  });
});

describe('requireVerifiedFieldManagerOrManagement', () => {
  it('accepts an active field manager', async () => {
    userDoc({ status: 'active', fieldRole: 'l1_manager', displayName: 'Manager', email: 'm@x.com' });
    const res = await requireVerifiedFieldManagerOrManagement(req());
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.email).toBe('m@x.com');
  });

  it('rejects a decommissioned field manager who kept their management field role', async () => {
    userDoc({ status: 'inactive', fieldRole: 'l1_manager', displayName: 'Ex Manager' });
    const res = await requireVerifiedFieldManagerOrManagement(req());
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.status).toBe(403);
      expect(res.error).toBe('Account is not active');
    }
  });

  it('rejects an active entry rep', async () => {
    userDoc({ status: 'active', fieldRole: 'entry_rep' });
    const res = await requireVerifiedFieldManagerOrManagement(req());
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toBe('Forbidden: manager access required');
  });
});

// requireVerifiedRequester backs sales GET, sales/[id] GET+PUT, sales/stats GET, and
// notifications PUT. Unlike the hard-gates above it never 403s on role — it hands the
// route a resolved isManagement / isAdmin / isManagerOrAbove triple and lets the route
// decide how much to scope the query. Nothing else in this file pins down that triple.
describe('requireVerifiedRequester', () => {
  it('reports the full triple true for an admin', async () => {
    userDoc({ status: 'active', role: 'admin', displayName: 'Boss', email: 'boss@x.com' });
    const res = await requireVerifiedRequester(req());
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.isManagement).toBe(true);
      expect(res.isAdmin).toBe(true);
      expect(res.isManagerOrAbove).toBe(true);
    }
  });

  it('reports isManagement and isManagerOrAbove true, isAdmin false for operations', async () => {
    userDoc({ status: 'active', role: 'operations', displayName: 'Ops', email: 'ops@x.com' });
    const res = await requireVerifiedRequester(req());
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.isManagement).toBe(true);
      expect(res.isAdmin).toBe(false);
      expect(res.isManagerOrAbove).toBe(true);
    }
  });

  it('reports the full triple false for a plain rep', async () => {
    userDoc({ status: 'active', fieldRole: 'entry_rep', displayName: 'Rep', email: 'rep@x.com' });
    const res = await requireVerifiedRequester(req());
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.isManagement).toBe(false);
      expect(res.isAdmin).toBe(false);
      expect(res.isManagerOrAbove).toBe(false);
    }
  });

  it('reports isManagement false but isManagerOrAbove true for a management field role', async () => {
    userDoc({ status: 'active', fieldRole: 'l1_manager', displayName: 'Field Mgr', email: 'fm@x.com' });
    const res = await requireVerifiedRequester(req());
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.isManagement).toBe(false);
      expect(res.isAdmin).toBe(false);
      expect(res.isManagerOrAbove).toBe(true);
    }
  });
});

// *** The load-bearing distinction behind src/app/api/portal/sales/route.ts:61 ***
//
//   const salesRepId = gate.isManagement ? searchParams.get('salesRepId') : gate.uid;
//
// isManagement is admin/operations only. A management FIELD role (l1_manager through
// ibo_level_4, i.e. MANAGEMENT_FIELD_ROLES) makes isManagerOrAbove true but must NEVER
// make isManagement true. isManagerOrAbove is the more natural-sounding name for that
// route's check, so a future refactor could plausibly swap it in — and if it did, any
// l1_manager could pass ?salesRepId= and read another rep's customer PII, with every
// other test in this file still green (the plain-triple test above doesn't exercise a
// management field role against requireVerifiedSelfOrManagement). These two tests exist
// to go red on exactly that swap. Do not delete them as redundant.
describe('requireVerifiedRequester / requireVerifiedSelfOrManagement — management field role is not isManagement', () => {
  it('a management field role is isManagerOrAbove but NOT isManagement', async () => {
    userDoc({ status: 'active', fieldRole: 'l1_manager' });
    const res = await requireVerifiedRequester(req());
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.isManagement).toBe(false);
      expect(res.isManagerOrAbove).toBe(true);
    }
  });

  it('requireVerifiedSelfOrManagement still confines a management field role to their own data', async () => {
    userDoc({ status: 'active', fieldRole: 'l1_manager' });
    const res = await requireVerifiedSelfOrManagement(req(), 'some-other-uid');
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.status).toBe(403);
      expect(res.error).toBe('Forbidden: you can only access your own data');
    }
  });
});
