import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const nameTaken = vi.hoisted(() => ({ value: false }));
vi.mock('@/lib/users/displayNameTaken', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/users/displayNameTaken')>()),
  isDisplayNameTaken: vi.fn(async () => nameTaken.value),
}));
vi.mock('next/server', async () => {
  const actual = await vi.importActual<typeof import('next/server')>('next/server');
  return {
    ...actual,
    after: vi.fn((callback: () => unknown) => {
      void callback();
    }),
  };
});

const firestore = vi.hoisted(() => {
  const users = new Map<string, Record<string, unknown>>();
  const updates: Array<{ userId: string; data: Record<string, unknown> }> = [];
  const adminDb = {
    collection: vi.fn((collectionName: string) => {
      if (collectionName !== 'users') throw new Error(`Unexpected collection: ${collectionName}`);
      return {
        where: (field: string, _op: string, value: unknown) => ({
          get: vi.fn(async () => ({
            docs: [...users.entries()]
              .filter(([, data]) => data[field] === value)
              .map(([id, data]) => ({ id, get: (key: string) => data[key] })),
          })),
        }),
        doc: (userId: string) => ({
          get: vi.fn(async () => {
            const data = users.get(userId);
            return {
              exists: !!data,
              get: (field: string) => data?.[field],
              data: () => data,
            };
          }),
          update: vi.fn(async (data: Record<string, unknown>) => {
            updates.push({ userId, data });
            users.set(userId, { ...(users.get(userId) ?? {}), ...data });
          }),
          delete: vi.fn(async () => {
            users.delete(userId);
          }),
        }),
      };
    }),
  };
  const adminAuth = {
    updateUser: vi.fn(async () => undefined),
    revokeRefreshTokens: vi.fn(async () => undefined),
    deleteUser: vi.fn(async () => undefined),
  };
  return { adminAuth, adminDb, users, updates };
});

vi.mock('@/lib/firebase/admin', () => ({ adminDb: firestore.adminDb, adminAuth: firestore.adminAuth }));
vi.mock('firebase-admin/firestore', () => ({
  FieldValue: { delete: vi.fn(() => '__DELETE__'), serverTimestamp: vi.fn(() => '__SERVER_TS__') },
}));
vi.mock('@/lib/auth/requireVerifiedAdmin', () => ({
  requireVerifiedManagement: vi.fn(),
}));
vi.mock('@/lib/validation/address', () => ({
  validateAddress: vi.fn(() => ({ ok: true, clean: {} })),
}));
vi.mock('@/lib/alerts/alertTasks', () => ({
  resolveAlertTasks: vi.fn(async () => undefined),
}));
vi.mock('@/lib/alerts/dispatch', () => ({
  dispatchToUser: vi.fn(async () => undefined),
}));
vi.mock('@/lib/esign/autoSend', () => ({
  sendPendingEsignDocs: vi.fn(async () => undefined),
}));
vi.mock('@/lib/email/templates', () => ({
  appBaseUrl: vi.fn(() => 'http://localhost:3005'),
  checklistReadyEmail: vi.fn(() => ({ subject: 'Checklist ready', html: 'Checklist ready' })),
}));
vi.mock('@/lib/chat/restampAuthor', () => ({ restampAuthor: vi.fn(async () => undefined) }));
vi.mock('@/lib/users/restampDisplayName', () => ({ restampDisplayName: vi.fn(async () => undefined) }));
vi.mock('@/lib/chat/channels', () => ({ reconcileChatMembershipForUser: vi.fn(async () => []) }));

import { DELETE, GET, PUT } from './route';
import { after } from 'next/server';
import { requireVerifiedManagement } from '@/lib/auth/requireVerifiedAdmin';
import { resolveAlertTasks } from '@/lib/alerts/alertTasks';
import { sendPendingEsignDocs } from '@/lib/esign/autoSend';
import { purgeSensitiveUserData } from '@/lib/users/purgeSensitiveUserData';
import { reconcileChatMembershipForUser } from '@/lib/chat/channels';

vi.mock('@/lib/users/purgeSensitiveUserData', () => ({
  purgeSensitiveUserData: vi.fn(async () => ({ userSensitive: 0, files: 0, failures: [] })),
}));

import { writeAdminAudit } from '@/lib/audit/adminAudit';

const revokeAppleMock = vi.hoisted(() =>
  vi.fn<(db: unknown, uid: string) => Promise<{ status: string }>>(async () => ({ status: 'none' }))
);
vi.mock('@/lib/auth/appleSignIn', () => ({ revokeAppleSignIn: revokeAppleMock }));
vi.mock('@/lib/audit/adminAudit', () => ({ writeAdminAudit: vi.fn(async () => undefined) }));
const readinessMock = vi.hoisted(() =>
  vi.fn<(userId: string, fieldRole: string, isIBO: boolean) => Promise<{ ready: boolean; missing: string[] }>>(
    async () => ({ ready: true, missing: [] })
  )
);
const packetOnceMock = vi.hoisted(() => vi.fn<(userId: string) => Promise<boolean>>(async () => true));
vi.mock('@/lib/onboarding/activation', () => ({
  getActivationReadinessForRole: readinessMock,
  sendOnboardingPacketOnce: packetOnceMock,
}));

