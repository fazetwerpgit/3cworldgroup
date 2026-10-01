import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const store = vi.hoisted(() => {
  const users = new Map<string, Record<string, unknown>>();
  return {
    users,
    adminDb: {
      collection: () => ({
        doc: (id: string) => ({
          // A real DocumentSnapshot is frozen at read time; capture, don't read lazily.
          get: async () => {
            const data = users.get(id);
            return { exists: users.has(id), data: () => data };
          },
          update: async (data: Record<string, unknown>) => {
            users.set(id, { ...(users.get(id) ?? {}), ...data });
          },
        }),
      }),
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

import { writeAdminAudit } from '@/lib/audit/adminAudit';
import { DELETE, POST } from './route';

function call(method: 'POST' | 'DELETE', body: Record<string, unknown>) {
  return new NextRequest('http://localhost/api/portal/pipeline/decommission', { method, body: JSON.stringify(body) });
}

beforeEach(() => {
  store.users.clear();
  vi.mocked(writeAdminAudit).mockClear();
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
      details: { previousReason: 'wrongdoing' },
    });
  });

  it('writes nothing when there is nothing to reinstate', async () => {
    store.users.set('rep-1', { displayName: 'Rep One', status: 'active' });

    const res = await DELETE(call('DELETE', { userId: 'rep-1' }));

    expect(res.status).toBe(400);
    expect(writeAdminAudit).not.toHaveBeenCalled();
  });
});
