import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const firestore = vi.hoisted(() => {
  const users: Array<{ id: string; data: Record<string, unknown> }> = [];
  const adminDb = {
    collection: vi.fn((name: string) => {
      if (name !== 'users') throw new Error(`Unexpected collection: ${name}`);
      return {
        orderBy: () => ({
          get: vi.fn(async () => ({
            forEach: (cb: (doc: { id: string; data: () => Record<string, unknown> }) => void) =>
              users.forEach((u) => cb({ id: u.id, data: () => u.data })),
          })),
        }),
      };
    }),
  };
  return { adminDb, users };
});

const gate = vi.hoisted(() => ({
  value: { ok: true, uid: 'admin', name: 'Admin', isAdmin: true, isOwner: false } as Record<string, unknown>,
}));

vi.mock('@/lib/firebase/admin', () => ({ adminDb: firestore.adminDb }));
vi.mock('@/lib/auth/requireVerifiedAdmin', () => ({
  requireVerifiedManagement: vi.fn(async () => gate.value),
}));

import { GET } from './route';

function get(query = '') {
  return GET(new NextRequest(`http://localhost/api/portal/auth/users${query}`));
}

async function uids(query = ''): Promise<string[]> {
  const res = await get(query);
  expect(res.status).toBe(200);
  const body = (await res.json()) as { users: Array<{ uid: string }> };
  return body.users.map((u) => u.uid);
}

describe('GET /api/portal/auth/users: demo and test accounts', () => {
  beforeEach(() => {
    firestore.users.length = 0;
    firestore.users.push(
      { id: 'rep', data: { email: 'rep@x.com', fieldRole: 'entry_level_rep', status: 'active' } },
      { id: 'tester', data: { email: 't@x.com', fieldRole: 'entry_level_rep', status: 'active', testAccount: true } },
      { id: 'demo', data: { email: 'd@x.com', fieldRole: 'entry_level_rep', status: 'active', demoAccount: true } },
      // Only `=== true` hides an account.
      { id: 'stringy', data: { email: 's@x.com', fieldRole: 'entry_level_rep', status: 'active', testAccount: 'true' } },
    );
    gate.value = { ok: true, uid: 'admin', name: 'Admin', isAdmin: true, isOwner: false };
  });

  it('hides test and demo accounts from the roster by default', async () => {
    expect(await uids()).toEqual(['rep', 'stringy']);
    expect(await uids('?status=active')).toEqual(['rep', 'stringy']);
  });

  it('lists them, flagged, for an admin directory that opts in', async () => {
    const res = await get('?includeHidden=1');
    const body = (await res.json()) as { users: Array<{ uid: string; testAccount?: boolean; demoAccount?: boolean }> };
    expect(body.users.map((u) => u.uid)).toEqual(['rep', 'tester', 'demo', 'stringy']);
    expect(body.users.find((u) => u.uid === 'tester')).toMatchObject({ testAccount: true });
    expect(body.users.find((u) => u.uid === 'demo')).toMatchObject({ demoAccount: true });
    expect(body.users.find((u) => u.uid === 'rep')?.testAccount).toBeUndefined();
  });

  it('lets an owner opt in too', async () => {
    gate.value = { ok: true, uid: 'owner', name: 'Owner', isAdmin: true, isOwner: true };
    expect(await uids('?includeHidden=1')).toContain('tester');
  });

  it('ignores the opt-in for a non-admin management caller (operations)', async () => {
    gate.value = { ok: true, uid: 'ops', name: 'Ops', isAdmin: false, isOwner: false };
    expect(await uids('?includeHidden=1')).toEqual(['rep', 'stringy']);
  });

  it('still refuses a caller the management gate rejects', async () => {
    gate.value = { ok: false, error: 'Forbidden', status: 403 };
    const res = await get('?includeHidden=1');
    expect(res.status).toBe(403);
  });
});
