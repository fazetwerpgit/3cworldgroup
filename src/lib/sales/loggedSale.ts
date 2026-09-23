import { compareMonths, currentMonth, type MonthKey } from '@/lib/sales/monthWindow';

// After Log Sale, the Sales page opens on the month the sale was SOLD in (a
// backdated sale lands in an earlier month, where "this month" would not show
// it) and confirms it by name, so the rep never wonders whether it went in.

/** `/portal/sales?logged=<id>&month=YYYY-MM` for a sale sold on `saleDate` (YYYY-MM-DD). */
export function loggedSaleHref(saleId: string, saleDate: string): string {
  const params = new URLSearchParams({ logged: saleId });
  const month = /^(\d{4})-(\d{2})-\d{2}$/.exec(saleDate);
  if (month) params.set('month', `${month[1]}-${month[2]}`);
  return `/portal/sales?${params.toString()}`;
}

/** The `month` param as a MonthKey; null when absent, malformed or in the future. */
export function monthFromParam(value: string | null, now: Date = new Date()): MonthKey | null {
  const match = /^(\d{4})-(\d{2})$/.exec(value ?? '');
  if (!match) return null;
  const key: MonthKey = { year: Number(match[1]), month: Number(match[2]) - 1 };
  if (key.month < 0 || key.month > 11) return null;
  return compareMonths(key, currentMonth(now)) > 0 ? null : key;
}
