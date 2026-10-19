import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const firestore = vi.hoisted(() => {
  const users = new Map<string, Record<string, unknown>>();
  const invites = new Map<string, Record<string, unknown>>();
  const candidateOnboarding = new Map<string, Record<string, unknown>>();
  const applications = new Map<string, Record<string, unknown>>();

  function docFor(
    collectionName: string,
    id: string,
    store: Map<string, Record<string, unknown>>
  ) {
    return {
      get: vi.fn(async () => {
        const data = store.get(id);
        return {
          exists: !!data,
          data: () => data,
          get: (field: string) => data?.[field],
        };
      }),
      set: vi.fn(async (data: Record<string, unknown>, options?: { merge?: boolean }) => {
        store.set(id, options?.merge ? { ...(store.get(id) ?? {}), ...data } : data);
      }),
      collectionName,
    };
  }

  const adminDb = {
    collection: vi.fn((name: string) => {
      const store =
        name === 'users'
          ? users
          : name === 'onboardingInvites'
            ? invites
            : name === 'candidateOnboarding'
              ? candidateOnboarding
              : applications;
      return { doc: (id: string) => docFor(name, id, store) };
    }),
    runTransaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => {
      const writes: Array<() => Promise<void>> = [];
      type Ref = {
        get: () => Promise<unknown>;
        set: (data: Record<string, unknown>, options?: { merge?: boolean }) => Promise<void>;
      };
      const result = await fn({
        get: (ref: Ref) => ref.get(),
        set: (ref: Ref, data: Record<string, unknown>, options?: { merge?: boolean }) => {
          writes.push(() => ref.set(data, options));
        },
      });
      for (const write of writes) await write();
      return result;
    }),
  };

  return { adminDb, users, invites, candidateOnboarding, applications };
});

vi.mock('@/lib/firebase/admin', () => ({ adminDb: firestore.adminDb }));
vi.mock('@/lib/auth/requireVerifiedAdmin', () => ({
  requireVerifiedUser: vi.fn(),
}));
vi.mock('@/lib/onboarding/activation', () => ({
  activateUser: vi.fn(),
  getActivationReadiness: vi.fn(),
}));
vi.mock('@/lib/chat/channels', () => ({ reconcileChatMembershipForUser: vi.fn(async () => []) }));
vi.mock('@/lib/alerts/alertTasks', () => ({ resolveAlertTasks: vi.fn(async () => undefined) }));

import { POST } from './route';
import { requireVerifiedUser } from '@/lib/auth/requireVerifiedAdmin';
import { activateUser, getActivationReadiness } from '@/lib/onboarding/activation';
import { reconcileChatMembershipForUser } from '@/lib/chat/channels';
import { resolveAlertTasks } from '@/lib/alerts/alertTasks';

const mockGate = requireVerifiedUser as unknown as ReturnType<typeof vi.fn>;
const mockActivateUser = activateUser as unknown as ReturnType<typeof vi.fn>;
const mockReadiness = getActivationReadiness as unknown as ReturnType<typeof vi.fn>;

