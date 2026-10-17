import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const fake = vi.hoisted(() => {
  const users = new Map<string, Record<string, unknown>>();
  const updates: Array<{ userId: string; data: Record<string, unknown> }> = [];
  const adminDb = {
    runTransaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) =>
      fn({
        get: (refOrQuery: { get: () => Promise<unknown> }) => refOrQuery.get(),
        update: (ref: { update: (d: Record<string, unknown>) => Promise<void> }, d: Record<string, unknown>) =>
          ref.update(d),
      })
    ),
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
            users.set(userId, { ...(users.get(userId) ?? {}), ...data });
          }),
          delete: vi.fn(async () => {
            throw new Error('self-delete must never hard-delete the profile');
          }),
        }),
      };
    }),
  };
  const adminAuth = {
    // Token "token-<uid>" verifies as that uid; anything else is invalid.
    verifyIdToken: vi.fn(async (token: string) => {
      if (!token.startsWith('token-')) throw new Error('bad token');
      return { uid: token.slice(6) };
    }),
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
    purge: vi.fn(),
    resolveAlertTasks: vi.fn(async () => undefined),
    reconcile: vi.fn(async () => []),
    restampAuthor: vi.fn(async () => undefined),
    scrubDeletedChatAuthor: vi.fn(async () => undefined),
    anonymizeAskHistory: vi.fn(async () => 0),
    audit: vi.fn(async () => undefined),
  };
});

vi.mock('@/lib/firebase/admin', () => ({ adminDb: fake.adminDb, adminAuth: fake.adminAuth }));
vi.mock('firebase-admin/firestore', () => ({ FieldValue: { delete: () => '__DELETE__' } }));
vi.mock('@/lib/users/purgeSensitiveUserData', () => ({ purgeSensitiveUserData: fake.purge }));
vi.mock('@/lib/alerts/alertTasks', () => ({ resolveAlertTasks: fake.resolveAlertTasks }));
vi.mock('@/lib/chat/channels', () => ({ reconcileChatMembershipForUser: fake.reconcile }));
vi.mock('@/lib/chat/restampAuthor', () => ({ restampAuthor: fake.restampAuthor, scrubDeletedChatAuthor: fake.scrubDeletedChatAuthor }));
vi.mock('@/lib/audit/adminAudit', () => ({ writeAdminAudit: fake.audit }));
vi.mock('@/lib/ask/anonymizeHistory', () => ({ anonymizeAskHistory: fake.anonymizeAskHistory }));

import { DELETE } from './route';
import { PERSONAL_PROFILE_FIELDS } from '@/lib/users/accountClosure';

