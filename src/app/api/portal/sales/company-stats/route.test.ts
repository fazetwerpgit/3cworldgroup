import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/auth/requireVerifiedAdmin', () => ({
  requireVerifiedUser: vi.fn(),
}));

// Stand-in for the sales (every sale, any status, like the leaderboard) and the
// carrier report. The route reads the tape from the leaderboard snapshot; this
// mock builds it with the snapshot's own builder (buildBoardSnapshot), so the
// counting under test is the real one. The snapshot's Firestore flow is tested
// in lib/leaderboard/snapshotStore.test. Docs with no status read as approved.
const state: { docs: Array<Record<string, unknown>>; orders: Array<Record<string, unknown>> } = { docs: [], orders: [] };

vi.mock('@/lib/firebase/admin', () => ({ adminAuth: {}, adminDb: {} }));

vi.mock('@/lib/leaderboard/snapshotStore', async () => {
  const { buildBoardSnapshot } = await import('@/lib/leaderboard/snapshot');
  return {
    loadCompanyTape: vi.fn(async (now: Date, viewerUid: string) => {
      const sales = state.docs.map((data, index) => ({ id: `s${index}`, data: { status: 'approved', ...data } as Record<string, unknown> }));
      // The shared snapshot sees no demo sales; a demo owner's is built for it.
      const demoOwner = sales.some((sale) => sale.data.demoAccount === true && sale.data.salesRepId === viewerUid);
      return buildBoardSnapshot(sales, state.orders as never, { now, viewerUid: demoOwner ? viewerUid : null }).tape;
    }),
  };
});

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
  // An owner by default (the dollar total is theirs); see the rep test below.
  mockUser.mockResolvedValue({ ok: true, uid: 'u1', name: 'Owner', email: 'o@x.com', isOwner: true, isAdmin: true });
  state.docs = [];
  state.orders = [];
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
    expect(json.lastSale).toEqual({ repName: 'Wil Teasdale', at: thisMonth.toISOString() });
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
    expect(json.lastSale).toEqual({ repName: 'This Month', at: thisMonth.toISOString() });
  });

  it('times Last by when the sale was logged, not its noon sale date', async () => {
    const logged = new Date(thisMonth.getTime() + 3 * 60 * 60 * 1000 + 17 * 60 * 1000);
    state.docs = [
      { salesRepName: 'Cole', totalValue: 80, saleDate: stamp(thisMonth), createdAt: stamp(logged) },
    ];

    const json = await (await GET(get())).json();

    expect(json.lastSale).toEqual({ repName: 'Cole', at: logged.toISOString() });
  });

  it('leaves the time off when the sale was logged on a later day', async () => {
    state.docs = [
      {
        salesRepName: 'Cole',
        totalValue: 80,
        saleDate: stamp(lastMonth),
        createdAt: stamp(new Date(lastMonth.getTime() + 2 * 24 * 60 * 60 * 1000)),
      },
    ];

    const json = await (await GET(get())).json();

    expect(json.lastSale).toEqual({ repName: 'Cole' });
  });

  it('an older doc with no saleDate is off the month count (as on the Board) but can be the last sale', async () => {
    state.docs = [
      { salesRepName: 'Legacy', totalValue: 60, createdAt: stamp(thisMonth) },
    ];

    const json = await (await GET(get())).json();

    expect(json.mtdCount).toBe(0);
    expect(json.mtdMonthlyValue).toBe(0);
    expect(json.lastSale).toEqual({ repName: 'Legacy', at: thisMonth.toISOString() });
  });

  it('never sends the company dollar total to a non-owner, and the rep tape fields are unchanged', async () => {
    mockUser.mockResolvedValue({ ok: true, uid: 'u2', name: 'Rep', email: 'r@x.com', isOwner: false, isAdmin: false });
    state.docs = [{ salesRepId: 'r1', salesRepName: 'Cole Hart', totalValue: 80, saleDate: stamp(thisMonth) }];

    const json = await (await GET(get())).json();

    expect(json).not.toHaveProperty('mtdMonthlyValue');
    expect(json).toEqual({ mtdCount: 1, lastSale: { repName: 'Cole Hart' }, topRep: { repName: 'Cole Hart', count: 1 } });
  });

  it('counts like the leaderboard: carrier-cancelled and charged-back sales drop out', async () => {
    const day = (offset: number) => new Date(thisMonth.getTime() + offset * 86_400_000);
    const iso = (date: Date) => date.toISOString().slice(0, 10);
    state.docs = [
      { salesRepId: 'r1', salesRepName: 'Cole Hart', saleDate: stamp(day(0)), orderNumberOrBtn: 'TMO20260901AAAAA' },
      { salesRepId: 'r1', salesRepName: 'Cole Hart', saleDate: stamp(day(0)), orderNumberOrBtn: 'TMO20260901BBBBB' },
      { salesRepId: 'r1', salesRepName: 'Cole Hart', saleDate: stamp(day(0)), installDate: stamp(day(1)), orderNumberOrBtn: 'TMO20260901CCCCC' },
    ];
    state.orders = [
      { id: 'TMO20260901BBBBB', matchedUserId: 'r1', status: 'cancelled', cancellationDate: iso(day(2)) },
      { id: 'TMO20260901CCCCC', matchedUserId: 'r1', status: 'churned', activationDate: iso(day(1)), deactivationDate: iso(day(10)) },
    ];

    const json = await (await GET(get())).json();

    expect(json.mtdCount).toBe(1);
    expect(json.topRep).toEqual({ repName: 'Cole Hart', count: 1 });
  });

  it('skips a doc with no usable date rather than counting it', async () => {
    state.docs = [{ salesRepName: 'Dateless', totalValue: 999 }];

    const json = await (await GET(get())).json();

    expect(json).toEqual({ mtdCount: 0, mtdMonthlyValue: 0, lastSale: null, topRep: null });
  });

  it('names the month leader by rep id with a count and no money', async () => {
    const later = new Date(thisMonth.getTime() + 3_600_000);
    state.docs = [
      { salesRepId: 'r1', salesRepName: 'Braeden Crouse', totalValue: 80, saleDate: stamp(thisMonth) },
      { salesRepId: 'r1', salesRepName: 'Braeden Crouse', totalValue: 80, saleDate: stamp(later) },
      { salesRepId: 'r2', salesRepName: 'Cole Hart', totalValue: 80, saleDate: stamp(later) },
      { salesRepId: 'r2', salesRepName: 'Cole Hart', totalValue: 80, saleDate: stamp(lastMonth) },
    ];

    const json = await (await GET(get())).json();

    expect(json.mtdCount).toBe(3);
    expect(json.topRep).toEqual({ repName: 'Braeden Crouse', count: 2 });
  });
});

