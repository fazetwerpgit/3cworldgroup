import type { CompPlanCompanyRates, FiberOrder, Sale } from '@/types';
import { expectedPayForSale } from '@/lib/pay/expectedPay';
import { formatPayoutWindow, payoutWindowForSale, type PayoutWindow } from '@/lib/pay/payoutWindow';
import { countedSales } from '@/lib/sales/installBucket';
import { isInMonth, type MonthKey } from '@/lib/sales/monthWindow';

// Owner, 2026-09-22: pay is estimated off the INSTALL date, scheduled or
// completed — never the day a sale was sold. A sale with no install date yet
// has no month and no window; it is shown as exactly that. Nothing here is a
// guarantee: every figure is an estimate and every window a range. Pure, so the
// dashboard, the Sales page and the tests agree.

type FiberMap = Map<string, FiberOrder>;

function installTime(sale: Pick<Sale, 'installDate'>): number {
  if (!sale.installDate) return Number.NaN;
  return new Date(sale.installDate as Date | string).getTime();
}

/** True when the sale carries a real install date (scheduled or completed). */
export function hasInstallDate(sale: Pick<Sale, 'installDate'>): boolean {
  return !Number.isNaN(installTime(sale));
}

/**
 * The carrier reports the install broke at the door (breakage): the customer
 * missed, rescheduled or cancelled, so the date on the sale is stale. The sale
 * still counts, but its money waits on a new install date like an undated one.
 */
export function isMissedInstall(sale: Pick<Sale, 'id' | 'installDate'>, fiberBySale: FiberMap): boolean {
  return hasInstallDate(sale) && fiberBySale.get(sale.id || '')?.status === 'breakage';
}

/**
 * Counted sales (not cancelled by us or the carrier) with an install date that
 * still stands. A missed install is left out: its date is stale, so it has no
 * month and no payout window until it is rescheduled.
 */
export function datedSales<T extends Sale>(sales: T[], fiberBySale: FiberMap): T[] {
  return countedSales(sales, fiberBySale).filter(
    (sale) => hasInstallDate(sale) && !isMissedInstall(sale, fiberBySale)
  );
}

/** Counted sales whose install the carrier reports as missed (see isMissedInstall). */
export function missedInstallSales<T extends Sale>(sales: T[], fiberBySale: FiberMap): T[] {
  return countedSales(sales, fiberBySale).filter((sale) => isMissedInstall(sale, fiberBySale));
}

/** Counted sales with no install date on the calendar yet. */
export function undatedSales<T extends Sale>(sales: T[], fiberBySale: FiberMap): T[] {
  return countedSales(sales, fiberBySale).filter((sale) => !hasInstallDate(sale));
}

/** Σ expected pay, or null when the rep has no pay plan (never a confident $0). */
export function sumExpectedPay(sales: Array<Pick<Sale, 'products'>>, rates: CompPlanCompanyRates | null): number | null {
  if (!rates) return null;
  return sales.reduce((sum, sale) => sum + (expectedPayForSale(sale, rates) ?? 0), 0);
}

export type PayGroupKind = 'window' | 'other' | 'missed' | 'undated';

export interface PayGroup<T extends Sale = Sale> {
  kind: PayGroupKind;
  key: string;
  /** "Sep 21–25", "Other carriers · Sep", "Missed install", "No install date". */
  label: string;
  /** The T-Fiber payout window ('window' groups only). */
  window: PayoutWindow | null;
  /** The install month ('other' groups only). */
  month: MonthKey | null;
  sales: T[];
  /** Σ est. pay; null = no pay plan. */
  amount: number | null;
}

const SHORT_MONTH = new Intl.DateTimeFormat('en-US', { month: 'short' });

const newestInstallFirst = (a: Sale, b: Sale) => installTime(b) - installTime(a);

export interface GroupPayOptions {
  /** Only installs in this (local) month. Omitted, every install is grouped. */
  month?: MonthKey;
  /** Add the "Missed install" and "No install date" groups. They are live state, not a month's history. */
  includeUndated?: boolean;
}

/**
 * The rep's Pay view, grouped:
 *
 *   1. one group per T-Fiber payout window, newest window first — scheduled
 *      and completed installs alike, by the sale's current install date
 *   2. "Other carriers" by install month, newest first — no published schedule,
 *      so no window
 *   3. "Missed install": the carrier says the install broke; no window until
 *      it is rescheduled
 *   4. "No install date": counted sales with nothing on the calendar yet
 *
 * Every figure is an estimate and every window is a range; nothing here ever
 * produces a single pay date.
 */
export function groupPaySales<T extends Sale>(
  sales: T[],
  fiberBySale: FiberMap,
  rates: CompPlanCompanyRates | null,
  { month, includeUndated = false }: GroupPayOptions = {}
): PayGroup<T>[] {
  const dated = datedSales(sales, fiberBySale).filter(
    (sale) => !month || isInMonth(sale.installDate as Date | string | undefined, month)
  );

  const windows = new Map<number, PayGroup<T>>();
  const others = new Map<string, PayGroup<T>>();

  for (const sale of dated) {
    const window = payoutWindowForSale(sale, true);
    if (window) {
      const key = window.start.getTime();
      let group = windows.get(key);
      if (!group) {
        group = { kind: 'window', key: `window-${key}`, label: formatPayoutWindow(window), window, month: null, sales: [], amount: null };
        windows.set(key, group);
      }
      group.sales.push(sale);
      continue;
    }
    const installedOn = new Date(sale.installDate as Date | string);
    const installMonth: MonthKey = { year: installedOn.getFullYear(), month: installedOn.getMonth() };
    const key = `other-${installMonth.year}-${installMonth.month}`;
    let group = others.get(key);
    if (!group) {
      group = {
        kind: 'other',
        key,
        label: `Other carriers · ${SHORT_MONTH.format(installedOn)}`,
        window: null,
        month: installMonth,
        sales: [],
        amount: null,
      };
      others.set(key, group);
    }
    group.sales.push(sale);
  }

  const groups: PayGroup<T>[] = [
    ...[...windows.values()].sort((a, b) => b.window!.start.getTime() - a.window!.start.getTime()),
    ...[...others.values()].sort(
      (a, b) => b.month!.year - a.month!.year || b.month!.month - a.month!.month
    ),
  ];
  for (const group of groups) group.sales.sort(newestInstallFirst);

  if (includeUndated) {
    const missed = missedInstallSales(sales, fiberBySale);
    if (missed.length) {
      groups.push({ kind: 'missed', key: 'missed', label: 'Missed install', window: null, month: null, sales: missed, amount: null });
    }
    const undated = undatedSales(sales, fiberBySale);
    if (undated.length) {
      groups.push({ kind: 'undated', key: 'undated', label: 'No install date', window: null, month: null, sales: undated, amount: null });
    }
  }

  for (const group of groups) group.amount = sumExpectedPay(group.sales, rates);
  return groups;
}
