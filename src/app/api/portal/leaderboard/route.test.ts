import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';

const state: {
  docs: Array<Record<string, unknown>>;
  users: Array<{ id: string; data: Record<string, unknown> }>;
  orders: Array<Record<string, unknown>>;
} = { docs: [], users: [], orders: [] };

vi.mock('@/lib/auth/requireVerifiedAdmin', () => ({
  requireVerifiedRequester: vi.fn(async () => ({ ok: true, uid: 'u1', isManagement: true })),
}));

vi.mock('@/lib/auth/viewAs', async () => (await import('@/lib/auth/viewAsTestStub')).viewAsStubModule());

function snapshot(rows: Array<{ id: string; data: Record<string, unknown> }>) {
  return {
    forEach: (fn: (doc: { id: string; data: () => Record<string, unknown> }) => void) => {
      rows.forEach((row) => fn({ id: row.id, data: () => row.data }));
    },
  };
}

vi.mock('@/lib/firebase/admin', () => ({
  adminDb: {
    collection: vi.fn((name: string) => {
      if (name === 'users') return { where: vi.fn(() => ({ get: vi.fn(async () => snapshot(state.users)) })) };
      if (name === 'config') {
        return {
          doc: vi.fn(() => ({
            get: vi.fn(async () => ({ exists: true, data: () => ({ lastReportAt: '2026-09-16T12:00:00.000Z' }) })),
          })),
        };
      }
      return {
        limit: vi.fn(() => ({
          get: vi.fn(async () => snapshot(state.docs.map((data, i) => ({ id: `s${i}`, data })))),
        })),
      };
    }),
  },
}));

vi.mock('@/lib/fiberReport/ordersCache', () => ({
  getAllFiberOrders: vi.fn(async () => state.orders),
}));

import { GET } from './route';
import { requireVerifiedRequester } from '@/lib/auth/requireVerifiedAdmin';
import { viewAsHeaders } from '@/lib/auth/viewAsTestStub';

function request(period: string) {
  return new NextRequest(`http://localhost/api/portal/leaderboard?period=${period}`);
}

function sale(saleDate: string, salesRepId = 'u1') {
  return { saleDate: new Date(saleDate), salesRepId, salesRepName: 'Rep', totalPoints: 10, status: 'approved' };
}

async function response(period: string) {
  return (await GET(request(period))).json();
}

beforeEach(() => {
  vi.useFakeTimers();
  state.docs = [];
  state.users = [];
  state.orders = [];
});

afterEach(() => vi.useRealTimers());

