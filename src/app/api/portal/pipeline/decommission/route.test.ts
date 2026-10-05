import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const store = vi.hoisted(() => {
  const users = new Map<string, Record<string, unknown>>();
  const invites = new Map<string, Record<string, unknown>>();
  return {
    users,
    invites,
    adminDb: {
      collection: (name: string) => {
        const rows = name === 'onboardingInvites' ? invites : users;
        return {
          doc: (id: string) => ({
            // A real DocumentSnapshot is frozen at read time; capture, don't read lazily.
            get: async () => {
              const data = rows.get(id);
              return { exists: rows.has(id), data: () => data };
            },
            update: async (data: Record<string, unknown>) => {
              rows.set(id, { ...(rows.get(id) ?? {}), ...data });
            },
          }),
        };
      },
    },
    adminAuth: { updateUser: async () => undefined, revokeRefreshTokens: async () => undefined },
  };
});

vi.mock('@/lib/firebase/admin', () => ({ adminDb: store.adminDb, adminAuth: store.adminAuth }));
vi.mock('firebase-admin/firestore', () => ({ FieldValue: { delete: () => '__DELETE__' } }));
vi.mock('@/lib/auth/requireVerifiedAdmin', () => ({
  requireVerifiedManagement: vi.fn(async () => ({ ok: true, uid: 'admin-1', name: 'Admin One', isAdmin: true })),
}));
vi.mock('@/lib/audit/adminAudit', () => ({ writeAdminAudit: vi.fn(async () => undefined) }));
vi.mock('@/lib/chat/channels', () => ({ reconcileChatMembershipForUser: vi.fn(async () => []) }));
vi.mock('@/lib/alerts/alertTasks', () => ({ resolveAlertTasks: vi.fn(async () => undefined) }));
import { writeAdminAudit } from '@/lib/audit/adminAudit';
import { reconcileChatMembershipForUser } from '@/lib/chat/channels';
import { resolveAlertTasks } from '@/lib/alerts/alertTasks';
import { DELETE, POST } from './route';

function call(method: 'POST' | 'DELETE', body: Record<string, unknown>) {
  return new NextRequest('http://localhost/api/portal/pipeline/decommission', { method, body: JSON.stringify(body) });
}

beforeEach(() => {
  store.users.clear();
  store.invites.clear();
  vi.mocked(writeAdminAudit).mockClear();
  vi.mocked(reconcileChatMembershipForUser).mockClear();
});

describe('pipeline decommission chat membership', () => {
  it('recomputes chat membership on decommission and on reinstate', async () => {
    store.users.set('rep-1', { displayName: 'Rep One', fieldRole: 'entry_rep', status: 'active' });
    await POST(call('POST', { userId: 'rep-1', reason: 'non_activity' }));
    expect(reconcileChatMembershipForUser).toHaveBeenCalledWith('rep-1');

    vi.mocked(reconcileChatMembershipForUser).mockClear();
    await DELETE(call('DELETE', { userId: 'rep-1' }));
    expect(reconcileChatMembershipForUser).toHaveBeenCalledWith('rep-1');
  });
});

describe('pipeline decommission audit', () => {
  it('records who decommissioned whom and why', async () => {
    store.users.set('rep-1', { displayName: 'Rep One', fieldRole: 'entry_rep', status: 'active' });

    const res = await POST(call('POST', { userId: 'rep-1', reason: 'non_activity', notes: 'private note text' }));

    expect(res.status).toBe(200);
    expect(writeAdminAudit).toHaveBeenCalledWith({
      action: 'user.decommission',
      actorUid: 'admin-1',
      actorName: 'Admin One',
      targetUid: 'rep-1',
      targetName: 'Rep One',
      details: { reason: 'non_activity' },
    });
  });

  it('records the reinstate, which is the only trace once the decommission record is deleted', async () => {
    store.users.set('rep-1', {
      displayName: 'Rep One',
      status: 'inactive',
      decommission: { reason: 'wrongdoing', decommissionedByName: 'Someone' },
    });

    const res = await DELETE(call('DELETE', { userId: 'rep-1' }));

    expect(res.status).toBe(200);
    expect(writeAdminAudit).toHaveBeenCalledWith({
      action: 'user.reinstate',
      actorUid: 'admin-1',
      actorName: 'Admin One',
      targetUid: 'rep-1',
      targetName: 'Rep One',
      details: { previousReason: 'wrongdoing', restoredStatus: 'active' },
    });
  });

  it('writes nothing when there is nothing to reinstate', async () => {
    store.users.set('rep-1', { displayName: 'Rep One', status: 'active' });

    const res = await DELETE(call('DELETE', { userId: 'rep-1' }));

    expect(res.status).toBe(400);
    expect(writeAdminAudit).not.toHaveBeenCalled();
  });
});

