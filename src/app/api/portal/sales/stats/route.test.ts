import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const db = vi.hoisted(() => {
  const sales: Array<Record<string, unknown>> = [];
  return {
    sales,
    adminDb: {
      collection: () => ({
        get: async () => ({ forEach: (fn: (doc: { data: () => Record<string, unknown> }) => void) => sales.forEach((s) => fn({ data: () => s })) }),
        where: () => ({
          get: async () => ({ forEach: (fn: (doc: { data: () => Record<string, unknown> }) => void) => sales.forEach((s) => fn({ data: () => s })) }),
        }),
      }),
    },
  };
});

vi.mock('@/lib/firebase/admin', () => ({ adminDb: db.adminDb }));
vi.mock('@/lib/auth/requireVerifiedAdmin', () => ({
  requireVerifiedRequester: vi.fn(async () => ({ ok: true, uid: 'rep-1', isAdmin: false })),
}));

import { GET } from './route';

function sale(saleDate: string, fields: Record<string, unknown> = {}) {
  db.sales.push({ saleDate: new Date(saleDate), status: 'approved', totalPoints: 10, totalValue: 70, ...fields });
}

async function stats(period: string) {
  const res = await GET(new NextRequest(`http://localhost/api/portal/sales/stats?salesRepId=rep-1&period=${period}`));
  return (await res.json()).stats;
}

beforeEach(() => {
  db.sales.length = 0;
  vi.useFakeTimers();
});
afterEach(() => vi.useRealTimers());

describe('GET /api/portal/sales/stats', () => {
  it('uses Chicago\'s month, not the server clock\'s: late on Sep 30 Chicago time is still September', async () => {
    // 22:30 on Sep 30 in Chicago is already Oct 1 in UTC.
    vi.setSystemTime(new Date('2026-10-01T03:30:00Z'));
    sale('2026-09-20T17:00:00Z');
    sale('2026-09-30T21:00:00Z'); // Sep 30 16:00 Chicago
    sale('2026-08-20T17:00:00Z'); // previous month

    const s = await stats('month');

    expect(s.totalSales).toBe(2);
    expect(s.approvedPoints).toBe(20);
    expect(s.salesChange).toBe(100);
  });

  it('puts a sale made just after Chicago midnight in the new month, not the old one', async () => {
    vi.setSystemTime(new Date('2026-10-15T17:00:00Z'));
    sale('2026-10-01T05:30:00Z'); // Oct 1 00:30 Chicago
    sale('2026-10-01T04:30:00Z'); // Sep 30 23:30 Chicago

    expect((await stats('month')).totalSales).toBe(1);
  });

  it('leaves cancelled sales out of every total and out of the period it compares against', async () => {
    vi.setSystemTime(new Date('2026-10-15T17:00:00Z'));
    sale('2026-10-10T17:00:00Z');
    sale('2026-10-11T17:00:00Z', { status: 'cancelled', totalValue: 999, totalPoints: 99 });
    sale('2026-09-10T17:00:00Z');
    sale('2026-09-11T17:00:00Z', { status: 'cancelled' });

    const s = await stats('month');

    expect(s.totalSales).toBe(1);
    expect(s.totalValue).toBe(70);
    expect(s.totalPoints).toBe(10);
    expect(s.approvedCount).toBe(1);
    expect(s.salesChange).toBe(0); // 1 this month vs 1 last month, cancelled ignored in both
  });

  it('does not count a future-dated sale in the current period', async () => {
    vi.setSystemTime(new Date('2026-10-15T17:00:00Z'));
    sale('2026-11-02T17:00:00Z');

    expect((await stats('month')).totalSales).toBe(0);
  });

  it('weeks start on Sunday in Chicago', async () => {
    vi.setSystemTime(new Date('2026-10-01T17:00:00Z')); // Thursday
    sale('2026-09-27T18:00:00Z'); // Sunday of that week
    sale('2026-09-26T18:00:00Z'); // Saturday before

    expect((await stats('week')).totalSales).toBe(1);
  });

  it('falls back to the month for an unknown period', async () => {
    vi.setSystemTime(new Date('2026-10-15T17:00:00Z'));
    sale('2026-10-02T17:00:00Z');

    expect((await stats('decade')).totalSales).toBe(1);
  });
});