describe('GET /api/portal/leaderboard Chicago periods', () => {
  it('puts Saturday 11pm and Sunday 1am Chicago in different weeks, including the boundary sale', async () => {
    state.docs = [sale('2026-09-13T03:59:00.000Z')];

    vi.setSystemTime(new Date('2026-09-13T04:00:00.000Z'));
    const saturday = await response('week');
    state.docs.push(
      sale('2026-09-13T04:59:59.999Z'), // Saturday 11:59:59pm CDT, excluded
      sale('2026-09-13T05:00:00.000Z'), // Sunday midnight CDT, inclusive
    );
    vi.setSystemTime(new Date('2026-09-13T06:00:00.000Z'));
    const sunday = await response('week');

    expect(saturday.startDate).toBe('2026-09-06T05:00:00.000Z');
    expect(sunday.startDate).toBe('2026-09-13T05:00:00.000Z');
    expect(saturday.currentUser).toMatchObject({ totalSales: 1, totalPoints: 10 });
    expect(sunday.currentUser).toMatchObject({ totalSales: 1, totalPoints: 10 });
  });

  it('keeps Saturday 23:30 UTC in the Chicago week that began the prior Sunday', async () => {
    vi.setSystemTime(new Date('2026-09-12T23:30:00.000Z'));
    const json = await response('week');

    expect(json.startDate).toBe('2026-09-06T05:00:00.000Z');
  });

  it('uses Chicago midnight for month and year across a UTC rollover', async () => {
    state.docs = [
      sale('2026-12-31T23:59:59.999Z'),
    ];
    vi.setSystemTime(new Date('2027-01-01T00:30:00.000Z')); // Dec 31, 6:30pm CST

    const beforeMonth = await response('month');
    const beforeYear = await response('year');

    expect(beforeMonth.startDate).toBe('2026-12-01T06:00:00.000Z');
    expect(beforeYear.startDate).toBe('2026-01-01T06:00:00.000Z');
    expect(beforeMonth.currentUser).toMatchObject({ totalSales: 1, totalPoints: 10 });
    expect(beforeYear.currentUser).toMatchObject({ totalSales: 1, totalPoints: 10 });
    state.docs.push(
      sale('2027-01-01T05:59:59.999Z'),
      sale('2027-01-01T06:00:00.000Z'),
    );
    vi.setSystemTime(new Date('2027-01-01T06:00:00.000Z'));
    const atMonth = await response('month');
    const atYear = await response('year');

    expect(atMonth.startDate).toBe('2027-01-01T06:00:00.000Z');
    expect(atYear.startDate).toBe('2027-01-01T06:00:00.000Z');
    expect(atMonth.currentUser).toMatchObject({ totalSales: 1, totalPoints: 10 });
    expect(atYear.currentUser).toMatchObject({ totalSales: 1, totalPoints: 10 });
  });

  it('keeps all-time at epoch and unknown periods on the month fallback', async () => {
    vi.setSystemTime(new Date('2026-09-10T17:00:00.000Z'));

    expect((await response('all')).startDate).toBe('1970-01-01T00:00:00.000Z');
    expect((await response('unexpected')).startDate).toBe('2026-09-01T05:00:00.000Z');
  });
});

describe('GET /api/portal/leaderboard ?include=team', () => {
  beforeEach(() => vi.setSystemTime(new Date('2026-09-16T17:00:00.000Z')));

  it('leaves the extras off unless asked for', async () => {
    const json = await response('week');
    expect(json).not.toHaveProperty('unranked');
    expect(json).not.toHaveProperty('recent');
  });

  it('lists active field reps at 0 by name, without the ranked, pending or back-office', async () => {
    state.docs = [{ ...sale('2026-09-15T17:00:00.000Z', 'u1'), status: 'approved' }];
    state.users = [
      { id: 'u1', data: { status: 'active', role: 'rep', fieldRole: 'entry_rep', displayName: 'Ranked Rep' } },
      { id: 'u2', data: { status: 'active', role: 'rep', fieldRole: 'entry_rep', displayName: 'Zed Zero' } },
      { id: 'u3', data: { status: 'active', role: 'rep', fieldRole: 'entry_rep', displayName: 'Amy Zero' } },
      { id: 'u4', data: { status: 'pending', role: 'rep', fieldRole: 'entry_rep', displayName: 'Pending Hire' } },
      { id: 'u5', data: { status: 'active', role: 'operations', displayName: 'Back Office' } },
      { id: 'u6', data: { status: 'active', role: 'rep', fieldRole: 'entry_rep', email: 'noname@x.com' } },
    ];
    const json = await (await GET(new NextRequest('http://localhost/api/portal/leaderboard?period=week&limit=100&include=team'))).json();

    expect(json.unranked).toEqual([
      { salesRepId: 'u3', salesRepName: 'Amy Zero' },
      { salesRepId: 'u2', salesRepName: 'Zed Zero' },
    ]);
  });

  it('returns the 5 newest standing sales as name, plan and time only', async () => {
    const at = (min: number) => new Date(Date.UTC(2026, 8, 16, 16, 59 - min));
    const base = {
      salesRepName: 'Rep Name',
      customerName: 'Private Person',
      customerAddress: '1 Hidden St',
      estimatedCommission: 500,
      products: [{ productName: 'TFiber 1 Gig', company: 'tfiber' }],
    };
    state.docs = [
      { ...base, status: 'cancelled', createdAt: at(0), saleDate: at(0) },
      ...[1, 2, 3, 4, 5, 6].map((m) => ({ ...base, status: m === 2 ? 'rejected' : 'approved', createdAt: at(m), saleDate: at(m) })),
      { ...base, status: 'pending', createdAt: at(7), saleDate: at(7) },
    ];
    const json = await (await GET(new NextRequest('http://localhost/api/portal/leaderboard?period=week&include=team'))).json();

    expect(json.recent).toHaveLength(5);
    expect(json.recent[0]).toEqual({ repName: 'Rep Name', plan: expect.any(String), at: at(1).toISOString() });
    for (const row of json.recent) expect(Object.keys(row).sort()).toEqual(['at', 'plan', 'repName']);
    expect(JSON.stringify(json.recent)).not.toMatch(/Private|Hidden|500/);
  });
});

