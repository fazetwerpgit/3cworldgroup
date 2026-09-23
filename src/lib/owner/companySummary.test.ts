import { describe, expect, it, vi } from 'vitest';
import type { FiberOrder, Sale } from '@/types';
import {
  activationsByWeek,
  buildOwnerSummary,
  carrierCancellationsIn,
  companyBook,
  firstInstallsByWeek,
  ownerPeriods,
  sameElapsed,
  type OpenQueue,
  type OwnerSummarySource,
  type RepRoles,
} from './companySummary';

// Tuesday Sep 22 2026, noon in Chicago (CDT, UTC-5).
const NOW = new Date('2026-09-22T17:00:00Z');
const noonChicago = (month: number, day: number) =>
  new Date(`2026-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}T17:00:00Z`);

const product = (company: string, productId: string) => ({
  company,
  productId,
  productName: productId,
  quantity: 1,
  unitPrice: 0,
  totalPrice: 0,
  points: 0,
});

let seq = 0;
function sale(over: Partial<Sale> & { rep: string; plan?: [string, string]; install?: Date | null }): Sale {
  seq += 1;
  const { rep, plan = ['tfiber', 'tfiber-1gig'], install, ...rest } = over;
  return {
    id: `s${seq}`,
    salesRepId: rep,
    salesRepName: rep,
    customerAddress: `${100 + seq} Unique Road ${seq}`,
    saleType: 'new_service',
    products: [product(plan[0], plan[1])],
    totalValue: 60,
    totalPoints: 0,
    status: 'approved',
    saleDate: new Date('2026-08-01T17:00:00Z'),
    installDate: install ?? undefined,
    createdAt: new Date('2026-08-01T17:00:00Z'),
    updatedAt: new Date('2026-08-01T17:00:00Z'),
    ...rest,
  } as Sale;
}

function order(over: Partial<FiberOrder>): FiberOrder {
  return {
    id: `o${(seq += 1)}`,
    status: 'active',
    rawStatus: '',
    repDealerId: '1',
    repName: 'X',
    matchedUserId: 'repA',
    orderDate: '2026-09-01',
    estInstallDate: null,
    activationDate: null,
    cancellationDate: null,
    deactivationDate: null,
    fiberPlan: null,
    mrc: null,
    address: 'nowhere',
    unit: null,
    city: null,
    state: null,
    zip: null,
    breakageReason: null,
    breakageNotes: null,
    customerName: null,
    sourceSheet: 'x',
    reportReceivedAt: '2026-09-22T12:00:00Z',
    updatedAt: '2026-09-22T12:00:00Z',
    ...over,
  };
}

const RATES = {
  ae_tier_1: { tfiber: { 'tfiber-1gig': 138, 'tfiber-500': 97.5, 'tfiber-300': 67.5 }, att: { 'att-500': 120 } },
  general_manager: { tfiber: { 'tfiber-1gig': 276, 'tfiber-2gig': 336 } },
};
const MARGIN = {
  tfiber: { 'tfiber-1gig': 460, 'tfiber-2gig': 560, 'tfiber-500': 325, 'tfiber-300': 225 },
  att: { 'att-500': 400 },
  xfinity: { 'xfinity-1gig': 350 },
};
const ROLES = new Map<string, RepRoles>([
  ['repA', { fieldRole: 'ae_tier_1' }],
  ['repB', { fieldRole: 'general_manager' }],
]);

function fixture() {
  seq = 0;
  const sales: Sale[] = [
    sale({ rep: 'repA', install: noonChicago(9, 21) }), // this week
    sale({ rep: 'repB', plan: ['tfiber', 'tfiber-2gig'], install: noonChicago(9, 10) }), // this month
    sale({ rep: 'repA', plan: ['att', 'att-500'], install: noonChicago(9, 14) }), // last week, before this point
    sale({ rep: 'repA', plan: ['tfiber', 'tfiber-500'], install: noonChicago(8, 12) }), // last month, before this point
    sale({ rep: 'repA', plan: ['tfiber', 'tfiber-300'], install: noonChicago(8, 28) }), // last month, after this point
    sale({ rep: 'repA', install: noonChicago(9, 20), status: 'cancelled' }), // cancelled in the portal
    sale({ rep: 'repC', plan: ['xfinity', 'xfinity-1gig'], install: noonChicago(9, 21) }), // rep with no plan
    sale({ rep: 'repA', install: null }), // no install date
    sale({ rep: 'repA', install: noonChicago(9, 25) }), // scheduled
    sale({ rep: 'repB', install: noonChicago(8, 30), customerAddress: '12 Oak Street' }), // carrier moved it
    sale({ rep: 'repA', install: noonChicago(9, 15), customerAddress: '40 Pine Avenue' }), // carrier cancelled
  ];
  const orders: FiberOrder[] = [
    order({ address: '12 Oak Street', matchedUserId: 'repB', status: 'active', activationDate: '2026-09-21' }),
    order({ address: '40 Pine Avenue', status: 'cancelled', cancellationDate: '2026-09-21' }),
    order({ address: '9 Lost Lane Unlogged', matchedUserId: null, status: 'active', orderDate: '2026-09-05' }),
  ];
  return { sales, orders };
}

