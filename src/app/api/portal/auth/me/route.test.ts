import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const fake = vi.hoisted(() => {
  const users = new Map<string, Record<string, unknown>>();
  const updates: Array<{ userId: string; data: Record<string, unknown> }> = [];
  const adminDb = {
    collection: vi.fn((name: string) => {
      if (name !== 'users') throw new Error(`Unexpected collection: ${name}`);
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
            return { exists: !!data, get: (field: string) => data?.[field], data: () => data };
          }),
          update: vi.fn(async (data: Record<string, unknown>) => {
            updates.push({ userId, data });
          }),
          delete: vi.fn(async () => {
            throw new Error('self-delete must never hard-delete the profile');
          }),
        }),
      };
    }),
  };
  const adminAuth = {
    getUser: vi.fn(async () => ({ providerData: [{ providerId: 'google.com' }, { providerId: 'password' }] })),
    updateUser: vi.fn(async () => undefined),
    revokeRefreshTokens: vi.fn(async () => undefined),
    deleteUser: vi.fn(async () => {
      throw new Error('self-delete must never delete the auth user');
    }),
  };
  return {
    users,
    updates,
    adminDb,
    adminAuth,
    gate: vi.fn(),
    purge: vi.fn(),
    resolveAlertTasks: vi.fn(async () => undefined),
    reconcile: vi.fn(async () => []),
    restampAuthor: vi.fn(async () => undefined),
    audit: vi.fn(async () => undefined),
  };
});

vi.mock('@/lib/firebase/admin', () => ({ adminDb: fake.adminDb, adminAuth: fake.adminAuth }));
vi.mock('firebase-admin/firestore', () => ({ FieldValue: { delete: () => '__DELETE__' } }));
vi.mock('@/lib/auth/requireVerifiedAdmin', () => ({ requireVerifiedUser: fake.gate }));
vi.mock('@/lib/users/purgeSensitiveUserData', () => ({ purgeSensitiveUserData: fake.purge }));
vi.mock('@/lib/alerts/alertTasks', () => ({ resolveAlertTasks: fake.resolveAlertTasks }));
vi.mock('@/lib/chat/channels', () => ({ reconcileChatMembershipForUser: fake.reconcile }));
vi.mock('@/lib/chat/restampAuthor', () => ({ restampAuthor: fake.restampAuthor }));
vi.mock('@/lib/audit/adminAudit', () => ({ writeAdminAudit: fake.audit }));

import { DELETE } from './route';
import { PERSONAL_PROFILE_FIELDS } from '@/lib/users/accountClosure';

function request() {
  return new NextRequest('http://localhost/api/portal/auth/me', {
    method: 'DELETE',
    headers: { Authorization: 'Bearer token' },
  });
}

function signedInAs(uid: string) {
  fake.gate.mockResolvedValue({ ok: true, uid, name: 'X', email: 'x@x.com', isOwner: false, isAdmin: false });
}

beforeEach(() => {
  vi.clearAllMocks();
  fake.users.clear();
  fake.updates.length = 0;
  fake.purge.mockResolvedValue({ userSensitive: 1, files: 2, failures: [] });
  fake.users.set('rep1', {
    displayName: 'Ana Ruiz',
    email: 'ana@x.com',
    phone: '555',
    address: '1 Main',
    status: 'active',
    fieldRole: 'sales_rep',
    reportsToId: 'mgr1',
    salesRepId: 'SR-9',
    pushTokens: ['w1'],
    nativePushTokens: [{ token: 'n1', platform: 'ios-native' }],
  });
  signedInAs('rep1');
});