const mockGate = requireVerifiedManagement as unknown as ReturnType<typeof vi.fn>;
const mockResolveAlertTasks = resolveAlertTasks as unknown as ReturnType<typeof vi.fn>;

function request(body: Record<string, unknown>) {
  return new NextRequest('http://localhost/api/portal/auth/users/pending-user', {
    method: 'PUT',
    body: JSON.stringify(body),
  });
}

function params() {
  return { params: Promise.resolve({ id: 'pending-user' }) };
}

beforeEach(() => {
  firestore.users.clear();
  firestore.updates.length = 0;
  vi.clearAllMocks();
  mockGate.mockResolvedValue({ ok: true, uid: 'admin-1', name: 'Admin', isAdmin: true });
  readinessMock.mockResolvedValue({ ready: true, missing: [] });
});

describe('PUT /api/portal/auth/users/[id] activation readiness gate', () => {
  const pendingHire = () =>
    firestore.users.set('pending-user', {
      status: 'pending',
      fieldRole: 'entry_level_rep',
      displayName: 'Pending Rep',
    });

  it('refuses Accept for a hire whose checklist is not complete, naming what is open', async () => {
    pendingHire();
    readinessMock.mockResolvedValue({ ready: false, missing: ['w9', 'contract'] });

    const response = await PUT(request({ status: 'active', fieldRole: 'ae_tier_1' }), params());

    expect(response.status).toBe(409);
    const body = (await response.json()) as { error: string; missing: string[] };
    expect(body.missing).toEqual(['w9', 'contract']);
    expect(body.error).toContain('W-9, Contract');
    // Checked against the checklist of the role they would hold.
    expect(readinessMock).toHaveBeenCalledWith('pending-user', 'ae_tier_1', false);
    expect(firestore.updates).toHaveLength(0);
    expect(firestore.adminAuth.updateUser).not.toHaveBeenCalled();
  });

  it('sends the owner packet (once-guarded) when Accept activates a complete checklist hire', async () => {
    pendingHire();

    const response = await PUT(request({ status: 'active' }), params());

    expect(response.status).toBe(200);
    expect(packetOnceMock).toHaveBeenCalledTimes(1);
    expect(packetOnceMock).toHaveBeenCalledWith('pending-user');
  });

  it('sends no packet for a refused Accept or a promotion to a no-checklist role', async () => {
    pendingHire();
    readinessMock.mockResolvedValue({ ready: false, missing: ['w9'] });
    await PUT(request({ status: 'active' }), params());
    pendingHire();
    await PUT(request({ fieldRole: 'general_manager' }), params());

    expect(packetOnceMock).not.toHaveBeenCalled();
  });

  it('refuses a plain status flip to active the same way', async () => {
    pendingHire();
    readinessMock.mockResolvedValue({ ready: false, missing: ['onboarding_submission'] });

    const response = await PUT(request({ status: 'active' }), params());

    expect(response.status).toBe(409);
    expect(firestore.updates).toHaveLength(0);
  });

  it('does not gate promoting a pending hire to a role with no checklist', async () => {
    pendingHire();
    readinessMock.mockResolvedValue({ ready: false, missing: ['w9'] });

    for (const body of [{ fieldRole: 'general_manager' }, { role: 'operations' }]) {
      firestore.updates.length = 0;
      pendingHire();
      const response = await PUT(request(body), params());
      expect(response.status).toBe(200);
      expect(firestore.updates[0]?.data).toMatchObject({ status: 'active' });
    }
    expect(readinessMock).not.toHaveBeenCalled();
  });

  it('gates pending -> inactive -> active, and stamps where the account came from', async () => {
    pendingHire();
    readinessMock.mockResolvedValue({ ready: false, missing: ['w9'] });

    const off = await PUT(request({ status: 'inactive' }), params());
    expect(off.status).toBe(200);
    expect(firestore.users.get('pending-user')).toMatchObject({ status: 'inactive', deactivatedFromStatus: 'pending' });

    firestore.updates.length = 0;
    const on = await PUT(request({ status: 'active' }), params());
    expect(on.status).toBe(409);
    expect(firestore.updates).toHaveLength(0);
    expect(firestore.adminAuth.updateUser).not.toHaveBeenCalledWith('pending-user', { disabled: false });
  });

  it('gates an older inactive invite hire who was never activated (no activatedAt, no stamp)', async () => {
    firestore.users.set('pending-user', { status: 'inactive', fieldRole: 'entry_level_rep', onboardingInviteId: 'inv-1' });
    readinessMock.mockResolvedValue({ ready: false, missing: ['contract'] });

    const response = await PUT(request({ status: 'active' }), params());

    expect(response.status).toBe(409);
  });

  it.each([
    ['deactivated while active', { deactivatedFromStatus: 'active', onboardingInviteId: 'inv-1' }],
    ['activated before (activatedAt)', { activatedAt: new Date('2026-09-25'), onboardingInviteId: 'inv-1' }],
    ['an older rep with no invite and no stamps', {}],
  ])('never gates reactivating a rep %s', async (_label, extra) => {
    firestore.users.set('pending-user', { status: 'inactive', fieldRole: 'ae_tier_1', ...extra });
    readinessMock.mockResolvedValue({ ready: false, missing: ['w9'] });

    const response = await PUT(request({ status: 'active' }), params());

    expect(response.status).toBe(200);
    expect(readinessMock).not.toHaveBeenCalled();
  });

  it('allows Accept once every item is approved', async () => {
    pendingHire();

    const response = await PUT(request({ status: 'active', fieldRole: 'ae_tier_1' }), params());

    expect(response.status).toBe(200);
    expect(firestore.updates[0]?.data).toMatchObject({ status: 'active', fieldRole: 'ae_tier_1' });
  });

  it("refuses Accept while the hire's name copies another user's exactly", async () => {
    pendingHire();
    nameTaken.value = true;
    try {
      const response = await PUT(request({ status: 'active', fieldRole: 'ae_tier_1' }), params());
      expect(response.status).toBe(400);
      expect((await response.json()).error).toContain('before approving');
      expect(firestore.updates).toHaveLength(0);
    } finally {
      nameTaken.value = false;
    }
  });

  it('never gates reactivating an inactive account', async () => {
    firestore.users.set('pending-user', { status: 'inactive', fieldRole: 'entry_level_rep', displayName: 'Old Rep' });
    readinessMock.mockResolvedValue({ ready: false, missing: ['w9'] });

    const response = await PUT(request({ status: 'active' }), params());

    expect(response.status).toBe(200);
    expect(readinessMock).not.toHaveBeenCalled();
  });

  it('never gates other status edits on a pending hire', async () => {
    pendingHire();
    readinessMock.mockResolvedValue({ ready: false, missing: ['w9'] });

    const response = await PUT(request({ status: 'inactive' }), params());

    expect(response.status).toBe(200);
    expect(readinessMock).not.toHaveBeenCalled();
  });

  it('rejects an empty role instead of reading it as an assignment', async () => {
    pendingHire();

    for (const body of [{ fieldRole: '' }, { role: '' }]) {
      const response = await PUT(request(body), params());
      expect(response.status).toBe(400);
    }
    expect(firestore.updates).toHaveLength(0);
  });
});