let caller = 'rep1';
function request(token: string | null = `token-${caller}`) {
  return new NextRequest('http://localhost/api/portal/auth/me', {
    method: 'DELETE',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
}

function signedInAs(uid: string) {
  caller = uid;
}

/** The anonymizing write (the last update to the caller's doc). */
function anonymizeUpdate(uid = caller) {
  const mine = fake.updates.filter((u) => u.userId === uid);
  return mine[mine.length - 1]?.data;
}

beforeEach(() => {
  vi.clearAllMocks();
  fake.users.clear();
  fake.updates.length = 0;
  fake.purge.mockResolvedValue({ userSensitive: 1, files: 2, failures: [] });
  fake.users.set('rep1', {
    displayName: 'Ana Ruiz',
    email: 'ana@x.com',
    Email: 'Ana@X.com',
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
    expect((await DELETE(request(null))).status).toBe(401);
    const res = await DELETE(request('forged'));
    expect(res.status).toBe(401);
    expect(fake.adminAuth.verifyIdToken).toHaveBeenCalledWith('forged', true);
    expect(fake.purge).not.toHaveBeenCalled();
    expect(fake.adminAuth.updateUser).not.toHaveBeenCalled();
    expect(fake.updates).toEqual([]);
  });

  it('refuses an inactive account that is not mid-delete', async () => {
    fake.users.set('gone', { displayName: 'G', status: 'inactive' });
    signedInAs('gone');
    expect((await DELETE(request())).status).toBe(403);
    expect(fake.purge).not.toHaveBeenCalled();
    expect(fake.updates).toEqual([]);
  });

  it('lets an unapproved self-signup (pending, no role) withdraw', async () => {
    fake.users.set('new1', { email: 'new@privaterelay.appleid.com', status: 'pending' });
    signedInAs('new1');
    expect((await DELETE(request())).status).toBe(200);
    expect(fake.adminAuth.updateUser).toHaveBeenCalledWith('new1', expect.objectContaining({ disabled: true }));
    expect(anonymizeUpdate('new1')).toMatchObject({ displayName: 'Deleted user', email: '__DELETE__' });
    expect(fake.updates[0].data).toMatchObject({ status: 'inactive', selfDeleted: true, deactivatedFromStatus: 'pending' });
  });

  it('finishes a delete that stopped after the status flip', async () => {
    fake.users.set('half', { displayName: 'H', status: 'inactive', selfDeleted: true, role: 'owner' });
    signedInAs('half');
    expect((await DELETE(request())).status).toBe(200);
    expect(fake.adminDb.runTransaction).not.toHaveBeenCalled();
    expect(anonymizeUpdate('half')).toMatchObject({ displayName: 'Deleted user' });
  });

  it('only ever acts on the uid from the token', async () => {
    fake.users.set('someone-else', { displayName: 'B', status: 'active' });
    await DELETE(request());
    expect(new Set(fake.updates.map((u) => u.userId))).toEqual(new Set(['rep1']));
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

    expect(fake.updates).toHaveLength(2);
    // First write: the transactional flip, before the sign-in closes.
    expect(fake.updates[0].data).toMatchObject({ status: 'inactive', selfDeleted: true, deactivatedFromStatus: 'active' });
    const update = fake.updates[1].data;
    expect(update).toMatchObject({
      displayName: 'Deleted user',
      status: 'inactive',
      selfDeleted: true,
      deactivatedFromStatus: 'active',
    });
    for (const field of PERSONAL_PROFILE_FIELDS) expect(update[field]).toBe('__DELETE__');
    // Legacy capital-E address goes too.
    expect(update.Email).toBe('__DELETE__');
    for (const kept of ['fieldRole', 'role', 'reportsToId', 'salesRepId', 'territoryId', 'hireDate']) {
      expect(update).not.toHaveProperty(kept);
    }

    expect(fake.restampAuthor).toHaveBeenCalledWith('rep1', { authorName: 'Deleted user' });
    expect(fake.scrubDeletedChatAuthor).toHaveBeenCalledWith('rep1', 'Deleted user');
    expect(fake.anonymizeAskHistory).toHaveBeenCalledWith(fake.adminDb, 'rep1', 'Deleted user');
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

  it('re-checks the owner rule in a transaction: a co-owner leaving mid-delete gets a 409', async () => {
    fake.users.set('own1', { displayName: 'Jacob', role: 'owner', status: 'active' });
    fake.users.set('own2', { displayName: 'Jeremy', role: 'owner', status: 'active' });
    signedInAs('own1');
    // While the purge runs, the other owner's own delete flips them inactive.
    fake.purge.mockImplementationOnce(async () => {
      fake.users.set('own2', { ...fake.users.get('own2'), status: 'inactive' });
      return { userSensitive: 0, files: 0, failures: [] };
    });
    const res = await DELETE(request());
    expect(res.status).toBe(409);
    expect(fake.adminDb.runTransaction).toHaveBeenCalledTimes(1);
    expect(fake.adminAuth.updateUser).not.toHaveBeenCalled();
    expect(fake.updates).toEqual([]);
    expect(fake.users.get('own1')?.status).toBe('active');
  });

  it('stops before the flip when the identity-document purge fails, so the person can retry', async () => {
    fake.purge.mockResolvedValue({ userSensitive: 0, files: 0, failures: ['storage'] });
    const res = await DELETE(request());
    expect(res.status).toBe(500);
    expect((await res.json()).error).toBe("We couldn't finish deleting your account. Try again in a minute.");
    expect(fake.adminAuth.updateUser).not.toHaveBeenCalled();
    expect(fake.updates).toEqual([]);
  });

  it('does not anonymize when closing the sign-in fails, and the retry finishes the job', async () => {
    fake.adminAuth.updateUser.mockRejectedValueOnce(new Error('auth down'));
    expect((await DELETE(request())).status).toBe(500);
    expect(fake.updates).toHaveLength(1); // only the flip
    expect((await DELETE(request())).status).toBe(200);
    expect(anonymizeUpdate()).toMatchObject({ displayName: 'Deleted user' });
  });

  it('does not fail a finished delete over the best-effort follow-ups', async () => {
    fake.restampAuthor.mockRejectedValueOnce(new Error('x'));
    fake.reconcile.mockRejectedValueOnce(new Error('x'));
    fake.resolveAlertTasks.mockRejectedValueOnce(new Error('x'));
    fake.scrubDeletedChatAuthor.mockRejectedValueOnce(new Error('x'));
    fake.anonymizeAskHistory.mockRejectedValueOnce(new Error('x'));
    expect((await DELETE(request())).status).toBe(200);
  });

  it('a pending hire can delete too, and is recorded as such', async () => {
    fake.users.set('hire1', { displayName: 'New', status: 'pending', fieldRole: 'sales_rep' });
    signedInAs('hire1');
    expect((await DELETE(request())).status).toBe(200);
    expect(fake.updates[0].data).toMatchObject({ status: 'inactive', deactivatedFromStatus: 'pending' });
  });
});
