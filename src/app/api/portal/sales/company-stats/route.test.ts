import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/auth/requireVerifiedAdmin', () => ({
  requireVerifiedUser: vi.fn(),
}));

// Stand-in for the approved-sales query. The tape reduces in memory, so the
// tests only need the docs the query hands back.
const state: { docs: Array<Record<string, unknown>> } = { docs: [] };

vi.mock('@/lib/firebase/admin', () => ({
  adminAuth: {},
  adminDb: {
    collection: vi.fn(() => ({
      where: vi.fn(() => ({
        get: vi.fn(async () => ({
          forEach: (fn: (doc: { id: string; data: () => Record<string, unknown> }) => void) => {
            state.docs.forEach((data, index) => fn({ id: `s${index}`, data: () => data }));
          },
        })),
      })),
    })),
  },
}));

import { GET } from './route';
import { requireVerifiedUser } from '@/lib/auth/requireVerifiedAdmin';

const mockUser = requireVerifiedUser as unknown as ReturnType<typeof vi.fn>;

function stamp(date: Date) {
  return { toDate: () => date };
}

const now = new Date();
const thisMonth = new Date(now.getFullYear(), now.getMonth(), 1, 12, 0, 0);
const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 15, 12, 0, 0);

function get() {
  return new NextRequest('http://localhost/api/portal/sales/company-stats');
}

beforeEach(() => {
  mockUser.mockReset();
  mockUser.mockResolvedValue({ ok: true, uid: 'u1', name: 'Rep', email: 'r@x.com' });
  state.docs = [];
});

describe('GET /api/portal/sales/company-stats', () => {
  it('counts a sale by its saleDate, not its upload time', async () => {
    state.docs = [
      {
        salesRepName: 'Wil Teasdale',
        totalValue: 120,
        saleDate: stamp(thisMonth),
        createdAt: stamp(thisMonth),
      },
    ];

    const json = await (await GET(get())).json();

    expect(json.mtdCount).toBe(1);
    expect(json.mtdMonthlyValue).toBe(120);
    expect(json.lastSale).toEqual({ repName: 'Wil Teasdale' });
  });

  it('excludes a back-entered sale whose saleDate is last month', async () => {
    // The exact regression: uploaded and approved today, but it HAPPENED in
    // the previous month, so it must not inflate this month's tape.
    state.docs = [
      {
        salesRepName: 'Back Entry',
        totalValue: 500,
        saleDate: stamp(lastMonth),
        createdAt: stamp(now),
        approvedAt: stamp(now),
      },
      {
        salesRepName: 'This Month',
        totalValue: 90,
        saleDate: stamp(thisMonth),
        createdAt: stamp(thisMonth),
      },
    ];

    const json = await (await GET(get())).json();

    expect(json.mtdCount).toBe(1);
    expect(json.mtdMonthlyValue).toBe(90);
    // Latest by sale date too — the back-entered row is older, not newest.
    expect(json.lastSale).toEqual({ repName: 'This Month' });
  });

  it('falls back to createdAt for older docs with no saleDate', async () => {
    state.docs = [
      { salesRepName: 'Legacy', totalValue: 60, createdAt: stamp(thisMonth) },
    ];

    const json = await (await GET(get())).json();

    expect(json.mtdCount).toBe(1);
    expect(json.mtdMonthlyValue).toBe(60);
  });

  it('skips a doc with no usable date rather than counting it', async () => {
    state.docs = [{ salesRepName: 'Dateless', totalValue: 999 }];

    const json = await (await GET(get())).json();

    expect(json).toEqual({ mtdCount: 0, mtdMonthlyValue: 0, lastSale: null });
  });
});
