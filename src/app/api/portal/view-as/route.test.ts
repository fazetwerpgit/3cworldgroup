import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const { gateMock, users, created } = vi.hoisted(() => ({
  gateMock: vi.fn(),
  users: new Map<string, Record<string, unknown>>(),
  created: [] as Array<{ id: string; data: Record<string, unknown> }>,
}));

vi.mock('@/lib/auth/requireVerifiedAdmin', () => ({ requireVerifiedManagement: gateMock }));
vi.mock('@/lib/firebase/admin', () => ({
  adminDb: {
    collection: (name: string) => ({
      doc: (id: string) => ({
        get: async () => ({ exists: users.has(id), data: () => users.get(id) }),
        create: async (data: Record<string, unknown>) => {
          if (name !== 'viewAsLog') throw new Error('unexpected write');
          created.push({ id, data });
        },
      }),
      where: (field: string, _op: string, value: unknown) => ({
        get: async () => ({
          forEach: (fn: (doc: { id: string; data: () => Record<string, unknown> }) => void) => {
            for (const [id, data] of users) if (data[field] === value) fn({ id, data: () => data });
          },
        }),
      }),
    }),
  },
}));

import { GET } from './route';
import { resetViewAsLogMemo } from '@/lib/auth/viewAs';

const asOwner = () => gateMock.mockResolvedValue({ ok: true, uid: 'owner-1', name: 'Jacob', isAdmin: true, isOwner: true });
const req = (query = '') => new NextRequest(`http://localhost/api/portal/view-as${query}`);

beforeEach(() => {
  gateMock.mockReset();
  users.clear();
  created.length = 0;
  resetViewAsLogMemo();
  users.set('rep-b', { displayName: 'Noah Smith', email: 'noah@x.com', fieldRole: 'entry_rep', status: 'active' });
  users.set('rep-a', { displayName: 'Ava Jones', email: 'ava@x.com', fieldRole: 'ae_tier_1', status: 'active' });
  users.set('rep-off', { displayName: 'Old Rep', fieldRole: 'entry_rep', status: 'inactive' });
  users.set('admin-1', { displayName: 'Ann Admin', role: 'admin', status: 'active' });
  users.set('owner-1', { displayName: 'Jacob', role: 'owner', status: 'active' });
});

describe('GET /api/portal/view-as', () => {
  it('refuses an admin (owner only)', async () => {
    gateMock.mockResolvedValue({ ok: true, uid: 'admin-1', name: 'Ann', isAdmin: true, isOwner: false });
    const res = await GET(req());
    expect(res.status).toBe(403);
  });

  it('passes a rep refusal through', async () => {
    gateMock.mockResolvedValue({ ok: false, error: 'Forbidden: management access required', status: 403 });
    expect((await GET(req())).status).toBe(403);
  });

  it('lists active field reps only, by name', async () => {
    asOwner();
    const json = await (await GET(req())).json();
    expect(json.reps.map((rep: { uid: string }) => rep.uid)).toEqual(['rep-a', 'rep-b']);
    expect(Object.keys(json.reps[0]).sort()).toEqual(['avatarUrl', 'displayName', 'email', 'fieldRole', 'uid']);
  });

  it('confirms one rep and logs the session start', async () => {
    asOwner();
    const res = await GET(req('?uid=rep-b'));
    expect(res.status).toBe(200);
    expect((await res.json()).rep).toEqual({
      uid: 'rep-b',
      displayName: 'Noah Smith',
      email: 'noah@x.com',
      fieldRole: 'entry_rep',
      avatarUrl: null,
    });
    expect(created).toHaveLength(1);
    expect(created[0].data).toMatchObject({ ownerUid: 'owner-1', targetUid: 'rep-b' });
  });

  it('404s an unknown rep and 403s an admin or inactive account', async () => {
    asOwner();
    expect((await GET(req('?uid=nobody'))).status).toBe(404);
    expect((await GET(req('?uid=admin-1'))).status).toBe(403);
    expect((await GET(req('?uid=rep-off'))).status).toBe(403);
    expect(created).toHaveLength(0);
  });
});