describe('reinstate restores the prior status', () => {
  it('returns a decommissioned pending hire to pending, not active', async () => {
    store.users.set('hire', { fieldRole: 'entry_level_rep', status: 'pending' });
    await POST(call('POST', { userId: 'hire', reason: 'non_activity' }));
    expect(resolveAlertTasks).toHaveBeenCalledWith('hire');

    const res = await DELETE(call('DELETE', { userId: 'hire' }));

    expect(res.status).toBe(200);
    expect(store.users.get('hire')?.status).toBe('pending');
  });

  it('returns a recruit who never finished onboarding (rejected from Invites) to pending', async () => {
    store.invites.set('inv-1', { status: 'rejected' });
    store.users.set('rejected', { fieldRole: 'entry_level_rep', status: 'inactive', onboardingInviteId: 'inv-1' });

    const res = await DELETE(call('DELETE', { userId: 'rejected' }));

    expect(res.status).toBe(200);
    expect(store.users.get('rejected')?.status).toBe('pending');
  });

  it('brings a veteran rep from an old record (no previousStatus) back active, checklist or not', async () => {
    store.users.set('vet', { fieldRole: 'ae_tier_1', status: 'inactive', decommission: { reason: 'non_activity' } });
    store.invites.set('inv-2', { status: 'submitted' });
    store.users.set('vet-invited', {
      fieldRole: 'entry_rep',
      status: 'inactive',
      onboardingInviteId: 'inv-2',
      activatedAt: new Date('2026-09-01'),
    });
    // Activated before activatedAt existed and before invites were closed out.
    store.users.set('vet-old-invite', { fieldRole: 'entry_rep', status: 'inactive', onboardingInviteId: 'inv-2' });

    await DELETE(call('DELETE', { userId: 'vet' }));
    await DELETE(call('DELETE', { userId: 'vet-invited' }));
    await DELETE(call('DELETE', { userId: 'vet-old-invite' }));

    expect(store.users.get('vet')?.status).toBe('active');
    expect(store.users.get('vet-invited')?.status).toBe('active');
    expect(store.users.get('vet-old-invite')?.status).toBe('active');
  });

  it('clears a stale decommission marker left on an active rep and keeps them active', async () => {
    store.users.set('rep', { fieldRole: 'ae_tier_1', status: 'active', decommission: { reason: 'non_activity' } });

    const res = await DELETE(call('DELETE', { userId: 'rep' }));

    expect(res.status).toBe(200);
    expect(store.users.get('rep')).toMatchObject({ status: 'active', decommission: '__DELETE__' });
  });
});

describe('pipeline decommission and the activation gate', () => {
  it('stamps the status the account had, and a hire decommissioned while pending is reinstated to pending', async () => {
    store.users.set('rep-1', { displayName: 'Hire', fieldRole: 'entry_level_rep', status: 'pending' });

    await POST(call('POST', { userId: 'rep-1', reason: 'non_activity' }));
    expect(store.users.get('rep-1')).toMatchObject({ status: 'inactive', deactivatedFromStatus: 'pending' });

    const res = await DELETE(call('DELETE', { userId: 'rep-1' }));
    expect(res.status).toBe(200);
    expect(store.users.get('rep-1')?.status).toBe('pending');
  });

  it('reinstates an active rep to active', async () => {
    store.users.set('rep-1', { displayName: 'Rep', fieldRole: 'ae_tier_1', status: 'active' });

    await POST(call('POST', { userId: 'rep-1', reason: 'non_activity' }));
    await DELETE(call('DELETE', { userId: 'rep-1' }));

    expect(store.users.get('rep-1')?.status).toBe('active');
  });
});
