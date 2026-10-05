import { beforeEach, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const state = vi.hoisted(() => ({
  users: [] as Array<Record<string, unknown>>,
  sales: [] as Array<Record<string, unknown>>,
  orders: [] as Array<Record<string, unknown>>,
  onboarding: [] as Array<Record<string, unknown>>,
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

it('counts a rep who is already selling as having logins, with no recorded channel clearance', async () => {
  state.users = [
    { id: 'logs-sales', fieldRole: 'internal_rep', status: 'active' },
    { id: 'carrier-only', fieldRole: 'entry_rep', status: 'active' },
    { id: 'brand-new', fieldRole: 'ae_tier_1', status: 'active' },
  ];
  state.sales = [{ salesRepId: 'logs-sales', status: 'approved' }];
  state.orders = [{ matchedUserId: 'carrier-only' }, { matchedUserId: null }];

  const rep = await pipeline();

  expect(rep('logs-sales').stage).toBe('active');
  expect(rep('carrier-only')).toMatchObject({ stage: 'active', carrierOrders: 1 });
  expect(rep('brand-new').stage).toBe('need_logins');
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
