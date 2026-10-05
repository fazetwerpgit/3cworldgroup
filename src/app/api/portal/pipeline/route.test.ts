import { beforeEach, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const state = vi.hoisted(() => ({
  users: [] as Array<Record<string, unknown>>,
  sales: [] as Array<Record<string, unknown>>,
  orders: [] as Array<Record<string, unknown>>,
  onboarding: [] as Array<Record<string, unknown>>,
  /** uid -> last portal sign-in; absent = never signed in. */
  signIns: {} as Record<string, string>,
}));

vi.mock('@/lib/firebase/admin', () => {
  const snap = (rows: Array<Record<string, unknown>>) => ({
    docs: rows.map((row, i) => ({ id: String(row.id ?? i), data: () => row })),
  });
  const rowsFor = (name: string) =>
    name === 'users' ? state.users : name === 'userOnboarding' ? state.onboarding : name === 'fiberOrders' ? state.orders : [];
  return {
    adminDb: {
      collection: (name: string) => ({
        get: async () => snap(rowsFor(name)),
        select: () => ({ get: async () => snap(rowsFor(name)) }),
        where: () => ({ get: async () => snap(name === 'sales' ? state.sales : []) }),
      }),
    },
    adminAuth: {
      getUsers: async (ids: Array<{ uid: string }>) => ({
        users: ids.map(({ uid }) => ({ uid, metadata: { lastSignInTime: state.signIns[uid] } })),
      }),
    },
  };
});
vi.mock('@/lib/auth/requireVerifiedAdmin', () => ({
  requireVerifiedManagement: vi.fn(async () => ({ ok: true, uid: 'admin-1' })),
}));

import { GET } from './route';

beforeEach(() => {
  state.users = [];
  state.sales = [];
  state.orders = [];
  state.onboarding = [];
  state.signIns = {};
});

async function pipeline() {
  const json = await (await GET(new NextRequest('http://localhost/api/portal/pipeline'))).json();
  return (uid: string) => json.reps.find((rep: { uid: string }) => rep.uid === uid);
}

it('does not keep an active rep with no checklist records in Processing', async () => {
  state.users = [
    { id: 'active-rep', fieldRole: 'ae_tier_1', status: 'active' },
    { id: 'pending-hire', fieldRole: 'entry_level_rep', status: 'pending' },
  ];

  const rep = await pipeline();

  expect(rep('active-rep').stage).toBe('need_logins');
  expect(rep('pending-hire').stage).toBe('processing');
});

it('puts an active rep who never signed into the portal in Need Logins, and moves them on once they do', async () => {
  state.users = [
    { id: 'never', fieldRole: 'ae_tier_1', status: 'active' },
    { id: 'signed-in', fieldRole: 'ae_tier_1', status: 'active' },
    { id: 'selling', fieldRole: 'internal_rep', status: 'active' },
    { id: 'carrier-only', fieldRole: 'entry_rep', status: 'active' },
  ];
  state.signIns = {
    'signed-in': 'Mon, 05 Oct 2026 14:00:00 GMT',
    selling: 'Tue, 18 Aug 2026 12:00:00 GMT',
    'carrier-only': 'Wed, 08 Jul 2026 12:00:00 GMT',
  };
  state.sales = [{ salesRepId: 'selling', status: 'approved' }];
  state.orders = [{ matchedUserId: 'carrier-only' }, { matchedUserId: null }];

  const rep = await pipeline();

  expect(rep('never')).toMatchObject({ stage: 'need_logins', lastSignInAt: null });
  expect(rep('signed-in')).toMatchObject({ stage: 'cleared_to_sell', lastSignInAt: '2026-10-05T14:00:00.000Z' });
  expect(rep('selling').stage).toBe('active');
  expect(rep('carrier-only')).toMatchObject({ stage: 'active', carrierOrders: 1 });
});

it('shows no checklist count for an active rep from before the checklist, but keeps it for hires', async () => {
  state.users = [
    { id: 'veteran', fieldRole: 'entry_rep', status: 'active' },
    { id: 'hire', fieldRole: 'ae_tier_1', status: 'active' },
  ];
  state.onboarding = [{ userId: 'hire', itemId: 'w9', status: 'approved' }];

  const rep = await pipeline();

  expect(rep('veteran').onboarding).toBeNull();
  expect(rep('hire').onboarding).toMatchObject({ approved: 1 });
});