describe('GET /api/portal/leaderboard reads the carrier report', () => {
  beforeEach(() => vi.setSystemTime(new Date('2026-09-16T17:00:00.000Z')));

  const at = new Date('2026-09-15T17:00:00.000Z');
  const doc = (address: string, productId: string, totalPoints: number, extra: Record<string, unknown> = {}) => ({
    status: 'approved',
    salesRepId: 'u1',
    salesRepName: 'Braeden Carter',
    customerName: 'Private Person',
    customerAddress: address,
    saleDate: at,
    createdAt: at,
    installDate: at,
    totalPoints,
    estimatedCommission: 500,
    products: [{ productId, productName: productId, company: 'tfiber', quantity: 1 }],
    ...extra,
  });
  const carrier = (address: string, status: string, extra: Record<string, unknown> = {}) => ({
    id: `o-${address}`,
    status,
    address,
    matchedUserId: 'u1',
    orderDate: '2026-09-15',
    activationDate: null,
    deactivationDate: null,
    cancellationDate: null,
    estInstallDate: null,
    ...extra,
  });

  it('drops a carrier-cancelled sale from the board and the feed, and adds the plan mix (counts only)', async () => {
    state.docs = [
      doc('1 Oak St', 'tfiber-1gig', 8),
      doc('2 Oak St', 'tfiber-2gig', 10),
      doc('3 Oak St', 'tfiber-1gig', 8),
      doc('4 Oak St', 'tfiber-300', 3),
    ];
    state.orders = [
      carrier('1 Oak St', 'active', { activationDate: '2026-09-15' }),
      carrier('2 Oak St', 'active', { activationDate: '2026-09-15' }),
      carrier('3 Oak St', 'cancelled', { cancellationDate: '2026-09-15' }),
      // Disconnected the next day: within 120 days, so the points come off.
      carrier('4 Oak St', 'churned', { activationDate: '2026-09-15', deactivationDate: '2026-09-16' }),
    ];
    const json = await (
      await GET(new NextRequest('http://localhost/api/portal/leaderboard?period=week&include=team'))
    ).json();

    expect(json.leaderboard).toHaveLength(1);
    expect(json.leaderboard[0]).toMatchObject({
      salesRepId: 'u1',
      totalSales: 2,
      totalPoints: 18,
      planMix: [
        { tier: '2 Gig', count: 1 },
        { tier: '1 Gig', count: 1 },
      ],
    });
    expect(json.recent).toHaveLength(2);
    expect(JSON.stringify(json)).not.toMatch(/Private|Oak|500|commission/i);
  });

  it('keeps the board standing on the portal counts when the report read fails', async () => {
    const { getAllFiberOrders } = await import('@/lib/fiberReport/ordersCache');
    (getAllFiberOrders as unknown as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('down'));
    state.docs = [doc('1 Oak St', 'tfiber-1gig', 8)];
    const json = await response('week');
    expect(json.leaderboard[0]).toMatchObject({ totalSales: 1, totalPoints: 8 });
  });
});

