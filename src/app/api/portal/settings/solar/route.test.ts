import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/firebase/admin', async () => ({
  adminDb: (await import('@/lib/solar/testing/fakeDb')).createFakeDb(),
}));
vi.mock('@/lib/auth/requireVerifiedAdmin', () => ({ requireVerifiedAdmin: vi.fn(), requireVerifiedUser: vi.fn() }));

import { GET, PUT } from './route';
import { adminDb } from '@/lib/firebase/admin';
import { requireVerifiedAdmin } from '@/lib/auth/requireVerifiedAdmin';
import type { createFakeDb } from '@/lib/solar/testing/fakeDb';

const db = adminDb as unknown as ReturnType<typeof createFakeDb>;
const mockGate = requireVerifiedAdmin as unknown as ReturnType<typeof vi.fn>;
const URL = 'http://localhost/api/portal/settings/solar';
const get = () => GET(new NextRequest(URL));
const put = (body: unknown) => PUT(new NextRequest(URL, { method: 'PUT', body: JSON.stringify(body) }));
const settings = () => db.store.get('settings')?.get('solar');

beforeEach(() => {
  db.store.clear();
  db.store.set('users', new Map(Object.entries({
    jac: { displayName: 'Jacob', Email: 'jmyers@3cworldgroup.com', role: 'owner' },
    ops: { email: 'ops@x.com', role: 'admin' },
  })));
  mockGate.mockReset().mockResolvedValue({ ok: true, uid: 'adm', name: 'Admin' });
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('GET /api/portal/settings/solar', () => {
  it('is admin only', async () => {
    mockGate.mockResolvedValue({ ok: false, error: 'Forbidden: admin access required', status: 403 });
    expect((await get()).status).toBe(403);
  });

  it('reports the real default (owner off, nobody listed) when nothing is set', async () => {
    expect(await (await get()).json()).toEqual({ leadAlertUids: [], notifyOwner: false, recipients: [] });
  });

  it('returns the saved list with names, flagging a removed user', async () => {
    db.store.set('settings', new Map([['solar', { leadAlertUids: ['jac', 'gone', 7], notifyOwner: true }]]));
    expect(await (await get()).json()).toEqual({
      leadAlertUids: ['jac', 'gone'],
      notifyOwner: true,
      recipients: [
        { uid: 'jac', name: 'Jacob' },
        { uid: 'gone', name: 'Removed user', missing: true },
      ],
    });
  });

  it('treats anything but true as off', async () => {
    db.store.set('settings', new Map([['solar', { notifyOwner: 'yes' }]]));
    expect((await (await get()).json()).notifyOwner).toBe(false);
  });

  it('fails with 500 instead of defaults when the read fails', async () => {
    vi.spyOn(db, 'collection').mockImplementationOnce(() => { throw new Error('unavailable'); });
    const res = await get();
    expect(res.status).toBe(500);
    expect(await res.json()).not.toHaveProperty('notifyOwner');
  });
});

describe('PUT /api/portal/settings/solar', () => {
  it('is admin only and writes nothing otherwise', async () => {
    mockGate.mockResolvedValue({ ok: false, error: 'Forbidden', status: 403 });
    expect((await put({ leadAlertUids: [], notifyOwner: true })).status).toBe(403);
    expect(settings()).toBeUndefined();
  });

  it('saves both fields, deduped, and returns names', async () => {
    const res = await put({ leadAlertUids: ['ops', 'jac', 'ops'], notifyOwner: true });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      leadAlertUids: ['ops', 'jac'],
      notifyOwner: true,
      recipients: [{ uid: 'ops', name: 'ops@x.com' }, { uid: 'jac', name: 'Jacob' }],
    });
    expect(settings()).toMatchObject({ leadAlertUids: ['ops', 'jac'], notifyOwner: true, updatedBy: 'adm' });
  });

  it.each([
    [{ leadAlertUids: [] }, 'notifyOwner must be true or false'],
    [{ leadAlertUids: [], notifyOwner: 'true' }, 'notifyOwner must be true or false'],
    [{ notifyOwner: false }, 'leadAlertUids must be up to 20 user ids'],
    [{ leadAlertUids: 'jac', notifyOwner: false }, 'leadAlertUids must be up to 20 user ids'],
    [{ leadAlertUids: [3], notifyOwner: false }, 'leadAlertUids must be up to 20 user ids'],
    [{ leadAlertUids: Array.from({ length: 21 }, (_, i) => `u${i}`), notifyOwner: false }, 'leadAlertUids must be up to 20 user ids'],
    [{ leadAlertUids: ['nobody'], notifyOwner: false }, 'Unknown user in leadAlertUids'],
  ])('rejects %j', async (body, error) => {
    const res = await put(body);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error });
    expect(settings()).toBeUndefined();
  });
});
