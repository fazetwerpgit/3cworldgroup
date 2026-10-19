import { beforeEach, describe, expect, it, vi } from 'vitest';

type Data = Record<string, unknown>;

const h = vi.hoisted(() => ({
  map: {} as Data,
  users: [] as Array<{ id: string; data: Data }>,
  orders: [] as Array<{ id: string; data: Data }>,
  updates: new Map<string, Data>(),
  configWrites: [] as Data[],
}));

vi.mock('@/lib/firebase/admin', () => {
  const orderDoc = (o: { id: string; data: Data }) => ({ id: o.id, ref: { id: o.id }, data: () => ({ ...o.data }) });
  return {
    adminDb: {
      collection: (c: string) => ({
        doc: () => ({
          get: async () => ({ data: () => ({ ...h.map }) }),
          set: async (data: Data) => {
            h.configWrites.push(data);
          },
        }),
        get: async () => ({
          docs: c === 'users' ? h.users.map((u) => ({ id: u.id, data: () => ({ ...u.data }) })) : [],
        }),
        where: (field: string, _op: string, value: unknown) => ({
          get: async () => ({
            docs: h.orders.filter((o) => (o.data[field] ?? null) === value).map(orderDoc),
          }),
        }),
      }),
      batch: () => ({
        update: (ref: { id: string }, data: Data) => {
          h.updates.set(ref.id, data);
        },
        commit: async () => {},
      }),
    },
  };
});
vi.mock('@/lib/fiberReport/ordersCache', () => ({ invalidateFiberOrdersCache: vi.fn(async () => {}) }));

import { rematchUnmatchedOrders } from './rematch';

beforeEach(() => {
  h.map = {};
  h.users = [];
  h.orders = [];
  h.updates.clear();
  h.configWrites = [];
});

describe('rematchUnmatchedOrders', () => {
  it('gives an order a dealer handoff covers to the borrower, like the import does', async () => {
    h.map = {
      map: { '4808955': 'jeremy' },
      handoffs: { '4808955': { userId: 'miles', from: '2026-10-05' } },
    };
    h.users = [
      { id: 'jeremy', data: { displayName: 'Jeremy Owner' } },
      { id: 'miles', data: { displayName: 'Miles Borrower' } },
    ];
    h.orders = [
      { id: 'before', data: { repDealerId: '4808955', repName: 'Jeremy Owner', orderDate: '2026-10-01', matchedUserId: null } },
      { id: 'during', data: { repDealerId: '4808955', repName: 'Jeremy Owner', orderDate: '2026-10-07', matchedUserId: null } },
      { id: 'breakage', data: { repDealerId: '4808955', repName: 'Jeremy Owner', estInstallDate: '2026-10-09', matchedUserId: null } },
    ];

    const result = await rematchUnmatchedOrders();

    expect(result).toEqual({ updated: 3, stillUnmatched: 0 });
    expect(h.updates.get('before')?.matchedUserId).toBe('jeremy');
    expect(h.updates.get('during')?.matchedUserId).toBe('miles');
    expect(h.updates.get('breakage')?.matchedUserId).toBe('miles');
  });

  it('dates a breakage row by its matched sale on the code, as the import does', async () => {
    h.map = {
      map: { '4808955': 'jeremy' },
      handoffs: { '4808955': { userId: 'miles', from: '2026-10-05' } },
    };
    h.users = [{ id: 'jeremy', data: { displayName: 'Jeremy Owner', status: 'active' } }];
    h.orders = [
      // Sold before the handoff, already matched.
      { id: 'sale', data: { repDealerId: '4808955', orderDate: '2026-10-02', address: '1 Oak St', matchedUserId: 'jeremy' } },
      // Its missed-install row, installed during the handoff.
      { id: 'breakage', data: { repDealerId: '4808955', estInstallDate: '2026-10-09', address: '1 Oak St', matchedUserId: null } },
    ];

    await rematchUnmatchedOrders();

    expect(h.updates.get('breakage')?.matchedUserId).toBe('jeremy');
  });

  it('matches a handoff order to the borrower even when the code has no map entry yet', async () => {
    h.map = { map: {}, handoffs: { '777': { userId: 'miles', from: '2026-10-05', to: '2026-10-20' } } };
    h.users = [{ id: 'miles', data: { displayName: 'Miles Borrower' } }];
    h.orders = [{ id: 'o1', data: { repDealerId: '777', repName: 'Unknown Person', orderDate: '2026-10-10', matchedUserId: null } }];

    await rematchUnmatchedOrders();

    expect(h.updates.get('o1')?.matchedUserId).toBe('miles');
    // A handoff owner is never learned as the code's map owner.
    expect(h.configWrites).toEqual([]);
  });

  it('never matches a carrier order to a demo account', async () => {
    h.users = [
      { id: 'demo', data: { displayName: 'Sam Demo', demoAccount: true, status: 'active' } },
      { id: 'real', data: { displayName: 'Real Rep', status: 'active' } },
    ];
    h.orders = [
      { id: 'exact', data: { repDealerId: '555', repName: 'Sam Demo', orderDate: '2026-10-10', matchedUserId: null } },
      { id: 'fuzzy', data: { repDealerId: '', repName: 'Samuel Demo', orderDate: '2026-10-10', matchedUserId: null } },
      { id: 'ok', data: { repDealerId: '', repName: 'Real Rep', orderDate: '2026-10-10', matchedUserId: null } },
    ];

    const result = await rematchUnmatchedOrders();

    expect(result).toEqual({ updated: 1, stillUnmatched: 2 });
    expect(h.updates.has('exact')).toBe(false);
    expect(h.updates.has('fuzzy')).toBe(false);
    expect(h.updates.get('ok')?.matchedUserId).toBe('real');
    expect(h.configWrites).toEqual([]);
  });
});
