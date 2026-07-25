import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// Mock the Admin SDK so we can drive the decoded token and the user doc directly.
const verifyIdToken = vi.fn();
const userGet = vi.fn();
vi.mock('@/lib/firebase/admin', () => ({
  adminAuth: { verifyIdToken: (token: string) => verifyIdToken(token) },
  adminDb: {
    collection: () => ({ doc: () => ({ get: userGet }) }),
  },
}));

import {
  requireVerifiedUser,
  requireVerifiedManagement,
  requireVerifiedSelfOrManagement,
  requireVerifiedFieldManagerOrManagement,
  requireVerifiedAdmin,
} from './requireVerifiedAdmin';

// A request carrying a Bearer token, unless a raw header is supplied.
function req(authorization: string | null = 'Bearer good-token') {
  return new NextRequest('http://localhost/api/portal/forms/fiber-report', {
    headers: authorization ? { authorization } : {},
  });
}

// The user doc the mocked Firestore returns for the token's uid.
function userDoc(data: Record<string, unknown> | null) {
  userGet.mockResolvedValue({ exists: data !== null, data: () => data ?? undefined });
}

beforeEach(() => {
  verifyIdToken.mockReset();
  userGet.mockReset();
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

  it('rejects a mid-onboarding rep (pending with a field role) by default', async () => {
    userDoc({ status: 'pending', fieldRole: 'entry_rep', email: 'new@x.com' });
    const res = await requireVerifiedUser(req());
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.status).toBe(403);
  });

  it('accepts a mid-onboarding rep when the route opts in with allowOnboarding', async () => {
    userDoc({ status: 'pending', fieldRole: 'entry_rep', displayName: 'New Rep', email: 'new@x.com' });
    const res = await requireVerifiedUser(req(), { allowOnboarding: true });
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.name).toBe('New Rep');
  });

  it('still rejects an unapproved self-signup under allowOnboarding', async () => {
    userDoc({ status: 'pending', email: 'bot@x.com' });
    const res = await requireVerifiedUser(req(), { allowOnboarding: true });
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.status).toBe(403);
      expect(res.error).toBe('Account is pending approval');
    }
  });

  it('still rejects a pending doc whose fieldRole is not a real role value', async () => {
    userDoc({ status: 'pending', fieldRole: 'ceo', email: 'bot@x.com' });
    const res = await requireVerifiedUser(req(), { allowOnboarding: true });
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

  it('rejects a decommissioned rep even on a route that allows onboarding', async () => {
    userDoc({ status: 'inactive', fieldRole: 'entry_rep', email: 'gone@x.com' });
    const res = await requireVerifiedUser(req(), { allowOnboarding: true });
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

  it('rejects a mid-onboarding rep on their own data without the opt-in', async () => {
    userDoc({ status: 'pending', fieldRole: 'entry_rep' });
    const res = await requireVerifiedSelfOrManagement(req(), 'u1');
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toBe('Account is pending approval');
  });

  it('accepts a mid-onboarding rep on their own data with allowOnboarding', async () => {
    userDoc({ status: 'pending', fieldRole: 'entry_rep', displayName: 'New Rep' });
    const res = await requireVerifiedSelfOrManagement(req(), 'u1', { allowOnboarding: true });
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.isManagement).toBe(false);
  });

  it('still confines a mid-onboarding rep to their own data under allowOnboarding', async () => {
    userDoc({ status: 'pending', fieldRole: 'entry_rep' });
    const res = await requireVerifiedSelfOrManagement(req(), 'someone-else', {
      allowOnboarding: true,
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toBe('Forbidden: you can only access your own data');
  });

  it('rejects an unapproved self-signup on its own data under allowOnboarding', async () => {
    userDoc({ status: 'pending', email: 'bot@x.com' });
    const res = await requireVerifiedSelfOrManagement(req(), 'u1', { allowOnboarding: true });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toBe('Account is pending approval');
  });

  it('rejects a decommissioned rep on their own data even under allowOnboarding', async () => {
    userDoc({ status: 'inactive', fieldRole: 'entry_rep' });
    const res = await requireVerifiedSelfOrManagement(req(), 'u1', { allowOnboarding: true });
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