describe('GET /api/portal/leaderboard — owner viewing as a rep', () => {
  it('makes the rep "you", and the rows still carry no dollars for anyone', async () => {
    vi.setSystemTime(new Date('2026-09-16T17:00:00.000Z'));
    vi.mocked(requireVerifiedRequester).mockResolvedValueOnce({
      ok: true, uid: 'owner-1', name: 'Owner', email: '', isManagement: true, isAdmin: true,
      isManagerOrAbove: true, isOwner: true, demoAccount: false,
    });
    state.docs = [
      { ...sale('2026-09-15T17:00:00.000Z', 'rep-noah'), salesRepName: 'Noah Smith', totalValue: 900 },
      { ...sale('2026-09-15T18:00:00.000Z', 'rep-other'), salesRepName: 'Other Rep', totalValue: 500 },
      { ...sale('2026-09-15T19:00:00.000Z', 'rep-other'), salesRepName: 'Other Rep', totalValue: 500 },
    ];

    const json = await (
      await GET(new NextRequest('http://localhost/api/portal/leaderboard?period=week&limit=100', { headers: viewAsHeaders() }))
    ).json();

    expect(json.currentUser).toMatchObject({ salesRepId: 'rep-noah', rank: 2 });
    const money = /value|pay|commission|revenue|margin|amount/i;
    for (const row of json.leaderboard as Array<Record<string, unknown>>) {
      expect(Object.keys(row).filter((key) => money.test(key))).toEqual([]);
    }
  });

  it('refuses a non-owner sending the header', async () => {
    const res = await GET(new NextRequest('http://localhost/api/portal/leaderboard?period=week', { headers: viewAsHeaders() }));
    expect(res.status).toBe(403);
  });
});

describe('GET /api/portal/leaderboard — demo account sales', () => {
  beforeEach(() => vi.setSystemTime(new Date('2026-09-16T17:00:00.000Z')));

  const demoSale = (minutesAgo: number) => ({
    ...sale(new Date(Date.UTC(2026, 8, 16, 16, 59 - minutesAgo)).toISOString(), 'demo'),
    salesRepName: 'App Review',
    createdAt: new Date(Date.UTC(2026, 8, 16, 16, 59 - minutesAgo)),
    products: [{ productName: 'TFiber 1 Gig', company: 'tfiber' }],
    demoAccount: true,
  });
  const realSale = {
    ...sale('2026-09-15T17:00:00.000Z', 'u2'),
    salesRepName: 'Real Rep',
    createdAt: new Date('2026-09-15T17:00:00.000Z'),
    products: [{ productName: 'TFiber 1 Gig', company: 'tfiber' }],
  };

  it('keeps a demo sale off the board, the weekly challenge and the recent feed for everyone else', async () => {
    state.docs = [demoSale(0), demoSale(1), realSale];
    const ranked = await (await GET(new NextRequest('http://localhost/api/portal/leaderboard?period=week&limit=100&include=team'))).json();
    const submitted = await (await GET(new NextRequest('http://localhost/api/portal/leaderboard?period=week&scope=submitted'))).json();

    expect(ranked.leaderboard.map((row: { salesRepId: string }) => row.salesRepId)).toEqual(['u2']);
    expect(ranked.totalRanked).toBe(1);
    expect(ranked.recent.map((row: { repName: string }) => row.repName)).toEqual(['Real Rep']);
    expect(submitted.leaderboard.map((row: { salesRepId: string }) => row.salesRepId)).toEqual(['u2']);
    expect(JSON.stringify([ranked, submitted])).not.toMatch(/App Review|"demo"/);
  });

  it('still shows the demo account its own sales', async () => {
    vi.mocked(requireVerifiedRequester).mockResolvedValueOnce({ ok: true, uid: 'demo', isManagement: false } as never);
    state.docs = [demoSale(0), realSale];
    const json = await response('week');

    expect(json.currentUser).toMatchObject({ salesRepId: 'demo', totalSales: 1 });
  });
});

