import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// The hidden recruiter grant (users/{uid}.recruiter === true): it opens the
// recruiting gates and nothing else. Drives the Admin SDK through mocks so the
// gates read a real-shaped users doc.
const verifyIdToken = vi.fn();
const userDocs = new Map<string, Record<string, unknown>>();
vi.mock('@/lib/firebase/admin', () => ({
  adminAuth: { verifyIdToken: (...args: unknown[]) => verifyIdToken(...args) },
  adminDb: {
    collection: vi.fn((name: string) => {
      if (name !== 'users') throw new Error(`Unexpected collection: ${name}`);
      return {
        doc: vi.fn((uid: string) => ({
          get: async () => {
            const data = userDocs.get(uid);
            return { exists: data !== undefined, data: () => data };
          },
        })),
      };
    }),
  },
}));

import {
  requireVerifiedAdmin,
  requireVerifiedManagement,
  requireVerifiedRecruiting,
} from './requireVerifiedAdmin';
import { getRecruitingRequester } from '@/lib/recruiting/requester';
import { canApproveOnboardingItem, canOpenOnboardingItem } from '@/lib/onboarding/sensitiveAccess';
import {
  ONBOARDING_HUB,
  PEOPLE_HUB,
  REQUESTS_HUB,
  SETTINGS_HUB,
  SOLAR_HUB,
  CHAT_REPORTS_HUB,
  canOpenHubTab,
  hubRoles,
} from '@/components/portal/admin-d/adminHubs';
import { isRecruiter, permissionsFor, RECRUITER_GATE, userSatisfiesRoles, type GateRole } from '@/types';

const MASON = { status: 'active', fieldRole: 'general_manager', displayName: 'Mason', recruiter: true };
const PLAIN_GM = { status: 'active', fieldRole: 'general_manager', displayName: 'Gina' };

function req(pathname = '/api/portal/onboarding/review') {
  return new NextRequest(`http://localhost${pathname}`, { headers: { authorization: 'Bearer t' } });
}

function signedInAs(data: Record<string, unknown>) {
  userDocs.set('u1', data);
}

beforeEach(() => {
  userDocs.clear();
  verifyIdToken.mockReset();
  verifyIdToken.mockResolvedValue({ uid: 'u1' });
});

describe('isRecruiter', () => {
  it('is true only for the boolean true', () => {
    expect(isRecruiter({ recruiter: true })).toBe(true);
    for (const value of [false, 'true', 1, null, undefined, {}]) {
      expect(isRecruiter({ recruiter: value })).toBe(false);
    }
    expect(isRecruiter(null)).toBe(false);
  });
});

describe('requireVerifiedRecruiting', () => {
  it('admits a recruiter general manager, with no admin or owner rights', async () => {
    signedInAs(MASON);
    const gate = await requireVerifiedRecruiting(req());
    expect(gate).toEqual({ ok: true, uid: 'u1', name: 'Mason', isAdmin: false, isOwner: false });
  });

  it('refuses a plain general manager', async () => {
    signedInAs(PLAIN_GM);
    const gate = await requireVerifiedRecruiting(req());
    expect(gate.ok).toBe(false);
    if (!gate.ok) expect(gate.status).toBe(403);
  });

  it('refuses a recruiter whose account is switched off', async () => {
    signedInAs({ ...MASON, status: 'inactive' });
    const gate = await requireVerifiedRecruiting(req());
    expect(gate.ok).toBe(false);
  });

  it('ignores a truthy non-boolean recruiter value', async () => {
    signedInAs({ ...PLAIN_GM, recruiter: 'true' });
    expect((await requireVerifiedRecruiting(req())).ok).toBe(false);
  });

  it('keeps admitting management exactly as requireVerifiedManagement does', async () => {
    signedInAs({ status: 'active', role: 'operations', displayName: 'Ops' });
    expect(await requireVerifiedRecruiting(req())).toEqual({
      ok: true,
      uid: 'u1',
      name: 'Ops',
      isAdmin: false,
      isOwner: false,
    });
    signedInAs({ status: 'active', role: 'owner', displayName: 'Jacob' });
    expect(await requireVerifiedRecruiting(req())).toMatchObject({ ok: true, isAdmin: true, isOwner: true });
  });
});

