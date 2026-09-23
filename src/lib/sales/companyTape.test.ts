import { describe, expect, it } from 'vitest';
import { relativeSaleTime, summarizeCompanySales, tapeRepName, type TapeSale } from './companyTape';

const MONTH_START = Date.parse('2026-09-01T05:00:00Z'); // Sep 1, midnight Chicago

function sale(repKey: string, iso: string, extra: Partial<TapeSale> = {}): TapeSale {
  return { repKey, repName: `Rep ${repKey}`, effectiveMs: Date.parse(iso), monthlyValue: 100, ...extra };
}

describe('summarizeCompanySales', () => {
  it('returns nulls for no sales', () => {
    expect(summarizeCompanySales([], MONTH_START)).toEqual({
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
      MONTH_START
    );
    expect(stats.mtdCount).toBe(3);
    expect(stats.mtdMonthlyValue).toBe(300);
    expect(stats.topRep).toEqual({ repName: 'Rep b', count: 2 });
    expect(stats.lastSale).toEqual({ repName: 'Rep b', at: '2026-09-04T15:00:00.000Z' });
  });

  it('breaks a tie for the lead by who reached the count first', () => {
    const sales = [
      sale('a', '2026-09-02T15:00:00Z'),
      sale('a', '2026-09-10T15:00:00Z'),
      sale('b', '2026-09-03T15:00:00Z'),
      sale('b', '2026-09-05T15:00:00Z'),
    ];
    expect(summarizeCompanySales(sales, MONTH_START).topRep).toEqual({ repName: 'Rep b', count: 2 });
    // Order of the input doesn't matter.
    expect(summarizeCompanySales([...sales].reverse(), MONTH_START).topRep).toEqual({
      repName: 'Rep b',
      count: 2,
    });
  });

  it('falls back to the rep key when tied to the millisecond', () => {
    const sales = [sale('z', '2026-09-02T15:00:00Z'), sale('m', '2026-09-02T15:00:00Z')];
    expect(summarizeCompanySales(sales, MONTH_START).topRep?.repName).toBe('Rep m');
  });

  it('uses the name on the rep’s latest sale', () => {
    const stats = summarizeCompanySales(
      [
        sale('a', '2026-09-02T15:00:00Z', { repName: 'Old Name' }),
        sale('a', '2026-09-08T15:00:00Z', { repName: 'New Name' }),
      ],
      MONTH_START
    );
    expect(stats.topRep).toEqual({ repName: 'New Name', count: 2 });
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
});