describe('PUT /api/portal/auth/users/[id] self-deleted accounts', () => {
  it('refuses to reactivate an account the person deleted themselves (409)', async () => {
    firestore.users.set('pending-user', {
      status: 'inactive',
      selfDeleted: true,
      fieldRole: 'entry_level_rep',
      displayName: 'Deleted user',
    });
    const response = await PUT(request({ status: 'active' }), params());
    expect(response.status).toBe(409);
    expect(firestore.updates).toEqual([]);
    expect(firestore.adminAuth.updateUser).not.toHaveBeenCalled();

    expect((await PUT(request({ status: 'pending' }), params())).status).toBe(409);
  });

  it('still allows a non-status edit on it', async () => {
    firestore.users.set('pending-user', { status: 'inactive', selfDeleted: true, displayName: 'Deleted user' });
    expect((await PUT(request({ status: 'inactive' }), params())).status).toBe(200);
  });
});

describe('PUT /api/portal/auth/users/[id] role assignment', () => {
  it('kicks off onboarding and does not activate a pending l1 manager', async () => {
    firestore.users.set('pending-user', {
      status: 'pending',
      displayName: 'Pending Manager',
    });

    const response = await PUT(request({ fieldRole: 'l1_manager' }), params());

    expect(response.status).toBe(200);
    expect(firestore.updates[0]?.data).toMatchObject({ fieldRole: 'l1_manager' });
    expect(firestore.updates[0]?.data).not.toHaveProperty('status');
    expect(mockResolveAlertTasks).toHaveBeenCalledWith('pending-user', ['pending_assignment']);
    expect(after).toHaveBeenCalledOnce();
  });

  it('does not assign a role or kick off onboarding on a name-only save of a pending user', async () => {
    firestore.users.set('pending-user', { status: 'pending', displayName: 'Pending Signup' });

    const response = await PUT(request({ displayName: 'Pending Signup Fixed', phone: '' }), params());

    expect(response.status).toBe(200);
    expect(firestore.updates[0]?.data).not.toHaveProperty('fieldRole');
    expect(firestore.updates[0]?.data).not.toHaveProperty('status');
    expect(mockResolveAlertTasks).not.toHaveBeenCalled();
    expect(sendPendingEsignDocs).not.toHaveBeenCalled();
    expect(after).not.toHaveBeenCalled();
  });

  it('still activates a pending general manager immediately', async () => {
    firestore.users.set('pending-user', {
      status: 'pending',
      displayName: 'Pending General Manager',
    });

    const response = await PUT(request({ fieldRole: 'general_manager' }), params());

    expect(response.status).toBe(200);
    expect(firestore.updates[0]?.data).toMatchObject({
      fieldRole: 'general_manager',
      status: 'active',
      activatedAt: '__SERVER_TS__',
    });
    expect(firestore.updates[0]?.data).not.toHaveProperty('hireDate');
  });

  it('does not re-kick onboarding when the user already holds that role', async () => {
    firestore.users.set('pending-user', {
      status: 'pending',
      fieldRole: 'l1_manager',
      displayName: 'Pending Manager',
    });

    const response = await PUT(request({ fieldRole: 'l1_manager' }), params());

    expect(response.status).toBe(200);
    expect(mockResolveAlertTasks).not.toHaveBeenCalled();
    expect(firestore.updates[0]?.data).not.toHaveProperty('status');
  });

  it('does not kick off onboarding when Accept sets active and entry rep together', async () => {
    firestore.users.set('pending-user', {
      status: 'pending',
      fieldRole: 'entry_level_rep',
      displayName: 'Pending Rep',
    });

    const response = await PUT(
      request({ status: 'active', fieldRole: 'entry_rep' }),
      params()
    );

    expect(response.status).toBe(200);
    expect(firestore.updates[0]?.data).toMatchObject({
      status: 'active',
      fieldRole: 'entry_rep',
      activatedAt: '__SERVER_TS__',
    });
    expect(firestore.updates[0]?.data).not.toHaveProperty('hireDate');
    expect(mockResolveAlertTasks).toHaveBeenCalledOnce();
    expect(mockResolveAlertTasks).toHaveBeenCalledWith('pending-user', [
      'pending_assignment',
      'stalled_rep',
      'review_needed',
      'activation_ready',
    ]);
    expect(sendPendingEsignDocs).not.toHaveBeenCalled();
  });

  it('closes the onboarding alert tasks when a pending hire is activated by status alone', async () => {
    firestore.users.set('pending-user', {
      status: 'pending',
      fieldRole: 'entry_rep',
      displayName: 'Pending Rep',
    });

    const response = await PUT(request({ status: 'active' }), params());

    expect(response.status).toBe(200);
    expect(firestore.updates[0]?.data).toMatchObject({ status: 'active', activatedAt: '__SERVER_TS__' });
    expect(mockResolveAlertTasks).toHaveBeenCalledOnce();
    expect(mockResolveAlertTasks).toHaveBeenCalledWith('pending-user', [
      'pending_assignment',
      'stalled_rep',
      'review_needed',
      'activation_ready',
    ]);
  });

  it('does not close onboarding alerts when an inactive account is reactivated', async () => {
    firestore.users.set('pending-user', { status: 'inactive', fieldRole: 'entry_rep', displayName: 'Rep' });

    const response = await PUT(request({ status: 'active' }), params());

    expect(response.status).toBe(200);
    expect(mockResolveAlertTasks).not.toHaveBeenCalled();
  });

  it('still saves the profile when its Auth account is already gone', async () => {
    firestore.users.set('pending-user', { status: 'inactive', displayName: 'Old Name', deleteIncomplete: true });
    firestore.adminAuth.updateUser.mockRejectedValueOnce({ code: 'auth/user-not-found' });

    const response = await PUT(request({ displayName: 'New Name' }), params());

    expect(response.status).toBe(200);
    expect(firestore.users.get('pending-user')?.displayName).toBe('New Name');
  });

  it('keeps any other Auth name-update failure fatal and writes nothing', async () => {
    firestore.users.set('pending-user', { status: 'active', displayName: 'Old Name' });
    firestore.adminAuth.updateUser.mockRejectedValueOnce({ code: 'auth/internal-error' });

    const response = await PUT(request({ displayName: 'New Name' }), params());

    expect(response.status).toBe(500);
    expect(firestore.updates).toHaveLength(0);
  });

  it('resolves every open alert task when the user is set inactive', async () => {
    firestore.users.set('pending-user', { status: 'pending', displayName: 'Spam Signup' });

    const response = await PUT(request({ status: 'inactive' }), params());

    expect(response.status).toBe(200);
    expect(mockResolveAlertTasks).toHaveBeenCalledOnce();
    expect(mockResolveAlertTasks).toHaveBeenCalledWith('pending-user', undefined);
  });

  it('does not stamp activatedAt when an inactive account is reactivated', async () => {
    firestore.users.set('pending-user', {
      status: 'inactive',
      fieldRole: 'entry_rep',
      displayName: 'Inactive Rep',
    });

    const response = await PUT(request({ status: 'active' }), params());

    expect(response.status).toBe(200);
    expect(firestore.updates[0]?.data).toMatchObject({ status: 'active' });
    expect(firestore.updates[0]?.data).not.toHaveProperty('activatedAt');
  });

  it('does not kick off onboarding when an active user is promoted', async () => {
    firestore.users.set('pending-user', {
      status: 'active',
      fieldRole: 'entry_rep',
      displayName: 'Active Rep',
    });

    const response = await PUT(request({ fieldRole: 'l1_manager' }), params());

    expect(response.status).toBe(200);
    expect(firestore.updates[0]?.data).toMatchObject({ fieldRole: 'l1_manager' });
    expect(mockResolveAlertTasks).not.toHaveBeenCalled();
    expect(sendPendingEsignDocs).not.toHaveBeenCalled();
  });

  it('recomputes chat channel membership when the role or status changes', async () => {
    firestore.users.set('pending-user', { status: 'active', fieldRole: 'l1_manager', displayName: 'Demoted' });

    await PUT(request({ fieldRole: 'entry_rep' }), params());
    expect(reconcileChatMembershipForUser).toHaveBeenCalledWith('pending-user');

    vi.mocked(reconcileChatMembershipForUser).mockClear();
    await PUT(request({ status: 'inactive' }), params());
    expect(reconcileChatMembershipForUser).toHaveBeenCalledWith('pending-user');

    vi.mocked(reconcileChatMembershipForUser).mockClear();
    await PUT(request({ displayName: 'Name Only' }), params());
    expect(reconcileChatMembershipForUser).not.toHaveBeenCalled();
  });

  it('recomputes chat membership when a solar role is granted or removed (the Solar channel)', async () => {
    firestore.users.set('pending-user', { status: 'active', fieldRole: 'entry_rep', displayName: 'Dual' });

    await PUT(request({ solarRole: 'entry_canvasser' }), params());
    expect(reconcileChatMembershipForUser).toHaveBeenCalledWith('pending-user');

    vi.mocked(reconcileChatMembershipForUser).mockClear();
    await PUT(request({ solarRole: null }), params());
    expect(reconcileChatMembershipForUser).toHaveBeenCalledWith('pending-user');
  });

  it('rejects an operations caller assigning a platform role', async () => {
    firestore.users.set('pending-user', { status: 'pending', fieldRole: 'entry_rep' });
    mockGate.mockResolvedValue({ ok: true, uid: 'ops-1', name: 'Ops', isAdmin: false });

    const response = await PUT(request({ role: 'admin' }), params());

    expect(response.status).toBe(403);
    expect(firestore.updates).toHaveLength(0);
  });

  it('rejects an operations caller editing an existing platform-role account', async () => {
    firestore.users.set('pending-user', { status: 'active', role: 'admin' });
    mockGate.mockResolvedValue({ ok: true, uid: 'ops-1', name: 'Ops', isAdmin: false });

    const response = await PUT(request({ displayName: 'Attempted rewrite' }), params());

    expect(response.status).toBe(403);
    expect(firestore.updates).toHaveLength(0);
  });

  it('clears the decommission marker when a decommissioned rep is set active here', async () => {
    firestore.users.set('pending-user', { status: 'inactive', decommission: { reason: 'quit' } });

    const response = await PUT(request({ status: 'active' }), params());

    expect(response.status).toBe(200);
    expect(firestore.updates[0]?.data).toMatchObject({ status: 'active', decommission: '__DELETE__' });
    // The record is deleted, so the audit keeps what it said (never its notes).
    expect((writeAdminAudit as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0].details.decommissionCleared).toEqual({
      previousReason: 'quit',
      decommissionedBy: null,
    });
  });

  it('leaves decommission alone when the save does not reactivate', async () => {
    firestore.users.set('pending-user', { status: 'inactive', decommission: { reason: 'quit' } });

    await PUT(request({ displayName: 'Renamed Rep' }), params());

    expect(firestore.updates[0]?.data).not.toHaveProperty('decommission');
  });

  it('audits an edit by field name and status/role transition, never by personal value', async () => {
    firestore.users.set('pending-user', { status: 'inactive', fieldRole: 'entry_rep', displayName: 'Rep One' });

    await PUT(request({ phone: '555-867-5309', status: 'active', fieldRole: 'l1_manager' }), params());

    expect(writeAdminAudit).toHaveBeenCalledTimes(1);
    const entry = (writeAdminAudit as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(entry).toMatchObject({
      action: 'user.update',
      actorUid: 'admin-1',
      targetUid: 'pending-user',
      targetName: 'Rep One',
      details: {
        status: { from: 'inactive', to: 'active' },
        role: { from: 'entry_rep', to: 'l1_manager' },
      },
    });
    expect(entry.details.fields).toEqual(expect.arrayContaining(['phone', 'status', 'fieldRole']));
    expect(JSON.stringify(entry)).not.toContain('555-867-5309');
  });

  it('writes no audit row when the caller is refused', async () => {
    firestore.users.set('pending-user', { status: 'active', role: 'admin' });
    mockGate.mockResolvedValue({ ok: true, uid: 'ops-1', name: 'Ops', isAdmin: false });

    await PUT(request({ displayName: 'Attempted rewrite' }), params());

    expect(writeAdminAudit).not.toHaveBeenCalled();
  });
});

describe('PUT /api/portal/auth/users/[id] manager', () => {
  beforeEach(() => {
    firestore.users.set('mgr-old', { status: 'active', fieldRole: 'regional_manager' });
    firestore.users.set('gm', { status: 'active', fieldRole: 'general_manager' });
    firestore.users.set('rep-2', { status: 'active', fieldRole: 'entry_rep' });
    firestore.users.set('gone-admin', { status: 'inactive', role: 'admin' });
    // An invited hire: the invite claim wrote both fields.
    firestore.users.set('pending-user', {
      status: 'active',
      fieldRole: 'entry_rep',
      reportsToId: 'mgr-old',
      managerId: 'mgr-old',
    });
  });

  it('moves reportsToId with managerId, so readers see the new manager', async () => {
    const response = await PUT(request({ managerId: 'gm' }), params());

    expect(response.status).toBe(200);
    expect(firestore.users.get('pending-user')).toMatchObject({ reportsToId: 'gm', managerId: 'gm' });
  });

  it('clears both fields when the manager is cleared', async () => {
    const response = await PUT(request({ managerId: null }), params());

    expect(response.status).toBe(200);
    expect(firestore.updates[0]?.data).toMatchObject({ reportsToId: '__DELETE__', managerId: '__DELETE__' });
  });

  it.each([
    ['a non-manager', 'rep-2'],
    ['an inactive admin', 'gone-admin'],
    ['a missing user', 'nobody'],
    ['the person themselves', 'pending-user'],
  ])('rejects %s as manager', async (_label, managerId) => {
    const response = await PUT(request({ managerId }), params());

    expect(response.status).toBe(400);
    expect(firestore.updates).toHaveLength(0);
  });

  it('accepts re-sending the stored manager even if they are no longer eligible', async () => {
    firestore.users.set('mgr-old', { status: 'inactive', fieldRole: 'regional_manager' });

    const response = await PUT(request({ managerId: 'mgr-old' }), params());

    expect(response.status).toBe(200);
  });
});

describe('PUT /api/portal/auth/users/[id] input validation', () => {
  beforeEach(() => {
    firestore.users.set('pending-user', { status: 'active', fieldRole: 'entry_rep' });
  });

  it.each([
    ['fieldRole null', { fieldRole: null }],
    ["fieldRole ''", { fieldRole: '' }],
    ['role null', { role: null }],
    ["role ''", { role: '' }],
    ['role and fieldRole together', { role: 'admin', fieldRole: 'entry_rep' }],
    ['an object managerId', { managerId: { evil: true } }],
    ["an empty managerId", { managerId: '' }],
    ['a numeric phone', { phone: 12345 }],
    ['an overlong phone', { phone: '5'.repeat(41) }],
    ['an array territoryId', { territoryId: ['x'] }],
  ])('rejects %s with 400 and writes nothing', async (_label, body) => {
    const response = await PUT(request(body), params());

    expect(response.status).toBe(400);
    expect(firestore.updates).toHaveLength(0);
  });
});

describe('/api/portal/auth/users/[id] mainLine', () => {
  beforeEach(() => {
    firestore.users.set('pending-user', { status: 'active', fieldRole: 'entry_rep', solarRole: 'entry_canvasser' });
  });

  async function getUser() {
    const response = await GET(new NextRequest('http://localhost/api/portal/auth/users/pending-user'), params());
    return (await response.json()).user as Record<string, unknown>;
  }

  it('GET returns a valid mainLine, else null', async () => {
    expect((await getUser()).mainLine).toBeNull();
    firestore.users.set('pending-user', { status: 'active', fieldRole: 'entry_rep', mainLine: 'solar' });
    expect((await getUser()).mainLine).toBe('solar');
    firestore.users.set('pending-user', { status: 'active', fieldRole: 'entry_rep', mainLine: 'wind' });
    expect((await getUser()).mainLine).toBeNull();
  });

  it('GET keeps the management gate', async () => {
    mockGate.mockResolvedValue({ ok: false, error: 'Forbidden', status: 403 });
    const response = await GET(new NextRequest('http://localhost/api/portal/auth/users/pending-user'), params());
    expect(response.status).toBe(403);
  });

  it.each(['fiber', 'solar'])('PUT sets mainLine %s', async (line) => {
    const response = await PUT(request({ mainLine: line }), params());
    expect(response.status).toBe(200);
    expect(firestore.updates.at(-1)?.data.mainLine).toBe(line);
  });

  it.each([null, ''])('PUT clears mainLine on %j', async (value) => {
    const response = await PUT(request({ mainLine: value }), params());
    expect(response.status).toBe(200);
    expect(firestore.updates.at(-1)?.data.mainLine).toBe('__DELETE__');
  });

  it('PUT leaves mainLine alone when absent', async () => {
    await PUT(request({ displayName: 'Dual Rep' }), params());
    expect(firestore.updates.at(-1)?.data).not.toHaveProperty('mainLine');
  });

  it.each(['Solar', 'wind', 1, true, { line: 'solar' }])('PUT rejects mainLine %j with 400 and writes nothing', async (value) => {
    const response = await PUT(request({ mainLine: value }), params());
    expect(response.status).toBe(400);
    expect(firestore.updates).toHaveLength(0);
  });

  it('PUT keeps the management gate', async () => {
    mockGate.mockResolvedValue({ ok: false, error: 'Forbidden', status: 403 });
    const response = await PUT(request({ mainLine: 'solar' }), params());
    expect(response.status).toBe(403);
    expect(firestore.updates).toHaveLength(0);
  });
});

describe('PUT /api/portal/auth/users/[id] self and last-owner protection', () => {
  it('refuses an admin deactivating themselves', async () => {
    firestore.users.set('pending-user', { status: 'active', role: 'admin' });
    mockGate.mockResolvedValue({ ok: true, uid: 'pending-user', name: 'Admin', isAdmin: true });

    const response = await PUT(request({ status: 'inactive' }), params());

    expect(response.status).toBe(400);
    expect(firestore.updates).toHaveLength(0);
    expect(firestore.adminAuth.updateUser).not.toHaveBeenCalled();
  });

  it('refuses an admin dropping their own platform role', async () => {
    firestore.users.set('pending-user', { status: 'active', role: 'admin' });
    mockGate.mockResolvedValue({ ok: true, uid: 'pending-user', name: 'Admin', isAdmin: true });

    const response = await PUT(request({ fieldRole: 'entry_rep' }), params());

    expect(response.status).toBe(400);
    expect(firestore.updates).toHaveLength(0);
  });

  it.each([
    ['deactivating', { status: 'inactive' }],
    ['demoting', { role: 'admin' }],
    ['moving to a field role', { fieldRole: 'director' }],
  ])('refuses %s the last active owner with 409', async (_label, body) => {
    firestore.users.set('pending-user', { status: 'active', role: 'owner' });
    firestore.users.set('owner-2', { status: 'inactive', role: 'owner' });
    // A caller other than the target, so this exercises the owner count rather
    // than the self-protection rule.
    mockGate.mockResolvedValue({ ok: true, uid: 'owner-session', name: 'Owner', isAdmin: true, isOwner: true });

    const response = await PUT(request(body), params());

    expect(response.status).toBe(409);
    expect((await response.json()).error).toMatch(/last active owner/);
    expect(firestore.updates).toHaveLength(0);
  });

  it('lets an owner demote another owner while a second active owner remains', async () => {
    firestore.users.set('pending-user', { status: 'active', role: 'owner' });
    firestore.users.set('owner-2', { status: 'active', role: 'owner' });
    mockGate.mockResolvedValue({ ok: true, uid: 'owner-2', name: 'Owner', isAdmin: true, isOwner: true });

    const response = await PUT(request({ role: 'admin' }), params());

    expect(response.status).toBe(200);
    expect(firestore.users.get('pending-user')).toMatchObject({ role: 'admin' });
  });
});

describe('PUT /api/portal/auth/users/[id] audit', () => {
  it('lists only the fields whose value changed', async () => {
    firestore.users.set('pending-user', {
      status: 'active',
      fieldRole: 'entry_rep',
      displayName: 'Rep One',
      phone: '555-0100',
    });

    await PUT(request({ displayName: 'Rep Uno', phone: '555-0100', managerId: null }), params());

    const entry = (writeAdminAudit as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(entry.details.fields).toEqual(['displayName']);
  });

  it('writes no audit row when nothing changed', async () => {
    firestore.users.set('pending-user', { status: 'active', fieldRole: 'entry_rep', displayName: 'Rep One', phone: '555-0100' });

    const response = await PUT(request({ displayName: 'Rep One', phone: '555-0100', managerId: null }), params());

    expect(response.status).toBe(200);
    expect(writeAdminAudit).not.toHaveBeenCalled();
  });
});

describe('DELETE /api/portal/auth/users/[id]', () => {
  it('closes the account\'s open alerts, so a deleted signup stops nagging', async () => {
    firestore.users.set('pending-user', { status: 'pending' });
    mockGate.mockResolvedValue({ ok: true, uid: 'admin-1', name: 'Admin', isAdmin: true });

    const response = await DELETE(request({}), params());

    expect(response.status).toBe(200);
    expect(firestore.users.get('pending-user')).toBeUndefined();
    expect(mockResolveAlertTasks).toHaveBeenCalledWith('pending-user');
  });

  it('rejects an operations caller deleting a platform-role account', async () => {
    firestore.users.set('pending-user', { status: 'active', role: 'operations' });
    mockGate.mockResolvedValue({ ok: true, uid: 'ops-1', name: 'Ops', isAdmin: false });

    const response = await DELETE(request({}), params());

    expect(response.status).toBe(403);
    expect(firestore.users.get('pending-user')).toBeDefined();
  });

  it('rejects an operations caller hard-deleting a field user', async () => {
    firestore.users.set('pending-user', { status: 'active', fieldRole: 'director' });
    mockGate.mockResolvedValue({ ok: true, uid: 'ops-1', name: 'Ops', isAdmin: false });

    const response = await DELETE(request({}), params());

    expect(response.status).toBe(403);
    expect(firestore.users.get('pending-user')).toBeDefined();
    expect(purgeSensitiveUserData).not.toHaveBeenCalled();
    expect(firestore.adminAuth.deleteUser).not.toHaveBeenCalled();
  });

  it('purges the person\'s SSN/licence data while the profile still exists, then removes the profile', async () => {
    firestore.users.set('pending-user', { status: 'inactive' });
    let profileAtPurge: unknown;
    (purgeSensitiveUserData as unknown as ReturnType<typeof vi.fn>).mockImplementationOnce(async () => {
      profileAtPurge = firestore.users.get('pending-user');
      return { userSensitive: 1, files: 0, failures: [] };
    });

    const response = await DELETE(request({}), params());

    expect(response.status).toBe(200);
    expect(purgeSensitiveUserData).toHaveBeenCalledWith('pending-user');
    expect(profileAtPurge).toBeDefined();
    expect(firestore.users.get('pending-user')).toBeUndefined();
  });

  it('keeps the profile, marks it inactive, and tells the admin to retry when part of the purge fails', async () => {
    firestore.users.set('pending-user', { status: 'active' });
    (purgeSensitiveUserData as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      userSensitive: 0, files: 0, failures: ['dl_photos files'],
    });

    const response = await DELETE(request({}), params());
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.error).toMatch(/Press Delete again/);
    expect(body.purgeFailures).toEqual(['dl_photos files']);
    expect(firestore.users.get('pending-user')).toMatchObject({ status: 'inactive', deleteIncomplete: true });
    expect(mockResolveAlertTasks).not.toHaveBeenCalled();
    expect((writeAdminAudit as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0].details.completed).toBe(false);
  });

  it('finishes on the retry, once the Auth account is already gone', async () => {
    firestore.users.set('pending-user', { status: 'inactive' });
    (purgeSensitiveUserData as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      userSensitive: 0, files: 0, failures: ['dl_photos files'],
    });
    await DELETE(request({}), params());

    firestore.adminAuth.deleteUser.mockRejectedValueOnce({ code: 'auth/user-not-found' });
    const retry = await DELETE(request({}), params());

    expect(retry.status).toBe(200);
    expect(firestore.users.get('pending-user')).toBeUndefined();
  });

  it('does not turn a finished delete into an error when closing alerts fails', async () => {
    firestore.users.set('pending-user', { status: 'pending' });
    mockResolveAlertTasks.mockRejectedValueOnce(new Error('firestore down'));
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    const response = await DELETE(request({}), params());

    expect(response.status).toBe(200);
    expect(firestore.users.get('pending-user')).toBeUndefined();
    expect((writeAdminAudit as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0].details.completed).toBe(true);
    spy.mockRestore();
  });

  it('does not purge when the caller is refused', async () => {
    firestore.users.set('pending-user', { status: 'active', role: 'operations' });
    mockGate.mockResolvedValue({ ok: true, uid: 'ops-1', name: 'Ops', isAdmin: false });

    await DELETE(request({}), params());

    expect(purgeSensitiveUserData).not.toHaveBeenCalled();
  });

  it('still removes a profile whose Auth account is already gone, then purges', async () => {
    firestore.users.set('pending-user', { status: 'pending' });
    firestore.adminAuth.deleteUser.mockRejectedValueOnce({ code: 'auth/user-not-found' });

    const response = await DELETE(request({}), params());

    expect(response.status).toBe(200);
    expect(firestore.users.get('pending-user')).toBeUndefined();
    expect(purgeSensitiveUserData).toHaveBeenCalledWith('pending-user');
  });

  it('keeps every other Auth failure fatal and leaves the profile alone', async () => {
    firestore.users.set('pending-user', { status: 'pending' });
    firestore.adminAuth.deleteUser.mockRejectedValueOnce({ code: 'auth/internal-error' });

    const response = await DELETE(request({}), params());

    expect(response.status).toBe(500);
    expect(firestore.users.get('pending-user')).toBeDefined();
    expect(purgeSensitiveUserData).not.toHaveBeenCalled();
  });

  it('audits the delete with who, whom, their role and what the purge removed', async () => {
    firestore.users.set('pending-user', { status: 'inactive', fieldRole: 'entry_rep', displayName: 'Rep One', email: 'rep@x.test' });
    (purgeSensitiveUserData as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      userSensitive: 1, files: 2, failures: [],
    });

    await DELETE(request({}), params());

    const entry = (writeAdminAudit as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(entry).toMatchObject({
      action: 'user.delete',
      actorUid: 'admin-1',
      targetUid: 'pending-user',
      targetName: 'Rep One',
      details: { completed: true, role: 'entry_rep', status: 'inactive', purge: { userSensitive: 1, files: 2, failures: [] } },
    });
    expect(JSON.stringify(entry)).not.toContain('rep@x.test');
  });

  it('revokes Sign in with Apple for the deleted account before closing its sign-in', async () => {
    firestore.users.set('pending-user', { status: 'inactive' });
    revokeAppleMock.mockImplementationOnce(async () => {
      expect(firestore.adminAuth.deleteUser).not.toHaveBeenCalled();
      return { status: 'revoked' };
    });

    const response = await DELETE(request({}), params());

    expect(response.status).toBe(200);
    expect(revokeAppleMock).toHaveBeenCalledWith(firestore.adminDb, 'pending-user');
    expect(firestore.users.get('pending-user')).toBeUndefined();
  });

  it('still deletes the account when the Apple revoke fails or throws', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    firestore.users.set('pending-user', { status: 'inactive' });
    revokeAppleMock.mockResolvedValueOnce({ status: 'failed' });
    expect((await DELETE(request({}), params())).status).toBe(200);
    expect(firestore.users.get('pending-user')).toBeUndefined();

    firestore.users.set('pending-user', { status: 'inactive' });
    revokeAppleMock.mockRejectedValueOnce(new Error('apple down'));
    expect((await DELETE(request({}), params())).status).toBe(200);
    expect(firestore.users.get('pending-user')).toBeUndefined();
    expect(firestore.adminAuth.deleteUser).toHaveBeenCalledTimes(2);
    warn.mockRestore();
    error.mockRestore();
  });

  it('does not revoke Apple when the caller is refused', async () => {
    firestore.users.set('pending-user', { status: 'active', role: 'operations' });
    mockGate.mockResolvedValue({ ok: true, uid: 'ops-1', name: 'Ops', isAdmin: false });

    await DELETE(request({}), params());

    expect(revokeAppleMock).not.toHaveBeenCalled();
  });

  it('writes no audit row when the delete itself fails', async () => {
    firestore.users.set('pending-user', { status: 'pending' });
    firestore.adminAuth.deleteUser.mockRejectedValueOnce({ code: 'auth/internal-error' });

    await DELETE(request({}), params());

    expect(writeAdminAudit).not.toHaveBeenCalled();
  });
});