function fakeSource(over: Partial<OwnerSummarySource> = {}): OwnerSummarySource {
  const { sales, orders } = fixture();
  return {
    loadBook: vi.fn(async () => ({ sales, orders })),
    loadCompPlan: vi.fn(async () => ({ rates: RATES, margin: MARGIN })),
    loadRepRoles: vi.fn(async (ids: string[]) => new Map([...ROLES].filter(([id]) => ids.includes(id)))),
    countOpen: vi.fn(async (queue: OpenQueue) => ({ payrollDisputes: 2, expediteOrders: 0, leadsRequests: 1, bugReports: 0 })[queue]),
    countPendingSignups: vi.fn(async () => 3),
    countStalledOnboarding: vi.fn(async () => 0),
    countCreated: vi.fn(async (collection, window) => {
      const thisWeek = window.start.getTime() === ownerPeriods(NOW).thisWeek.start.getTime();
      if (collection === 'applications') return thisWeek ? 11 : 14;
      return thisWeek ? 4 : 6;
    }),
    loadActivatedSince: vi.fn(async () => [
      { status: 'active', fieldRole: 'ae_tier_1', hireDate: noonChicago(9, 21) },
      { status: 'active', fieldRole: 'ae_tier_1', hireDate: noonChicago(9, 16) },
      { status: 'pending', fieldRole: 'ae_tier_1', hireDate: noonChicago(9, 21) },
      { status: 'active', fieldRole: null, hireDate: noonChicago(9, 21) },
    ]),
    ...over,
  };
}

describe('ownerPeriods', () => {
  it('uses Sun–Sat weeks and calendar months in Chicago', () => {
    const p = ownerPeriods(NOW);
    expect(p.thisWeek.start.toISOString()).toBe('2026-09-20T05:00:00.000Z');
    expect(p.thisWeek.end.toISOString()).toBe('2026-09-27T05:00:00.000Z');
    expect(p.lastWeek.start.toISOString()).toBe('2026-09-13T05:00:00.000Z');
    expect(p.lastWeek.end.toISOString()).toBe('2026-09-20T05:00:00.000Z');
    expect(p.thisMonth.start.toISOString()).toBe('2026-09-01T05:00:00.000Z');
    expect(p.lastMonth.start.toISOString()).toBe('2026-08-01T05:00:00.000Z');
    expect(p.lastMonth.end.toISOString()).toBe('2026-09-01T05:00:00.000Z');
  });

  it('crosses a DST change without drifting off midnight', () => {
    const p = ownerPeriods(new Date('2026-11-03T18:00:00Z')); // Tue after the Nov 1 fall-back
    expect(p.thisWeek.start.toISOString()).toBe('2026-11-01T05:00:00.000Z');
    expect(p.lastWeek.start.toISOString()).toBe('2026-10-25T05:00:00.000Z');
    expect(p.lastMonth.start.toISOString()).toBe('2026-10-01T05:00:00.000Z');
  });

  it('cuts the prior period at the same elapsed point', () => {
    const p = ownerPeriods(NOW);
    expect(sameElapsed(p.thisWeek, p.lastWeek, NOW).end.toISOString()).toBe('2026-09-15T17:00:00.000Z');
    expect(sameElapsed(p.thisMonth, p.lastMonth, NOW).end.toISOString()).toBe('2026-08-22T17:00:00.000Z');
  });
});

describe('companyBook', () => {
  it('counts installs with carrier dates, drops cancellations, and finds the gaps', () => {
    const { sales, orders } = fixture();
    const book = companyBook(sales, orders, NOW);
    const ids = book.installs.map((install) => install.saleId).sort();
    // s6 cancelled, s8 no date, s9 scheduled, s11 carrier-cancelled.
    expect(ids).toEqual(['s1', 's10', 's2', 's3', 's4', 's5', 's7']);
    const moved = book.installs.find((install) => install.saleId === 's10')!;
    expect(moved.installDate.getDate()).toBe(21); // the carrier's activation, not Aug 30
    expect(book.missingInstallDate).toBe(1);
    expect(book.notLogged).toBe(1);
  });
});

