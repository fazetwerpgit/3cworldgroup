import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const users: Record<string, Record<string, unknown>> = {};
const logs = new Map<string, Record<string, unknown>>();
const createMock = vi.fn();

vi.mock('@/lib/firebase/admin', () => ({
  adminDb: {
    collection: (name: string) => ({
      doc: (id: string) => ({
        get: async () => {
          if (name !== 'users') throw new Error(`unexpected read ${name}`);
          const data = users[id];
          return { exists: !!data, data: () => data };
        },
        create: async (data: Record<string, unknown>) => {
          createMock(name, id, data);
          if (logs.has(id)) throw Object.assign(new Error('ALREADY_EXISTS'), { code: 6 });
          logs.set(id, data);
        },
      }),
    }),
  },
}));

import { resolveSubject, resetViewAsLogMemo, VIEW_AS_HEADER } from './viewAs';

const OWNER = { uid: 'owner-1', isOwner: true };
const ADMIN = { uid: 'admin-1', isOwner: false };
const REP = { uid: 'rep-1', isOwner: false };

function req(headers: Record<string, string> = {}, method = 'GET') {
  return new NextRequest('http://localhost/api/portal/sales', { method, headers });
}

beforeEach(() => {
  for (const key of Object.keys(users)) delete users[key];
  logs.clear();
  createMock.mockClear();
  resetViewAsLogMemo();
  users['rep-noah'] = { displayName: 'Noah Smith', email: 'noah@x.com', fieldRole: 'entry_rep', status: 'active' };
  users['admin-2'] = { displayName: 'Ann Admin', role: 'admin', status: 'active' };
  users['rep-gone'] = { displayName: 'Gone Rep', fieldRole: 'entry_rep', status: 'inactive' };
});

describe('resolveSubject', () => {
  it('no header: the caller themself, for anyone', async () => {
    expect(await resolveSubject(req(), REP)).toEqual({ ok: true, viewing: false, uid: 'rep-1' });
    expect(await resolveSubject(req(), ADMIN)).toEqual({ ok: true, viewing: false, uid: 'admin-1' });
    expect(createMock).not.toHaveBeenCalled();
  });

  it('owner + header: the rep, with the rep identity to scope by', async () => {
    const result = await resolveSubject(req({ [VIEW_AS_HEADER]: 'rep-noah' }), OWNER);
    expect(result).toMatchObject({
      ok: true,
      viewing: true,
      uid: 'rep-noah',
      ownerUid: 'owner-1',
      target: { uid: 'rep-noah', name: 'Noah Smith', fieldRole: 'entry_rep', isAdmin: false, isManagement: false },
    });
  });

  it('refuses an admin with 403 (owner only)', async () => {
    const result = await resolveSubject(req({ [VIEW_AS_HEADER]: 'rep-noah' }), ADMIN);
    expect(result).toEqual({ ok: false, error: 'Forbidden: owner access required', status: 403 });
    expect(createMock).not.toHaveBeenCalled();
  });

  it('refuses a rep with 403', async () => {
    const result = await resolveSubject(req({ [VIEW_AS_HEADER]: 'rep-noah' }), REP);
    expect(result).toMatchObject({ ok: false, status: 403 });
  });

  it('refuses a caller with no owner flag at all', async () => {
    const result = await resolveSubject(req({ [VIEW_AS_HEADER]: 'rep-noah' }), { uid: 'x' });
    expect(result).toMatchObject({ ok: false, status: 403 });
  });

  it('an unknown target is 404', async () => {
    expect(await resolveSubject(req({ [VIEW_AS_HEADER]: 'nobody' }), OWNER)).toMatchObject({ ok: false, status: 404 });
    expect(await resolveSubject(req({ [VIEW_AS_HEADER]: '' }), OWNER)).toMatchObject({ ok: false, status: 404 });
    expect(await resolveSubject(req({ [VIEW_AS_HEADER]: '../users/x' }), OWNER)).toMatchObject({ ok: false, status: 404 });
  });

  it('a platform account or an inactive rep cannot be viewed (403)', async () => {
    expect(await resolveSubject(req({ [VIEW_AS_HEADER]: 'admin-2' }), OWNER)).toMatchObject({ ok: false, status: 403 });
    expect(await resolveSubject(req({ [VIEW_AS_HEADER]: 'rep-gone' }), OWNER)).toMatchObject({ ok: false, status: 403 });
  });

  it('a write carrying the header is read-only (403), even from the owner', async () => {
    const result = await resolveSubject(req({ [VIEW_AS_HEADER]: 'rep-noah' }, 'POST'), OWNER);
    expect(result).toEqual({ ok: false, error: 'Read-only view', status: 403 });
  });

  it('writes one audit row per owner + rep + hour', async () => {
    await resolveSubject(req({ [VIEW_AS_HEADER]: 'rep-noah' }), OWNER);
    await resolveSubject(req({ [VIEW_AS_HEADER]: 'rep-noah' }), OWNER);
    expect(createMock).toHaveBeenCalledTimes(1);
    const [collection, id, data] = createMock.mock.calls[0];
    expect(collection).toBe('viewAsLog');
    expect(id).toMatch(/^owner-1_rep-noah_\d{10}$/);
    expect(data).toMatchObject({ ownerUid: 'owner-1', targetUid: 'rep-noah' });
    expect(data.startedAt).toBeInstanceOf(Date);

    // Another instance (fresh memo) dedupes on the deterministic id instead.
    resetViewAsLogMemo();
    const again = await resolveSubject(req({ [VIEW_AS_HEADER]: 'rep-noah' }), OWNER);
    expect(again).toMatchObject({ ok: true, viewing: true });
    expect(logs.size).toBe(1);
  });
});