describe('the recruiter grant does not open the non-recruiting gates', () => {
  it('fails requireVerifiedManagement (alerts, decommission, mark-complete, user management...)', async () => {
    signedInAs(MASON);
    const gate = await requireVerifiedManagement(req('/api/portal/pipeline/decommission'));
    expect(gate.ok).toBe(false);
    if (!gate.ok) expect(gate.status).toBe(403);
  });

  it('fails requireVerifiedAdmin', async () => {
    signedInAs(MASON);
    expect((await requireVerifiedAdmin(req('/api/portal/sensitive'))).ok).toBe(false);
  });

  it('cannot open or approve sensitive or owner-only onboarding items', async () => {
    signedInAs(MASON);
    const gate = await requireVerifiedRecruiting(req());
    if (!gate.ok) throw new Error('expected the recruiter through');
    for (const itemId of ['dl_photos', 'background_check', 'chargeback_card', 'w9', 'direct_deposit', 'contract']) {
      expect(canOpenOnboardingItem(itemId, gate)).toBe(false);
      expect(canApproveOnboardingItem(itemId, gate)).toBe(false);
    }
  });
});

describe('getRecruitingRequester', () => {
  it('lets a recruiter manage, see every invite, and hire at any role', async () => {
    userDocs.set('mason', MASON);
    const requester = await getRecruitingRequester('mason');
    expect(requester).toMatchObject({
      role: undefined,
      fieldRole: 'general_manager',
      canManage: true,
      canViewAll: true,
      canHireAnyRole: true,
    });
  });

  it('refuses a plain general manager', async () => {
    userDocs.set('gina', PLAIN_GM);
    const requester = await getRecruitingRequester('gina');
    expect(requester).toMatchObject({ canManage: false, canViewAll: false, canHireAnyRole: false });
  });

  it('keeps an L1 manager to their own invites and under the role ceiling', async () => {
    userDocs.set('l1', { status: 'active', fieldRole: 'l1_manager' });
    expect(await getRecruitingRequester('l1')).toMatchObject({
      canManage: true,
      canViewAll: false,
      canHireAnyRole: false,
    });
  });
});

describe('client gates', () => {
  const mason = { fieldRole: 'general_manager' as const, recruiter: true };
  const gm = { fieldRole: 'general_manager' as const };

  it('userSatisfiesRoles admits a recruiter only where RECRUITER_GATE is listed', () => {
    expect(userSatisfiesRoles(mason, [RECRUITER_GATE])).toBe(true);
    expect(userSatisfiesRoles(mason, ['admin', 'operations'])).toBe(false);
    expect(userSatisfiesRoles(gm, [RECRUITER_GATE])).toBe(false);
    expect(userSatisfiesRoles({ role: 'owner' as const }, ['admin'])).toBe(true);
  });

  it('adds the recruiting permissions and nothing else', () => {
    const added = permissionsFor(mason).filter((p) => !permissionsFor(gm).includes(p));
    expect(added.sort()).toEqual(['recruiting:convert']);
    expect(permissionsFor(mason)).toEqual(expect.arrayContaining(['recruiting:read', 'recruiting:write']));
    for (const blocked of ['sales:read:all', 'finance:read', 'users:write', 'users:delete', 'settings:read']) {
      expect(permissionsFor(mason)).not.toContain(blocked);
    }
  });

  it('opens every Hiring tab and no other admin hub', () => {
    const isRole = (...roles: GateRole[]) => userSatisfiesRoles(mason, roles);
    const hasPermission = (p: string) => permissionsFor(mason).includes(p);
    expect(ONBOARDING_HUB.tabs.filter((tab) => canOpenHubTab(tab, isRole, hasPermission)).map((t) => t.key)).toEqual([
      'todo',
      'recruits',
      'pipeline',
    ]);
    for (const hub of [PEOPLE_HUB, REQUESTS_HUB, SETTINGS_HUB, SOLAR_HUB, CHAT_REPORTS_HUB]) {
      expect(hub.tabs.some((tab) => canOpenHubTab(tab, isRole, hasPermission))).toBe(false);
      expect(isRole(...hubRoles(hub))).toBe(false);
    }
  });

  it('opens no Hiring tab for a plain general manager', () => {
    const isRole = (...roles: GateRole[]) => userSatisfiesRoles(gm, roles);
    const hasPermission = (p: string) => permissionsFor(gm).includes(p);
    expect(ONBOARDING_HUB.tabs.some((tab) => canOpenHubTab(tab, isRole, hasPermission))).toBe(false);
  });
});