describe('buildOwnerSummary', () => {
  it('prices installs from 3C Receives and each rep’s own rate', async () => {
    const summary = await buildOwnerSummary(fakeSource(), ['money'], NOW);
    expect(summary.money!.week.current).toEqual({ installs: 3, revenue: 1270, commissions: 414, margin: 856 });
    expect(summary.money!.week.prior).toEqual({ installs: 1, revenue: 400, commissions: 120, margin: 280 });
    expect(summary.money!.month.current).toEqual({ installs: 5, revenue: 2230, commissions: 870, margin: 1360 });
    expect(summary.money!.month.prior).toEqual({ installs: 1, revenue: 325, commissions: 98, margin: 227 });
    expect(summary.money!.unratedInstalls).toBe(1);
    expect(summary.money!.unpricedInstalls).toBe(0);
    expect(summary.problems).toBeUndefined();
  });

  it('only looks up the reps who installed inside the money window', async () => {
    const source = fakeSource();
    await buildOwnerSummary(source, ['money'], NOW);
    const ids = (source.loadRepRoles as ReturnType<typeof vi.fn>).mock.calls[0][0] as string[];
    expect(ids.sort()).toEqual(['repA', 'repB', 'repC']);
  });

  it('lists every problem with its count and page, zeros included', async () => {
    const summary = await buildOwnerSummary(fakeSource(), ['problems'], NOW);
    const counts = Object.fromEntries(summary.problems!.map((row) => [row.key, row.count]));
    expect(counts).toEqual({
      carrierCancellations: 1,
      notLogged: 1,
      payrollDisputes: 2,
      stalledOnboarding: 0,
      pendingSignups: 3,
      missingInstallDate: 1,
      expediteOrders: 0,
      leadsRequests: 1,
      bugReports: 0,
    });
    expect(summary.problems!.find((row) => row.key === 'payrollDisputes')!.href).toBe('/portal/admin/payroll-disputes');
  });

  it('counts recruiting this week against last week', async () => {
    const summary = await buildOwnerSummary(fakeSource(), ['recruiting'], NOW);
    expect(summary.recruiting).toEqual({
      applications: { thisWeek: 11, lastWeek: 14 },
      interviews: { thisWeek: 4, lastWeek: 6 },
      activations: { thisWeek: 1, lastWeek: 1 },
      firstInstalls: { thisWeek: 1, lastWeek: 0 },
    });
  });

  it('reads the book once for all three sections and returns no customer data', async () => {
    const source = fakeSource();
    let calls = 0;
    const book = await source.loadBook();
    source.loadBook = vi.fn(async () => {
      calls += 1;
      return book;
    });
    const summary = await buildOwnerSummary(source, undefined, NOW);
    expect(summary.money && summary.problems && summary.recruiting).toBeTruthy();
    expect(calls).toBe(3); // the Firestore source memoizes; the pure layer just asks
    const json = JSON.stringify(summary);
    expect(json).not.toMatch(/Oak Street|Pine Avenue|Unique Road|repA/);
  });

  it('lets a failing read fail the section instead of reporting zeros', async () => {
    const source = fakeSource({ countOpen: vi.fn(async () => Promise.reject(new Error('quota'))) });
    await expect(buildOwnerSummary(source, ['problems'], NOW)).rejects.toThrow('quota');
  });
});

describe('small counters', () => {
  it('dates carrier cancellations by cancellation or deactivation day', () => {
    const p = ownerPeriods(NOW);
    const week = { start: p.thisWeek.start, end: NOW };
    expect(
      carrierCancellationsIn(
        [
          order({ status: 'cancelled', cancellationDate: '2026-09-20' }),
          order({ status: 'churned', deactivationDate: '2026-09-22' }),
          order({ status: 'cancelled', cancellationDate: '2026-09-19' }),
          order({ status: 'cancelled', cancellationDate: null }),
          order({ status: 'active', cancellationDate: '2026-09-21' }),
        ],
        week
      )
    ).toBe(2);
  });

  it('counts only active field reps as activations', () => {
    const p = ownerPeriods(NOW);
    expect(
      activationsByWeek(
        [
          { status: 'active', fieldRole: 'ae_tier_1', hireDate: noonChicago(9, 20) },
          { status: 'active', fieldRole: 'ae_tier_1', hireDate: noonChicago(9, 1) },
          { status: 'inactive', fieldRole: 'ae_tier_1', hireDate: noonChicago(9, 21) },
        ],
        p
      )
    ).toEqual({ thisWeek: 1, lastWeek: 0 });
  });

  it('credits a first install to the week of the rep’s earliest install only', () => {
    const p = ownerPeriods(NOW);
    const s = sale({ rep: 'x' });
    expect(
      firstInstallsByWeek(
        [
          { saleId: 'a', repId: 'r1', installDate: noonChicago(9, 21), sale: s },
          { saleId: 'b', repId: 'r1', installDate: noonChicago(9, 14), sale: s },
          { saleId: 'c', repId: 'r2', installDate: noonChicago(9, 16), sale: s },
          { saleId: 'd', repId: 'r3', installDate: noonChicago(9, 22), sale: s },
        ],
        p
      )
    ).toEqual({ thisWeek: 1, lastWeek: 2 });
  });
});