function request(body: Record<string, unknown>) {
  return new NextRequest('http://localhost/api/portal/recruiting/convert', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

function seedRecruit() {
  firestore.users.set('ibo-owner', {
    fieldRole: 'ibo_level_1',
    displayName: 'IBO Owner',
  });
  firestore.users.set('recruit-1', {
    status: 'pending',
    fieldRole: 'entry_level_rep',
    displayName: 'Recruit',
  });
  firestore.invites.set('invite-1', {
    status: 'submitted',
    ownerId: 'ibo-owner',
    convertedUserId: 'recruit-1',
  });
}

beforeEach(() => {
  firestore.users.clear();
  firestore.invites.clear();
  firestore.candidateOnboarding.clear();
  firestore.applications.clear();
  vi.clearAllMocks();
  mockGate.mockResolvedValue({ ok: true, uid: 'ibo-owner' });
  mockReadiness.mockResolvedValue({ ready: true, missing: [] });
  mockActivateUser.mockImplementation(async (userId: string) => {
    const user = firestore.users.get(userId);
    if (!user) return null;
    if (user.status === 'active') return { alreadyActive: true };
    firestore.users.set(userId, { ...user, status: 'active' });
    return { alreadyActive: false };
  });
});

describe('POST /api/portal/recruiting/convert', () => {
  it('returns 409 and leaves an unfinished recruit invite submitted', async () => {
    seedRecruit();
    mockReadiness.mockResolvedValue({ ready: false, missing: ['w9', 'contract'] });

    const response = await POST(request({ inviteId: 'invite-1', action: 'approved' }));

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      error: 'not ready',
      missing: ['w9', 'contract'],
    });
    expect(firestore.invites.get('invite-1')).toMatchObject({ status: 'submitted' });
    expect(mockActivateUser).not.toHaveBeenCalled();
  });

  it('activates a finished recruit before flipping the invite', async () => {
    seedRecruit();

    const response = await POST(request({ inviteId: 'invite-1', action: 'approved' }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ success: true, status: 'converted' });
    expect(mockReadiness).toHaveBeenCalledWith('recruit-1');
    expect(mockActivateUser).toHaveBeenCalledWith('recruit-1');
    expect(firestore.users.get('recruit-1')).toMatchObject({ status: 'active' });
    expect(firestore.invites.get('invite-1')).toMatchObject({ status: 'converted' });
    expect(firestore.candidateOnboarding.get('invite-1')).toMatchObject({ status: 'approved' });
  });

  it('converts an already-active recruit without applying the readiness gate', async () => {
    seedRecruit();
    firestore.users.set('recruit-1', {
      ...firestore.users.get('recruit-1'),
      status: 'active',
    });
    mockReadiness.mockResolvedValue({ ready: false, missing: ['w9'] });

    const response = await POST(request({ inviteId: 'invite-1', action: 'approved' }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ success: true, status: 'converted' });
    expect(mockReadiness).not.toHaveBeenCalled();
    expect(mockActivateUser).toHaveBeenCalledWith('recruit-1');
    expect(firestore.invites.get('invite-1')).toMatchObject({ status: 'converted' });
  });

  it.each([
    ['a decommissioned hire', { status: 'inactive', deactivatedFromStatus: 'pending', decommission: { reason: 'no_show' } }],
    ['an inactive hire without a marker', { status: 'inactive' }],
    ['a hire carrying a decommission marker', { status: 'pending', decommission: { reason: 'no_show' } }],
  ])('refuses to activate %s and leaves the invite submitted', async (_label, userPatch) => {
    seedRecruit();
    firestore.users.set('recruit-1', { ...firestore.users.get('recruit-1'), ...userPatch });

    const response = await POST(request({ inviteId: 'invite-1', action: 'approved' }));

    expect(response.status).toBe(409);
    expect(mockActivateUser).not.toHaveBeenCalled();
    expect(firestore.users.get('recruit-1')).toMatchObject({ status: userPatch.status });
    expect(firestore.invites.get('invite-1')).toMatchObject({ status: 'submitted' });
  });

  it('still converts an active hire who carries a stale decommission marker', async () => {
    seedRecruit();
    firestore.users.set('recruit-1', {
      ...firestore.users.get('recruit-1'),
      status: 'active',
      decommission: { reason: 'no_show' },
    });

    const response = await POST(request({ inviteId: 'invite-1', action: 'approved' }));

    expect(response.status).toBe(200);
    expect(firestore.invites.get('invite-1')).toMatchObject({ status: 'converted' });
  });

  it('rejects a caller who cannot convert recruits', async () => {
    seedRecruit();
    firestore.users.set('ibo-owner', { fieldRole: 'entry_rep', displayName: 'Rep' });

    const response = await POST(request({ inviteId: 'invite-1', action: 'approved' }));

    expect(response.status).toBe(403);
    expect(firestore.invites.get('invite-1')).toMatchObject({ status: 'submitted' });
  });

  it('rejects a valid field converter who does not own the invite', async () => {
    seedRecruit();
    firestore.users.set('manager-1', { fieldRole: 'l1_manager', displayName: 'Manager' });
    mockGate.mockResolvedValue({ ok: true, uid: 'manager-1' });

    const response = await POST(request({ inviteId: 'invite-1', action: 'approved' }));

    expect(response.status).toBe(403);
    expect(firestore.invites.get('invite-1')).toMatchObject({ status: 'submitted' });
  });

  describe('role ceiling', () => {
    it.each([
      ['an invite for a director', { intendedFieldRole: 'director' }, {}],
      ['an invite for a regional manager', { intendedFieldRole: 'regional_manager' }, {}],
      ['a hire whose account was moved to director', { intendedFieldRole: 'entry_level_rep' }, { fieldRole: 'director' }],
    ])('refuses a field manager activating %s', async (_label, invitePatch, userPatch) => {
      seedRecruit();
      firestore.invites.set('invite-1', { ...firestore.invites.get('invite-1'), ...invitePatch });
      firestore.users.set('recruit-1', { ...firestore.users.get('recruit-1'), ...userPatch });

      const response = await POST(request({ inviteId: 'invite-1', action: 'approved' }));

      expect(response.status).toBe(403);
      expect(mockActivateUser).not.toHaveBeenCalled();
      expect(firestore.invites.get('invite-1')).toMatchObject({ status: 'submitted' });
      expect(firestore.users.get('recruit-1')).toMatchObject({ status: 'pending' });
    });

    it('lets a field manager activate a hire at a rep role', async () => {
      seedRecruit();
      firestore.invites.set('invite-1', { ...firestore.invites.get('invite-1'), intendedFieldRole: 'ae_tier_2' });
      firestore.users.set('recruit-1', { ...firestore.users.get('recruit-1'), fieldRole: 'ae_tier_2' });
      expect((await POST(request({ inviteId: 'invite-1', action: 'approved' }))).status).toBe(200);
    });

    it('lets management activate a director', async () => {
      seedRecruit();
      firestore.users.set('owner-1', { role: 'owner', displayName: 'Owner' });
      mockGate.mockResolvedValue({ ok: true, uid: 'owner-1' });
      firestore.invites.set('invite-1', { ...firestore.invites.get('invite-1'), intendedFieldRole: 'director' });
      firestore.users.set('recruit-1', { ...firestore.users.get('recruit-1'), fieldRole: 'director' });
      expect((await POST(request({ inviteId: 'invite-1', action: 'approved' }))).status).toBe(200);
      expect(mockActivateUser).toHaveBeenCalledWith('recruit-1');
    });
  });

  it('rejects a recruit end to end and deactivates the pending user', async () => {
    seedRecruit();

    const response = await POST(request({ inviteId: 'invite-1', action: 'rejected' }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ success: true, status: 'rejected' });
    expect(firestore.invites.get('invite-1')).toMatchObject({ status: 'rejected' });
    expect(firestore.users.get('recruit-1')).toMatchObject({ status: 'inactive' });
    expect(reconcileChatMembershipForUser).toHaveBeenCalledWith('recruit-1');
    expect(resolveAlertTasks).toHaveBeenCalledWith('recruit-1');
  });

  it('refuses to reject a recruit who is already active and leaves them active', async () => {
    seedRecruit();
    firestore.users.set('recruit-1', { ...firestore.users.get('recruit-1'), status: 'active' });

    const response = await POST(request({ inviteId: 'invite-1', action: 'rejected' }));

    expect(response.status).toBe(409);
    expect(firestore.users.get('recruit-1')).toMatchObject({ status: 'active' });
    expect(firestore.invites.get('invite-1')).toMatchObject({ status: 'submitted' });
  });
});
