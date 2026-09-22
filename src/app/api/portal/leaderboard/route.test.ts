import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';

const state: { docs: Array<Record<string, unknown>> } = { docs: [] };

vi.mock('@/lib/auth/requireVerifiedAdmin', () => ({
  requireVerifiedRequester: vi.fn(async () => ({ ok: true, uid: 'u1', isManagement: true })),
}));

vi.mock('@/lib/firebase/admin', () => ({
  adminDb: {
    collection: vi.fn(() => ({
      where: vi.fn(() => ({
        limit: vi.fn(() => ({
          get: vi.fn(async () => ({
            forEach: (fn: (doc: { data: () => Record<string, unknown> }) => void) => {
              state.docs.forEach((data) => fn({ data: () => data }));
            },
          })),
        })),
      })),
    })),
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