describe('DELETE /api/portal/auth/me', () => {
  it('requires a verified ID token', async () => {
    fake.gate.mockResolvedValue({ ok: false, error: 'Missing authentication token', status: 401 });
    const res = await DELETE(request());
    expect(res.status).toBe(401);
    expect(fake.purge).not.toHaveBeenCalled();
    expect(fake.adminAuth.updateUser).not.toHaveBeenCalled();
    expect(fake.updates).toEqual([]);
  });

  it('passes on an inactive / unknown account rejection from the gate', async () => {
    fake.gate.mockResolvedValue({ ok: false, error: 'Account is not active', status: 403 });
    expect((await DELETE(request())).status).toBe(403);
    expect(fake.updates).toEqual([]);
  });

  it('only ever acts on the uid from the token', async () => {
    fake.users.set('someone-else', { displayName: 'B', status: 'active' });
    await DELETE(request());
    expect(fake.updates.map((u) => u.userId)).toEqual(['rep1']);
    expect(fake.adminAuth.updateUser).toHaveBeenCalledWith('rep1', expect.anything());
  });

  it('disables the sign-in, anonymizes the profile and keeps it (sales and pay ids stay)', async () => {
    const res = await DELETE(request());
    expect(res.status).toBe(200);

    expect(fake.purge).toHaveBeenCalledWith('rep1');
    expect(fake.adminAuth.updateUser).toHaveBeenCalledWith('rep1', {
      disabled: true,
      displayName: null,
      photoURL: null,
      email: 'deleted-rep1@deleted.invalid',
      providersToUnlink: ['google.com'],
    });
    expect(fake.adminAuth.revokeRefreshTokens).toHaveBeenCalledWith('rep1');
    expect(fake.adminAuth.deleteUser).not.toHaveBeenCalled();

    expect(fake.updates).toHaveLength(1);
    const update = fake.updates[0].data;
    expect(update).toMatchObject({
      displayName: 'Deleted user',
      status: 'inactive',
      selfDeleted: true,
      deactivatedFromStatus: 'active',
    });
    for (const field of PERSONAL_PROFILE_FIELDS) expect(update[field]).toBe('__DELETE__');
    for (const kept of ['fieldRole', 'role', 'reportsToId', 'salesRepId', 'territoryId', 'hireDate']) {
      expect(update).not.toHaveProperty(kept);
    }

    expect(fake.restampAuthor).toHaveBeenCalledWith('rep1', { authorName: 'Deleted user' });
    expect(fake.reconcile).toHaveBeenCalledWith('rep1');
    expect(fake.resolveAlertTasks).toHaveBeenCalledWith('rep1');
    expect(fake.audit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'user.self_delete',
        actorUid: 'rep1',
        targetUid: 'rep1',
        details: expect.objectContaining({ completed: true }),
      })
    );
    // No personal data in the audit row.
    expect(JSON.stringify(fake.audit.mock.calls)).not.toContain('Ana Ruiz');
    expect(JSON.stringify(fake.audit.mock.calls)).not.toContain('ana@x.com');
  });

  it('blocks the last active owner', async () => {
    fake.users.set('own1', { displayName: 'Jacob', role: 'owner', status: 'active' });
    fake.users.set('own2', { displayName: 'Former', role: 'owner', status: 'inactive' });
    signedInAs('own1');
    const res = await DELETE(request());
    expect(res.status).toBe(409);
    expect((await res.json()).error).toMatch(/last active owner/);
    expect(fake.purge).not.toHaveBeenCalled();
    expect(fake.adminAuth.updateUser).not.toHaveBeenCalled();
    expect(fake.updates).toEqual([]);
  });

  it('lets an owner delete when another active owner remains', async () => {
    fake.users.set('own1', { displayName: 'Jacob', role: 'owner', status: 'active' });
    fake.users.set('own2', { displayName: 'Jeremy', role: 'owner', status: 'active' });
    signedInAs('own1');
    expect((await DELETE(request())).status).toBe(200);
    expect(fake.updates[0].userId).toBe('own1');
  });

  it('changes nothing else when the identity-document purge fails, so the person can retry', async () => {
    fake.purge.mockResolvedValue({ userSensitive: 0, files: 0, failures: ['storage'] });
    const res = await DELETE(request());
    expect(res.status).toBe(500);
    expect(fake.adminAuth.updateUser).not.toHaveBeenCalled();
    expect(fake.updates).toEqual([]);
  });

  it('leaves the profile alone when closing the sign-in fails', async () => {
    fake.adminAuth.updateUser.mockRejectedValueOnce(new Error('auth down'));
    const res = await DELETE(request());
    expect(res.status).toBe(500);
    expect(fake.updates).toEqual([]);
  });

  it('does not fail a finished delete over the best-effort follow-ups', async () => {
    fake.restampAuthor.mockRejectedValueOnce(new Error('x'));
    fake.reconcile.mockRejectedValueOnce(new Error('x'));
    fake.resolveAlertTasks.mockRejectedValueOnce(new Error('x'));
    expect((await DELETE(request())).status).toBe(200);
  });

  it('a pending hire can delete too, and is recorded as such', async () => {
    fake.users.set('hire1', { displayName: 'New', status: 'pending', fieldRole: 'sales_rep' });
    signedInAs('hire1');
    expect((await DELETE(request())).status).toBe(200);
    expect(fake.updates[0].data).toMatchObject({ status: 'inactive', deactivatedFromStatus: 'pending' });
  });
});
