import { describe, expect, it } from 'vitest';
import type { FiberOrder, Sale } from '@/types';
import { relativeSaleTime, tapeRepName } from './companyTape';
import { summarizeCompanySales } from './companyTapeStats';

// Sep 2026 in Chicago (CDT).
const SEPTEMBER = { start: new Date('2026-09-01T05:00:00Z'), end: new Date('2026-10-01T05:00:00Z') };
const NONE = new Map<string, FiberOrder>();

let n = 0;
function sale(rep: string, iso: string, extra: Partial<Sale> = {}): Sale {
  n += 1;
  return {
    id: `t${n}`,
    salesRepId: rep,
    salesRepName: `Rep ${rep}`,
    status: 'approved',
    saleDate: new Date(iso),
    totalValue: 100,
    totalPoints: 3,
    ...extra,
  } as unknown as Sale;
}

describe('summarizeCompanySales', () => {
  it('returns nulls for no sales', () => {
    expect(summarizeCompanySales([], NONE, SEPTEMBER)).toEqual({
      mtdCount: 0,
      mtdMonthlyValue: 0,
      lastSale: null,
      topRep: null,
    });
  });

  it('counts this month only for the total and the top rep, but last sale is all time', () => {
    const stats = summarizeCompanySales(
      [
        sale('a', '2026-09-02T15:00:00Z'),
        sale('b', '2026-09-03T15:00:00Z'),
        sale('b', '2026-09-04T15:00:00Z'),
        // Aug 31 in Chicago (before the month starts), even though it's Sep 1 in UTC.
        sale('a', '2026-09-01T03:00:00Z'),
        sale('a', '2026-08-20T15:00:00Z'),
      ],
      NONE,
      SEPTEMBER
    );
    expect(stats.mtdCount).toBe(3);
    expect(stats.mtdMonthlyValue).toBe(300);
    expect(stats.topRep).toEqual({ repName: 'Rep b', count: 2 });
    // No logged time on these, so no time of day to show.
    expect(stats.lastSale).toEqual({ repName: 'Rep b' });
  });

  it('times the last sale by when it was logged, never by the noon sale date', () => {
    const noonSep4 = '2026-09-04T17:00:00Z';
    const stats = summarizeCompanySales(
      [
        sale('a', noonSep4, { createdAt: new Date('2026-09-04T14:10:00Z') }),
        sale('b', noonSep4, { createdAt: new Date('2026-09-04T21:48:00Z') }),
        sale('c', noonSep4, { createdAt: new Date('2026-09-04T16:02:00Z') }),
      ],
      NONE,
      SEPTEMBER
    );
    // Same sale day: the one logged last is the last sale, at its logged time.
    expect(stats.lastSale).toEqual({ repName: 'Rep b', at: '2026-09-04T21:48:00.000Z' });
  });

  it('shows no time for a sale logged on a later day than it happened', () => {
    const stats = summarizeCompanySales(
      [sale('a', '2026-09-04T17:00:00Z', { createdAt: new Date('2026-09-06T15:00:00Z') })],
      NONE,
      SEPTEMBER
    );
    expect(stats.lastSale).toEqual({ repName: 'Rep a' });
  });

  it('the top rep is the leaderboard\'s #1: most points, then the name A to Z', () => {
    const sales = [
      sale('a', '2026-09-02T15:00:00Z'),
      sale('a', '2026-09-10T15:00:00Z'),
      sale('b', '2026-09-03T15:00:00Z'),
      sale('b', '2026-09-05T15:00:00Z'),
    ];
    expect(summarizeCompanySales(sales, NONE, SEPTEMBER).topRep).toEqual({ repName: 'Rep a', count: 2 });
    expect(summarizeCompanySales([...sales].reverse(), NONE, SEPTEMBER).topRep).toEqual({ repName: 'Rep a', count: 2 });
    // Points decide, not the count: one 10-point sale outranks two 3s.
    const big = [...sales, sale('c', '2026-09-06T15:00:00Z', { totalPoints: 10 })];
    expect(summarizeCompanySales(big, NONE, SEPTEMBER).topRep).toEqual({ repName: 'Rep c', count: 1 });
  });

  it('leaves out carrier cancellations and 120-day chargebacks, like the Board', () => {
    const keep = sale('a', '2026-09-05T15:00:00Z');
    const cancelled = sale('a', '2026-09-06T15:00:00Z');
    const churned = sale('a', '2026-09-02T15:00:00Z', { installDate: new Date('2026-09-03T12:00:00Z') });
    const fiber = new Map<string, FiberOrder>([
      [cancelled.id!, { id: 'o1', status: 'cancelled', cancellationDate: '2026-09-08' } as unknown as FiberOrder],
      [churned.id!, { id: 'o2', status: 'churned', activationDate: '2026-09-03', deactivationDate: '2026-09-15' } as unknown as FiberOrder],
    ]);
    const stats = summarizeCompanySales([keep, cancelled, churned], fiber, SEPTEMBER);
    expect([stats.mtdCount, stats.topRep?.count, stats.mtdMonthlyValue]).toEqual([1, 1, 100]);
  });
});

describe('tapeRepName', () => {
  it('keeps short names and shortens long ones to first name + last initial', () => {
    expect(tapeRepName('Cole Hart')).toBe('Cole Hart');
    expect(tapeRepName('Braeden Crouse')).toBe('Braeden C.');
    expect(tapeRepName('  Mary  Ann   de la cruz ')).toBe('Mary C.');
    expect(tapeRepName('Bartholomewson')).toBe('Bartholomewson');
  });
});

describe('relativeSaleTime', () => {
  const now = Date.parse('2026-09-22T18:00:00Z'); // Tuesday

  it('reads minutes and hours as they pass', () => {
    expect(relativeSaleTime(now - 20_000, now)).toBe('just now');
    expect(relativeSaleTime(now + 5_000, now)).toBe('just now');
    expect(relativeSaleTime(now - 12 * 60_000, now)).toBe('12m ago');
    expect(relativeSaleTime(now - 3 * 3_600_000 - 59 * 60_000, now)).toBe('3h ago');
  });

  it('switches to the weekday after a day, then to the date', () => {
    expect(relativeSaleTime(Date.parse('2026-09-20T18:00:00Z'), now, 'America/Chicago')).toBe('Sun');
    expect(relativeSaleTime(Date.parse('2026-09-03T18:00:00Z'), now, 'America/Chicago')).toBe('Sep 3');
  });

  it("reads the weekday and date in Chicago, not the device's zone", () => {
    const tz = process.env.TZ;
    process.env.TZ = 'America/New_York';
    try {
      // Tue Oct 13 2026, 11:30pm CDT = Wed 12:30am EDT.
      const at = Date.parse('2026-10-14T04:30:00Z');
      expect(relativeSaleTime(at, at + 2 * 86_400_000)).toBe('Tue');
      // Sep 30 11:30pm CDT = Oct 1 on an Eastern phone.
      const late = Date.parse('2026-10-01T04:30:00Z');
      expect(relativeSaleTime(late, late + 10 * 86_400_000)).toBe('Sep 30');
    } finally {
      if (tz === undefined) delete process.env.TZ;
      else process.env.TZ = tz;
    }
  });
});