describe('GET /api/portal/leaderboard for a demo account (App Review)', () => {
  beforeEach(() => vi.setSystemTime(new Date('2026-09-16T17:00:00.000Z')));

  const at = (min: number) => new Date(Date.UTC(2026, 8, 16, 16, 59 - min));
  const seedBoard = () => {
    const row = (salesRepId: string, salesRepName: string, totalPoints: number, min: number, extra: Record<string, unknown> = {}) => ({
      salesRepId, salesRepName, totalPoints, status: 'approved', saleDate: at(min), createdAt: at(min),
      photoURL: `https://img/${salesRepId}.png`,
      products: [{ productName: 'TFiber 1 Gig', company: 'tfiber' }],
      ...extra,
    });
    state.docs = [
      row('u2', 'Alice Real', 30, 1),
      row('u3', 'Bob Real', 20, 2),
      row('demo1', 'Sam Demo', 10, 3, { demoAccount: true }),
    ];
    state.users = [
      { id: 'u4', data: { status: 'active', role: 'rep', fieldRole: 'entry_rep', displayName: 'Carol Zero' } },
    ];
  };
  const caller = (uid: string, demoAccount: boolean) => ({
    ok: true as const, uid, name: 'x', email: '', isManagement: false, isAdmin: false,
    isManagerOrAbove: false, isOwner: false, demoAccount,
  });
  const fetchBoard = async () =>
    (await GET(new NextRequest('http://localhost/api/portal/leaderboard?period=week&limit=100&include=team'))).json();

  it('replaces every other rep with Rep N and an opaque id, and keeps its own row', async () => {
    seedBoard();
    vi.mocked(requireVerifiedRequester).mockResolvedValueOnce(caller('demo1', true));
    const json = await fetchBoard();

    expect(json.leaderboard.map((r: { salesRepName: string }) => r.salesRepName)).toEqual(['Rep 1', 'Rep 2', 'Sam Demo']);
    expect(json.leaderboard[0].salesRepId).toMatch(/^anon-[0-9a-f]+-1$/);
    expect(json.leaderboard[1].salesRepId).toMatch(/^anon-[0-9a-f]+-2$/);
    expect(json.leaderboard[2].salesRepId).toBe('demo1');
    // Counts stay.
    expect(json.leaderboard[0]).toMatchObject({ totalSales: 1, totalPoints: 30 });
    expect(json.currentUser).toMatchObject({ salesRepId: 'demo1', salesRepName: 'Sam Demo', rank: 3 });
    expect(json.unranked).toEqual([{ salesRepId: expect.stringMatching(/^anon-/), salesRepName: 'Rep 3' }]);
    expect(json.recent.map((r: { repName: string }) => r.repName)).toEqual(['Rep 1', 'Rep 2', 'Sam Demo']);
    expect(JSON.stringify(json)).not.toMatch(/Alice|Bob|Carol|"u2"|"u3"|"u4"|img\/u/);
  });

  it('gives fresh ids on every response', async () => {
    seedBoard();
    vi.mocked(requireVerifiedRequester).mockResolvedValueOnce(caller('demo1', true));
    const first = await fetchBoard();
    vi.mocked(requireVerifiedRequester).mockResolvedValueOnce(caller('demo1', true));
    const second = await fetchBoard();
    expect(first.leaderboard[0].salesRepId).not.toBe(second.leaderboard[0].salesRepId);
  });

  it('leaves a normal rep\'s board exactly as it was', async () => {
    seedBoard();
    vi.mocked(requireVerifiedRequester).mockResolvedValueOnce(caller('u2', false));
    const json = await fetchBoard();

    // Sam Demo's stamped sale stays off a real rep's board.
    expect(json.leaderboard.map((r: { salesRepId: string; salesRepName: string }) => [r.salesRepId, r.salesRepName])).toEqual([
      ['u2', 'Alice Real'],
      ['u3', 'Bob Real'],
    ]);
    expect(json.unranked).toEqual([{ salesRepId: 'u4', salesRepName: 'Carol Zero' }]);
    expect(json.recent.map((r: { repName: string }) => r.repName)).toEqual(['Alice Real', 'Bob Real']);
  });
});
