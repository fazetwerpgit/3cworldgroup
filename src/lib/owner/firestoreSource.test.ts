import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { FiberOrder, Sale } from '@/types';

// Sharon T., 149 Varsity Dr: a missed-install row beside her real order. The
// owner home reads sales through this projection; it must carry the order
// number so its join (companyBook) lands where the board's does.
const { selectMock, saleDocs, orders, userRows } = vi.hoisted(() => ({
  selectMock: vi.fn(),
  saleDocs: [] as { id: string; data: () => Record<string, unknown> }[],
  orders: [] as unknown[],
  userRows: new Map<string, Record<string, unknown>>(),
}));

// users: where(field, '==' | '>=', value).select(...fields).get(), projecting
// only the selected fields, as Firestore does.
function usersCollection() {
  return {
    where: (field: string, op: string, value: unknown) => ({
      select: (...fields: string[]) => ({
        get: async () => ({
          docs: [...userRows.entries()]
            .filter(([, data]) => {
              const have = data[field];
              if (op === '==') return have === value;
              return have instanceof Date && value instanceof Date && have.getTime() >= value.getTime();
            })
            .map(([id, data]) => {
              const projected = Object.fromEntries(fields.filter((f) => f in data).map((f) => [f, data[f]]));
              return { id, data: () => projected, get: (f: string) => projected[f] };
            }),
        }),
      }),
    }),
  };
}

vi.mock('@/lib/firebase/admin', () => ({
  adminDb: {
    collection: (name: string) =>
      name === 'sales'
        ? {
            where: () => ({
              select: (...fields: string[]) => {
                selectMock(...fields);
                // Projected to the selected fields, as Firestore does, so a
                // field the source forgets to select really is missing.
                const project = (data: Record<string, unknown>) =>
                  Object.fromEntries(fields.filter((f) => f in data).map((f) => [f, data[f]]));
                return {
                  get: async () => ({ docs: saleDocs.map((doc) => ({ id: doc.id, data: () => project(doc.data()) })) }),
                };
              },
            }),
          }
        : name === 'users'
          ? usersCollection()
          : { doc: () => ({ get: async () => ({ exists: false, data: () => ({}) }) }) },
  },
}));
vi.mock('@/lib/fiberReport/ordersCache', async (importOriginal) => ({
  // The real cache key (the book cache is keyed on it); the orders are stubbed.
  fiberOrdersCacheKey: (await importOriginal<typeof import('@/lib/fiberReport/ordersCache')>()).fiberOrdersCacheKey,
  getAllFiberOrders: vi.fn(async () => orders),
}));

import { clearOwnerBookCache, createFirestoreOwnerSource } from './firestoreSource';
import { companyBook } from './companySummary';
import { buildMergedBook } from '@/lib/sales/mergeBook';
import { summarizeMarkets } from './markets';
import { buildOwnerWidgetData } from '@/lib/app/shellExtras';
import { rankedBoard, topRepOf } from '@/lib/leaderboard/board';

const NOW = new Date('2026-10-09T17:00:00Z');

function carrier(overrides: Partial<FiberOrder>): FiberOrder {
  return {
    id: 'x', status: 'active', rawStatus: '', repDealerId: '4808955', repName: 'Jeremy McFarland', matchedUserId: 'miles',
    orderDate: '2026-10-05', estInstallDate: '2026-10-06', activationDate: '2026-10-07', cancellationDate: null,
    deactivationDate: null, fiberPlan: null, mrc: 60, address: '149 VARSITY DR', unit: null, city: null, state: null,
    zip: null, breakageReason: null, breakageNotes: null, customerName: null, sourceSheet: '', reportReceivedAt: '',
    updatedAt: '', ...overrides,
  };
}

beforeEach(() => {
  saleDocs.length = 0;
  orders.length = 0;
  userRows.clear();
  selectMock.mockClear();
  clearOwnerBookCache();
});

