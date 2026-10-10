import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1';

const fake = vi.hoisted(() => {
  const users = new Map<string, Record<string, unknown>>();
  const updates: Array<{ uid: string; data: Record<string, unknown> }> = [];
  const gate = { result: { ok: true, uid: 'owner-1', name: 'Owner' } as Record<string, unknown> };
  const adminDb = {
    collection: vi.fn((name: string) => {
      if (name !== 'users') throw new Error(`Unexpected collection: ${name}`);
      return {
        where: (field: string, _op: string, value: unknown) => ({
          get: async () => ({
            docs: [...users.entries()]
              .filter(([, data]) => data[field] === value)
              .map(([id, data]) => ({ id, data: () => data })),
          }),
        }),
        doc: (uid: string) => ({
          get: async () => ({ exists: users.has(uid), data: () => users.get(uid) }),
          update: vi.fn(async (data: Record<string, unknown>) => {
            updates.push({ uid, data });
            users.set(uid, { ...(users.get(uid) ?? {}), ...data });
          }),
        }),
      };
    }),
  };
  return { users, updates, gate, adminDb };
});

vi.mock('@/lib/firebase/admin', () => ({ adminDb: fake.adminDb }));
vi.mock('@/lib/auth/requireVerifiedAdmin', () => ({
  requireVerifiedAdmin: vi.fn(async () => fake.gate.result),
}));

import { GET, PATCH } from './route';

function req(method: 'GET' | 'PATCH', body?: unknown) {
  return new NextRequest('http://localhost/api/portal/admin/push', {
    method,
    headers: { Authorization: 'Bearer t', 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
  });
}

const at = (iso: string) => ({ toDate: () => new Date(iso) });

beforeEach(() => {
  fake.users.clear();
  fake.updates.length = 0;
  fake.gate.result = { ok: true, uid: 'owner-1', name: 'Owner' };
  fake.users.set('on', { status: 'active', displayName: 'Ana On', pushTokens: ['t1'] });
  fake.users.set('wil', {
    status: 'active',
    displayName: 'Wil Default',
    pushTokens: [],
    pushRequired: true,
    pushHealth: { result: 'skipped', ua: IPHONE, standalone: true, permission: 'default', supported: true, at: at('2026-10-09T10:00:00Z') },
  });
  fake.users.set('miles', {
    status: 'active',
    displayName: 'Miles Safari',
    pushHealth: { ua: IPHONE, standalone: false, permission: 'no-api', supported: false, at: at('2026-10-08T09:00:00Z') },
  });
  fake.users.set('gone', { status: 'inactive', displayName: 'Gone', pushTokens: [] });
});

describe('GET /api/portal/admin/push', () => {
  it('refuses a caller who is not admin or owner', async () => {
    fake.gate.result = { ok: false, error: 'Forbidden: admin access required', status: 403 };
    const res = await GET(req('GET'));
    expect(res.status).toBe(403);
  });

  it('lists active users only, off first, with state, required and last check', async () => {
    const res = await GET(req('GET'));
    expect(res.status).toBe(200);
    const { users } = await res.json();
    expect(users.map((u: { uid: string }) => u.uid)).toEqual(['miles', 'wil', 'on']);
    expect(users[0]).toMatchObject({ state: 'not-installed', required: false, checkedAt: '2026-10-08T09:00:00.000Z' });
    expect(users[1]).toMatchObject({ name: 'Wil Default', state: 'never-allowed', required: true });
    expect(users[2]).toMatchObject({ state: 'on', checkedAt: null });
  });
});

describe('PATCH /api/portal/admin/push', () => {
  it('refuses a caller who is not admin or owner, writing nothing', async () => {
    fake.gate.result = { ok: false, error: 'Forbidden: admin access required', status: 403 };
    const res = await PATCH(req('PATCH', { uid: 'miles', required: true }));
    expect(res.status).toBe(403);
    expect(fake.updates).toEqual([]);
  });

  it('writes only pushRequired, whatever else the body carries', async () => {
    const res = await PATCH(req('PATCH', { uid: 'miles', required: true, role: 'owner', status: 'inactive', pushTokens: [] }));
    expect(res.status).toBe(200);
    expect(fake.updates).toEqual([{ uid: 'miles', data: { pushRequired: true } }]);
  });

  it('turns it off', async () => {
    const res = await PATCH(req('PATCH', { uid: 'wil', required: false }));
    expect(res.status).toBe(200);
    expect(fake.updates).toEqual([{ uid: 'wil', data: { pushRequired: false } }]);
  });

  it('rejects a bad body', async () => {
    for (const body of [{ uid: 'miles' }, { uid: 'miles', required: 'yes' }, { required: true }, { uid: 'a/b', required: true }, 'not json']) {
      const res = await PATCH(req('PATCH', body));
      expect(res.status).toBe(400);
    }
    expect(fake.updates).toEqual([]);
  });

  it('404s an unknown user without creating a doc', async () => {
    const res = await PATCH(req('PATCH', { uid: 'nobody', required: true }));
    expect(res.status).toBe(404);
    expect(fake.updates).toEqual([]);
  });
});
