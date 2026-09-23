import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';

const state: {
  docs: Array<Record<string, unknown>>;
  users: Array<{ id: string; data: Record<string, unknown> }>;
  recent: Array<Record<string, unknown>>;
} = { docs: [], users: [], recent: [] };

vi.mock('@/lib/auth/requireVerifiedAdmin', () => ({
  requireVerifiedRequester: vi.fn(async () => ({ ok: true, uid: 'u1', isManagement: true })),
}));

function snapshot(rows: Array<{ id: string; data: Record<string, unknown> }>) {
  return {
    forEach: (fn: (doc: { id: string; data: () => Record<string, unknown> }) => void) => {
      rows.forEach((row) => fn({ id: row.id, data: () => row.data }));
    },
  };
}

vi.mock('@/lib/firebase/admin', () => ({
  adminDb: {
    collection: vi.fn((name: string) =>
      name === 'users'
        ? { where: vi.fn(() => ({ get: vi.fn(async () => snapshot(state.users)) })) }
        : {
            where: vi.fn(() => ({
              limit: vi.fn(() => ({
                get: vi.fn(async () => snapshot(state.docs.map((data, i) => ({ id: `s${i}`, data })))),
              })),
            })),
            orderBy: vi.fn(() => ({
              limit: vi.fn(() => ({
                get: vi.fn(async () => snapshot(state.recent.map((data, i) => ({ id: `r${i}`, data })))),
              })),
            })),
          }
    ),
  },
}));

import { GET } from './route';

function request(period: string) {
  return new NextRequest(`http://localhost/api/portal/leaderboard?period=${period}`);
}

function sale(saleDate: string, salesRepId = 'u1') {
  return { saleDate: new Date(saleDate), salesRepId, salesRepName: 'Rep', totalPoints: 10 };
}

async function response(period: string) {
  return (await GET(request(period))).json();
}

beforeEach(() => {
  vi.useFakeTimers();
  state.docs = [];
  state.users = [];
  state.recent = [];
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
    state.recent = [
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