describe('GET /api/portal/sales/company-stats — demo accounts', () => {
  it("leaves a demo account's sales off the company tape", async () => {
    state.docs = [
      { salesRepId: 'r1', salesRepName: 'Wil Teasdale', totalValue: 120, saleDate: stamp(thisMonth), createdAt: stamp(thisMonth) },
      {
        salesRepId: 'demo',
        salesRepName: 'App Review',
        totalValue: 999,
        saleDate: stamp(thisMonth),
        createdAt: stamp(new Date(thisMonth.getTime() + 60_000)),
        demoAccount: true,
      },
    ];

    const json = await (await GET(get())).json();

    expect(json.mtdCount).toBe(1);
    expect(json.mtdMonthlyValue).toBe(120);
    expect(JSON.stringify(json)).not.toMatch(/App Review/);
  });
});

describe('GET /api/portal/sales/company-stats for a demo account (App Review)', () => {
  const caller = (uid: string, demoAccount: boolean) => ({
    ok: true as const, uid, name: 'x', email: '', isOwner: false, isAdmin: false, demoAccount,
  });

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-16T17:00:00.000Z'));
    const sale = (day: number, salesRepId: string, salesRepName: string) => ({
      salesRepId, salesRepName, saleDate: new Date(Date.UTC(2026, 8, day, 17)), totalValue: 80,
    });
    state.docs = [sale(10, 'u2', 'Alice Real'), sale(11, 'u2', 'Alice Real'), sale(15, 'u3', 'Bob Real')];
  });
  afterEach(() => vi.useRealTimers());

  it('a demo caller sees Rep N in place of real names; counts stay', async () => {
    mockUser.mockResolvedValueOnce(caller('demo1', true));
    const json = await (await GET(get())).json();
    expect(json.mtdCount).toBe(3);
    expect(json.topRep).toEqual({ repName: 'Rep 1', count: 2 });
    expect(json.lastSale.repName).toBe('Rep 2');
    expect(JSON.stringify(json)).not.toMatch(/Alice|Bob|u2|u3/);
  });

  it('a normal rep sees the names unchanged', async () => {
    mockUser.mockResolvedValueOnce(caller('u3', false));
    const json = await (await GET(get())).json();
    expect(json.topRep).toEqual({ repName: 'Alice Real', count: 2 });
    expect(json.lastSale.repName).toBe('Bob Real');
  });
});
