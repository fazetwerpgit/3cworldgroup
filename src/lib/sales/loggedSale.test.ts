import { describe, expect, it } from 'vitest';
import { loggedSaleHref, monthFromParam, monthParam, salesPageSearch } from './loggedSale';

describe('loggedSaleHref', () => {
  it("opens Sales on the sale's month with its id", () => {
    expect(loggedSaleHref('abc123', '2026-08-30')).toBe('/portal/sales?logged=abc123&month=2026-08');
  });

  it('leaves the month off when the date is not a form date', () => {
    expect(loggedSaleHref('abc123', '')).toBe('/portal/sales?logged=abc123');
  });
});

describe('monthFromParam', () => {
  const now = new Date(2026, 8, 22, 12);

  it('reads YYYY-MM', () => {
    expect(monthFromParam('2026-08', now)).toEqual({ year: 2026, month: 7 });
    expect(monthFromParam('2026-09', now)).toEqual({ year: 2026, month: 8 });
  });

  it('refuses a future, malformed or missing month', () => {
    expect(monthFromParam('2026-10', now)).toBeNull();
    expect(monthFromParam('2026-13', now)).toBeNull();
    expect(monthFromParam('2026-8', now)).toBeNull();
    expect(monthFromParam(null, now)).toBeNull();
  });
});

describe('monthFromParam with a max', () => {
  const now = new Date(2026, 8, 22, 12);

  it('lets the pay list reopen on next month, never further', () => {
    const max = { year: 2026, month: 9 };
    expect(monthFromParam('2026-10', now, max)).toEqual({ year: 2026, month: 9 });
    expect(monthFromParam('2026-11', now, max)).toBeNull();
  });
});

describe('salesPageSearch', () => {
  const now = new Date(2026, 8, 22, 12);

  it('puts a past month and the pay view in the URL, and reads back the same month', () => {
    const search = salesPageSearch('', { month: { year: 2026, month: 6 }, payView: true }, now);
    expect(search).toBe('?month=2026-07&view=pay');
    const params = new URLSearchParams(search);
    expect(monthFromParam(params.get('month'), now)).toEqual({ year: 2026, month: 6 });
    expect(params.get('view')).toBe('pay');
  });

  it('leaves this month and the ledger view off the URL', () => {
    expect(salesPageSearch('?month=2026-07&view=pay', { month: { year: 2026, month: 8 }, payView: false }, now)).toBe('');
  });

  it("drops the consumed 'logged' id but keeps the sale's month and other params", () => {
    expect(
      salesPageSearch('?logged=abc&month=2026-08&x=1', { month: { year: 2026, month: 7 }, payView: false }, now)
    ).toBe('?month=2026-08&x=1');
  });

  it('formats YYYY-MM', () => {
    expect(monthParam({ year: 2026, month: 0 })).toBe('2026-01');
    expect(monthParam({ year: 2026, month: 11 })).toBe('2026-12');
  });
});
