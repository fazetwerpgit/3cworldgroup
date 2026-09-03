import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/auth/requireVerifiedAdmin', () => ({
  requireVerifiedRequester: vi.fn(),
  requireVerifiedUser: vi.fn(),
}));

vi.mock('@/lib/push/sendPush', () => ({ sendPushToUser: vi.fn() }));

// A tiny stand-in for a Firestore query: it records the wheres it was given so
// the tests can assert the month range actually reached the QUERY rather than
// being applied to an arbitrary slice in memory, which is the bug that made the
// admin board show the same rows for every month.
interface WhereCall { field: string; op: string; value: unknown; }

const state: {
  docs: Array<Record<string, unknown>>;
  wheres: WhereCall[];
  orderBys: Array<{ field: string; direction?: string }>;
  limits: number[];
} = { docs: [], wheres: [], orderBys: [], limits: [] };

function makeQuery() {
  const query = {
    where: vi.fn((field: string, op: string, value: unknown) => {
      state.wheres.push({ field, op, value });
      return query;
    }),
    orderBy: vi.fn((field: string, direction?: string) => {
      state.orderBys.push({ field, direction });
      return query;
    }),
    limit: vi.fn((n: number) => {
      state.limits.push(n);
      return query;
    }),
    get: vi.fn(async () => ({
      size: state.docs.length,
      forEach: (fn: (doc: { id: string; data: () => Record<string, unknown> }) => void) => {
        state.docs.forEach((data, index) =>
          fn({ id: `s${index}`, data: () => data })
        );
      },
    })),
  };
  return query;
}

vi.mock('@/lib/firebase/admin', () => ({
  adminDb: { collection: vi.fn(() => makeQuery()) },
  initError: null,
}));

import { GET } from './route';
import { requireVerifiedRequester } from '@/lib/auth/requireVerifiedAdmin';

const mockRequester = requireVerifiedRequester as unknown as ReturnType<typeof vi.fn>;

function stamp(date: Date) {
  return { toDate: () => date };
}

function saleDoc(saleDate: Date, salesRepId = 'r1') {
  return {
    salesRepId,
    salesRepName: 'Wil Teasdale',
    customerAddress: '1 Main St',
    totalValue: 100,
    status: 'approved',
    saleDate: stamp(saleDate),
    createdAt: stamp(saleDate),
    updatedAt: stamp(saleDate),
  };
}

function get(qs = '') {
  return new NextRequest(`http://localhost/api/portal/sales${qs}`);
}

function asAdmin() {
  mockRequester.mockResolvedValue({
    ok: true, uid: 'a1', name: 'Admin', email: 'a@x.com',
    role: 'admin', isManagement: true, isAdmin: true, isManagerOrAbove: true,
  });
}

beforeEach(() => {
  mockRequester.mockReset();
  state.docs = [];
  state.wheres = [];
  state.orderBys = [];
  state.limits = [];
});

describe('GET /api/portal/sales date range', () => {
  it('pushes an admin month range into the query, not into a memory filter', async () => {
    asAdmin();
    await GET(get('?startDate=2026-09-01&endDate=2026-09-30&limit=500'));

    const saleDateWheres = state.wheres.filter((w) => w.field === 'saleDate');
    expect(saleDateWheres.map((w) => w.op)).toEqual(['>=', '<=']);
    expect((saleDateWheres[0].value as Date).getMonth()).toBe(8);
    expect((saleDateWheres[1].value as Date).getDate()).toBe(30);
    // No rep filter was asked for, so none is added.
    expect(state.wheres.some((w) => w.field === 'salesRepId')).toBe(false);
  });

  it('pairs the rep equality WITH the month range in the query', async () => {
    // These used to be mutually exclusive: the rep filter won and the dates were
    // re-applied in memory over a limit(min(limit*2,500)) window, so a rep with a
    // long book silently lost older months. The composite index
    // (sales: salesRepId ASC + saleDate ASC) lets both run in Firestore.
    mockRequester.mockResolvedValue({
      ok: true, uid: 'r1', name: 'Rep', email: 'r@x.com',
      fieldRole: 'internal_rep', isManagement: false, isAdmin: false, isManagerOrAbove: false,
    });
    state.docs = [saleDoc(new Date(2026, 8, 10))];

    const json = await (await GET(get('?startDate=2026-09-01&endDate=2026-09-30'))).json();

    expect(state.wheres.map((w) => `${w.field}${w.op}`)).toEqual([
      'salesRepId==', 'saleDate>=', 'saleDate<=',
    ]);
    // Nothing is dropped in memory any more — the query already did the range.
    expect(json.sales).toHaveLength(1);
    expect(new Date(json.sales[0].saleDate).getMonth()).toBe(8);
  });

  it('returns everything when no range is given', async () => {
    asAdmin();
    state.docs = [saleDoc(new Date(2026, 8, 10)), saleDoc(new Date(2026, 6, 1))];

    const json = await (await GET(get())).json();

    expect(state.wheres).toEqual([]);
    expect(json.sales).toHaveLength(2);
  });

  it('ignores a malformed date rather than returning an empty month', async () => {
    asAdmin();
    state.docs = [saleDoc(new Date(2026, 8, 10))];

    const json = await (await GET(get('?startDate=september&endDate='))).json();

    expect(state.wheres).toEqual([]);
    expect(json.sales).toHaveLength(1);
  });
});

describe('GET /api/portal/sales truncation', () => {
  it('orders the query by saleDate desc so the limit cuts by date, not document id', async () => {
    asAdmin();
    state.docs = [saleDoc(new Date(2026, 8, 10))];

    await GET(get());

    expect(state.orderBys).toEqual([{ field: 'saleDate', direction: 'desc' }]);
  });

  it('keeps saleDate as the first orderBy when a month range is also applied', async () => {
    // Firestore rejects a query whose inequality field is not sorted first.
    asAdmin();
    await GET(get('?startDate=2026-09-01&endDate=2026-09-30'));

    expect(state.orderBys[0].field).toBe('saleDate');
  });

  it('reports truncated when the query came back full', async () => {
    asAdmin();
    // limit=2 -> maxFetch = min(4, 500) = 4; four docs back means Firestore had more.
    state.docs = [
      saleDoc(new Date(2026, 8, 10)), saleDoc(new Date(2026, 8, 9)),
      saleDoc(new Date(2026, 8, 8)), saleDoc(new Date(2026, 8, 7)),
    ];

    const json = await (await GET(get('?limit=2'))).json();

    expect(state.limits).toEqual([4]);
    expect(json.truncated).toBe(true);
    // A plain flag, no count: knowing how many were cut needs a second read.
    expect(Object.keys(json).sort()).toEqual(['sales', 'truncated']);
    // The page-size cut still applies, and is NOT what truncated reports.
    expect(json.sales).toHaveLength(2);
  });

  it('does not report truncated when the query came back short of the cap', async () => {
    asAdmin();
    state.docs = [saleDoc(new Date(2026, 8, 10)), saleDoc(new Date(2026, 8, 9))];

    const json = await (await GET(get('?limit=2'))).json();

    expect(json.truncated).toBe(false);
    expect(json.sales).toHaveLength(2);
  });
});