describe('owner book is not re-read for a retry right after a load', () => {
  it('reuses the last book for a minute across requests, then reads again', async () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date('2026-10-18T12:00:00Z'));
      await createFirestoreOwnerSource().loadBook();
      await createFirestoreOwnerSource().loadBook();
      expect(selectMock).toHaveBeenCalledTimes(1);
      vi.setSystemTime(new Date('2026-10-18T12:01:01Z'));
      await createFirestoreOwnerSource().loadBook();
      expect(selectMock).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('owner home reads the order number, so it joins as the board does', () => {
  it('projects orderNumberOrBtn and agrees with the board on Sharon T.', async () => {
    const real = carrier({ id: 'TMO20261005Z30P4' });
    const miss = carrier({
      id: 'brk_c07a', status: 'breakage', orderDate: null, activationDate: null, estInstallDate: '2026-10-08',
      customerName: 'SHARON TIMMERMAN',
    });
    orders.push(miss, real);
    saleDocs.push({
      id: 'sharon',
      data: () => ({
        salesRepId: 'miles', salesRepName: 'Miles Scoonover', customerAddress: '149 VARSITY DR, HUNTSVILLE, TX 77340',
        orderNumberOrBtn: 'TMO20261005Z30P4', products: [], status: 'approved', totalValue: 60,
        saleDate: new Date('2026-10-05T17:00:00Z'), installDate: new Date('2026-10-06T17:00:00Z'),
      }),
    });

    const book = await createFirestoreOwnerSource().loadBook();
    expect(selectMock.mock.calls[0]).toContain('orderNumberOrBtn');
    expect(book.sales[0].orderNumberOrBtn).toBe('TMO20261005Z30P4');

    const board = buildMergedBook(book.sales as Sale[], book.orders, { now: NOW });
    const boardRow = board.rows.find((row) => row.key === 'sharon')!;
    expect(boardRow.order).toBe(real);
    expect(boardRow.counted).toBe(true);
    // The owner home counts her install off the same carrier row.
    const owner = companyBook(book.sales as Sale[], book.orders, NOW);
    expect(owner.installs.map((install) => install.saleId)).toEqual(['sharon']);
    expect(owner.installs[0].installDate.getDate()).toBe(7); // real's activation, not the miss
  });
});

describe('owner counts leave demo accounts out', () => {
  it('countPendingSignups skips a demo account, counts a real self-signup', async () => {
    userRows.set('real', { status: 'pending' });
    userRows.set('bot', { status: 'pending', suspectedBot: true });
    userRows.set('demo', { status: 'pending', demoAccount: true });
    userRows.set('notdemo', { status: 'pending', demoAccount: false });
    expect(await createFirestoreOwnerSource().countPendingSignups()).toBe(2);
  });

  it('loadActivatedSince skips a demo account', async () => {
    const since = new Date('2026-10-01T00:00:00Z');
    const after = new Date('2026-10-05T00:00:00Z');
    userRows.set('rep', { status: 'active', fieldRole: 'entry_level_rep', activatedAt: after });
    userRows.set('hired', { status: 'active', fieldRole: 'ae_tier_1', hireDate: after });
    userRows.set('demo', { status: 'active', fieldRole: 'entry_level_rep', activatedAt: after, hireDate: after, demoAccount: true });
    const users = await createFirestoreOwnerSource().loadActivatedSince(since);
    expect(users.map((u) => u.fieldRole).sort()).toEqual(['ae_tier_1', 'entry_level_rep']);
  });
});

describe('owner counts leave test accounts out', () => {
  it('countPendingSignups and loadActivatedSince skip a test account', async () => {
    const after = new Date('2026-10-05T00:00:00Z');
    userRows.set('real', { status: 'pending' });
    userRows.set('qa-pending', { status: 'pending', testAccount: true });
    expect(await createFirestoreOwnerSource().countPendingSignups()).toBe(1);
    userRows.set('rep', { status: 'active', fieldRole: 'entry_level_rep', activatedAt: after });
    userRows.set('qa', { status: 'active', fieldRole: 'ae_tier_1', activatedAt: after, testAccount: true });
    const users = await createFirestoreOwnerSource().loadActivatedSince(new Date('2026-10-01T00:00:00Z'));
    expect(users.map((u) => u.fieldRole)).toEqual(['entry_level_rep']);
  });
});

describe('owner book leaves test-account sales out', () => {
  it('projects the test stamp and drops stamped sales from the book', async () => {
    const base = { products: [], status: 'approved', totalValue: 60, saleDate: new Date('2026-10-05T17:00:00Z') };
    saleDocs.push(
      { id: 'real', data: () => ({ ...base, salesRepId: 'miles', salesRepName: 'Miles Scoonover' }) },
      { id: 'qa', data: () => ({ ...base, salesRepId: 'qa', salesRepName: 'Test Rep', testAccount: true }) },
    );

    const book = await createFirestoreOwnerSource().loadBook();

    expect(selectMock.mock.calls.at(-1)).toContain('testAccount');
    expect(book.sales.map((sale) => sale.id)).toEqual(['real']);
  });
});

describe('owner book leaves demo-account sales out', () => {
  it('projects the demo stamp and drops stamped sales from the book', async () => {
    const base = { products: [], status: 'approved', totalValue: 60, saleDate: new Date('2026-10-05T17:00:00Z') };
    saleDocs.push(
      { id: 'real', data: () => ({ ...base, salesRepId: 'miles', salesRepName: 'Miles Scoonover' }) },
      { id: 'demo', data: () => ({ ...base, salesRepId: 'demo', salesRepName: 'App Review', demoAccount: true }) },
    );

    const book = await createFirestoreOwnerSource().loadBook();

    expect(selectMock.mock.calls.at(-1)).toContain('demoAccount');
    expect(book.sales.map((sale) => sale.id)).toEqual(['real']);
  });
});

describe('owner top rep is the points leader, read through the real projection', () => {
  it('ranks by totalPoints, not the name, so Markets and the widget match the board', async () => {
    const base = { products: [], status: 'approved', totalValue: 60, saleDate: new Date('2026-10-05T17:00:00Z') };
    // Aaron A. sorts first by name; Zoe Z. has the points.
    const raw = [
      { id: 'a1', data: () => ({ ...base, salesRepId: 'aaron', salesRepName: 'Aaron Abbott', totalPoints: 1 }) },
      { id: 'a2', data: () => ({ ...base, salesRepId: 'aaron', salesRepName: 'Aaron Abbott', totalPoints: 1 }) },
      { id: 'z1', data: () => ({ ...base, salesRepId: 'zoe', salesRepName: 'Zoe Zimmer', totalPoints: 5 }) },
    ];
    saleDocs.push(...raw);

    const book = await createFirestoreOwnerSource().loadBook();
    expect(selectMock.mock.calls.at(-1)).toContain('totalPoints');
    expect(book.sales.map((sale) => sale.totalPoints)).toEqual([1, 1, 5]);

    const window = { start: new Date('2026-10-01T05:00:00Z'), end: new Date('2026-11-01T05:00:00Z') };
    // The leaderboard (and tape) rank the full sale docs.
    const fullSales = raw.map((doc) => ({ id: doc.id, ...doc.data() })) as unknown as Sale[];
    const leader = topRepOf(rankedBoard(fullSales, new Map(), window))!;
    expect(leader.salesRepId).toBe('zoe');

    const markets = summarizeMarkets(book.sales as Sale[], window, new Map());
    expect(markets.topRep).toEqual({ name: 'Zoe Z.', sales: 1 });
    const widget = buildOwnerWidgetData({ uidHash: 'h', money: null, markets, now: NOW });
    expect(widget.topRepName).toBe('Zoe Z.');
  });
});
