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
} = { docs: [], wheres: [] };

function makeQuery() {
  const query = {
    where: vi.fn((field: string, op: string, value: unknown) => {
      state.wheres.push({ field, op, value });
      return query;
    }),
    limit: vi.fn(() => query),
    get: vi.fn(async () => ({
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
});

describe('GET /api/portal/sales date range', () => {
  it('pushes an admin month range into the query, not into a memory filter', async () => {
    asAdmin();
    await GET(get('?startDate=2026-09-01&endDate=2026-09-30&limit=500'));

    const saleDateWheres = state.wheres.filter((w) => w.field === 'saleDate');
    expect(saleDateWheres.map((w) => w.op)).toEqual(['>=', '<=']);
    expect((saleDateWheres[0].value as Date).getMonth()).toBe(8);
    expect((saleDateWheres[1].value as Date).getDate()).toBe(30);
    // No rep equality alongside it — that pairing would need a composite index.
    expect(state.wheres.some((w) => w.field === 'salesRepId')).toBe(false);
  });

  it('narrows a rep-scoped request in memory instead of pairing the filters', async () => {
    mockRequester.mockResolvedValue({
      ok: true, uid: 'r1', name: 'Rep', email: 'r@x.com',
      fieldRole: 'internal_rep', isManagement: false, isAdmin: false, isManagerOrAbove: false,
    });
    state.docs = [
      saleDoc(new Date(2026, 8, 10)),
      saleDoc(new Date(2026, 7, 10)),
    ];

    const json = await (await GET(get('?startDate=2026-09-01&endDate=2026-09-30'))).json();

    expect(state.wheres).toEqual([{ field: 'salesRepId', op: '==', value: 'r1' }]);
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
