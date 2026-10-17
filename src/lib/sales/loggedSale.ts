import { compareMonths, currentMonth, isCurrentMonth, type MonthKey } from '@/lib/sales/monthWindow';

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

/**
 * The `month` param as a MonthKey; null when absent, malformed or past `max`
 * (this month by default; the pay list may look one month ahead).
 */
export function monthFromParam(
  value: string | null,
  now: Date = new Date(),
  max: MonthKey = currentMonth(now)
): MonthKey | null {
  const match = /^(\d{4})-(\d{2})$/.exec(value ?? '');
  if (!match) return null;
  const key: MonthKey = { year: Number(match[1]), month: Number(match[2]) - 1 };
  if (key.month < 0 || key.month > 11) return null;
  return compareMonths(key, max) > 0 ? null : key;
}

/** `YYYY-MM`, as the `month` param carries it. */
export function monthParam({ year, month }: MonthKey): string {
  return `${year}-${String(month + 1).padStart(2, '0')}`;
}

/**
 * The Sales page's query string for what it shows, so Back (and a reload)
 * reopens the same month and view: `month` (left off for this month), `view=pay`
 * on the pay list, and `logged` dropped once its banner has been shown. Other
 * params are kept. '' when nothing is left, else '?…'.
 */
export function salesPageSearch(
  search: string,
  { month, payView }: { month: MonthKey; payView: boolean },
  now: Date = new Date()
): string {
  const params = new URLSearchParams(search);
  params.delete('logged');
  if (isCurrentMonth(month, now)) params.delete('month');
  else params.set('month', monthParam(month));
  if (payView) params.set('view', 'pay');
  else params.delete('view');
  const out = params.toString();
  return out ? `?${out}` : '';
}
