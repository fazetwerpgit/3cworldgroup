import { describe, it, expect } from 'vitest';
import type { Sale } from '@/types';
import {
  currentMonth,
  isCurrentMonth,
  isInMonth,
  monthBounds,
  monthLabel,
  salesInstalledIn,
  salesSoldIn,
  shiftMonth,
} from './monthWindow';

const SEP = { year: 2026, month: 8 };

function sale(saleDate: string, installDate?: string): Sale {
  return {
    id: saleDate + (installDate ?? ''),
    saleDate: new Date(saleDate),
    installDate: installDate ? new Date(installDate) : undefined,
  } as Sale;
}

describe('monthBounds', () => {
  it('covers the whole month, first to last day', () => {
    expect(monthBounds(SEP)).toEqual({ startDate: '2026-09-01', endDate: '2026-09-30' });
  });

  it('gets February right in a leap year', () => {
    expect(monthBounds({ year: 2028, month: 1 }).endDate).toBe('2028-02-29');
  });
});

describe('shiftMonth', () => {
  it('rolls backwards over a year boundary', () => {
    expect(shiftMonth({ year: 2026, month: 0 }, -1)).toEqual({ year: 2025, month: 11 });
  });

  it('rolls forwards over a year boundary', () => {
    expect(shiftMonth({ year: 2026, month: 11 }, 1)).toEqual({ year: 2027, month: 0 });
  });
});

describe('monthLabel and currentMonth', () => {
  it('names the month', () => {
    expect(monthLabel(SEP)).toBe('September 2026');
  });

  it('knows which month is now', () => {
    const now = new Date(2026, 8, 15);
    expect(currentMonth(now)).toEqual(SEP);
    expect(isCurrentMonth(SEP, now)).toBe(true);
    expect(isCurrentMonth({ year: 2026, month: 7 }, now)).toBe(false);
  });
});

describe('isInMonth', () => {
  it('treats a missing or unparseable date as in no month at all', () => {
    expect(isInMonth(undefined, SEP)).toBe(false);
    expect(isInMonth(null, SEP)).toBe(false);
    expect(isInMonth('not-a-date', SEP)).toBe(false);
  });

  it('does not leak the same month of a different year', () => {
    expect(isInMonth(new Date(2025, 8, 15), SEP)).toBe(false);
  });
});

describe('salesSoldIn vs salesInstalledIn', () => {
  // The case the two lists exist for: sold in August, installs in September.
  // The ledger should call it an August sale; the pay list should call it
  // September money, because pay is owed off the install.
  const straddler = sale('2026-08-28T12:00:00', '2026-09-20T12:00:00');
  const sales = [
    straddler,
    sale('2026-09-02T12:00:00', '2026-09-09T12:00:00'),
    sale('2026-09-05T12:00:00'),
  ];

  it('lists a straddling sale in the month it was sold', () => {
    expect(salesSoldIn(sales, SEP)).toHaveLength(2);
    expect(salesSoldIn(sales, { year: 2026, month: 7 })).toEqual([straddler]);
  });

  it('pays a straddling sale in the month it installed', () => {
    const paid = salesInstalledIn(sales, SEP);
    expect(paid).toHaveLength(2);
    expect(paid).toContain(straddler);
  });

  it('leaves a sale with no install date out of every pay month', () => {
    expect(salesInstalledIn(sales, SEP).some((s) => !s.installDate)).toBe(false);
  });
});
