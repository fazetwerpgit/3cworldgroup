import { describe, expect, it } from 'vitest';
import { loggedSaleHref, monthFromParam } from './loggedSale';

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
