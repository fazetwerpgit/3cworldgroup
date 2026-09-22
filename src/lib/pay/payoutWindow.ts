import type { CompPlanCompanyRates, Sale } from '@/types';
import { expectedPayForSale } from '@/lib/pay/expectedPay';

// T-Fiber's payout schedule, as an ESTIMATE the rep can plan around.
//
// Jacob, 2026-09-22 (the T-Fiber pay schedule sheet): installs are paid by the
// install week, on windows that repeat every month —
//
//   installs 1st–7th         → paid 14th–18th of the same month
//   installs 8th–14th        → paid 21st–25th of the same month
//   installs 15th–21st       → paid 28th of the month through the 3rd of the next
//   installs 22nd–month end  → paid 7th–11th of the next month
//
// Money only lands when 3C receives funds from the carrier, so this is always a
// RANGE and always labelled an estimate. It never collapses to a single pay date
// (see the note at the bottom of expectedPay.ts). Other carriers have no
// published schedule, so they get no window at all.

/** FIBER_COMPANIES[].value for T-Fiber (T-Mobile). */
export const TFIBER_COMPANY = 'tfiber';

export interface PayoutWindow {
  /** First day of the payout window (local noon). */
  start: Date;
  /** Last day of the payout window (local noon). */
  end: Date;
  /** First and last install day this window pays for (local noon). */
  installFrom: Date;
  installTo: Date;
}

export interface UpcomingPayout {
  window: PayoutWindow;
  /** Σ expected pay of the installs in that install week; null when the rep has no pay plan. */
  amount: number | null;
  count: number;
}

const noon = (year: number, month: number, day: number) => new Date(year, month, day, 12, 0, 0);

function lastDayOfMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

/** A sale is T-Fiber when any of its products is a T-Fiber plan. */
export function isTFiberSale(sale: Pick<Sale, 'products'>): boolean {
  return (sale.products || []).some((product) => product.company === TFIBER_COMPANY);
}

function toDate(value: Date | string | null | undefined): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** The payout window a T-Fiber install on `installDate` falls into. */
export function payoutWindowForInstall(installDate: Date): PayoutWindow {
  const year = installDate.getFullYear();
  const month = installDate.getMonth();
  const day = installDate.getDate();

  if (day <= 7) {
    return {
      installFrom: noon(year, month, 1),
      installTo: noon(year, month, 7),
      start: noon(year, month, 14),
      end: noon(year, month, 18),
    };
  }
  if (day <= 14) {
    return {
      installFrom: noon(year, month, 8),
      installTo: noon(year, month, 14),
      start: noon(year, month, 21),
      end: noon(year, month, 25),
    };
  }
  if (day <= 21) {
    return {
      installFrom: noon(year, month, 15),
      installTo: noon(year, month, 21),
      start: noon(year, month, 28),
      end: noon(year, month + 1, 3),
    };
  }
  return {
    installFrom: noon(year, month, 22),
    installTo: noon(year, month, lastDayOfMonth(year, month)),
    start: noon(year, month + 1, 7),
    end: noon(year, month + 1, 11),
  };
}

/**
 * The payout window for one sale, or null. Only a T-Fiber sale that has
 * INSTALLED gets one — the caller decides "installed" (install bucket), since
 * that also depends on the carrier report.
 */
export function payoutWindowForSale(
  sale: Pick<Sale, 'products' | 'installDate'>,
  installed: boolean
): PayoutWindow | null {
  if (!installed || !isTFiberSale(sale)) return null;
  const install = toDate(sale.installDate as Date | string | undefined);
  return install ? payoutWindowForInstall(install) : null;
}

function startOfDay(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

/**
 * The next upcoming payout: the earliest window that ends today or later and
 * has installed T-Fiber sales in it. `installs` must already be the rep's
 * counted, INSTALLED sales (cancelled and carrier-cancelled removed); anything
 * that is not T-Fiber is ignored here.
 */
export function nextPayout(
  installs: Array<Pick<Sale, 'products' | 'installDate'>>,
  rates: CompPlanCompanyRates | null | undefined,
  now: Date = new Date()
): UpcomingPayout | null {
  const today = startOfDay(now);
  const byWindow = new Map<number, UpcomingPayout>();

  for (const sale of installs) {
    const window = payoutWindowForSale(sale, true);
    if (!window || startOfDay(window.end) < today) continue;
    const key = window.start.getTime();
    const pay = expectedPayForSale(sale, rates);
    const entry = byWindow.get(key);
    if (entry) {
      entry.count += 1;
      entry.amount = entry.amount === null || pay === null ? null : entry.amount + pay;
    } else {
      byWindow.set(key, { window, amount: pay, count: 1 });
    }
  }

  let soonest: UpcomingPayout | null = null;
  for (const entry of byWindow.values()) {
    if (!soonest || entry.window.start.getTime() < soonest.window.start.getTime()) soonest = entry;
  }
  return soonest;
}

const MONTH = new Intl.DateTimeFormat('en-US', { month: 'short' });

/** "Oct 7–11", or "Sep 28–Oct 3" across a month end. Always a range, never one date. */
export function formatPayoutWindow(window: Pick<PayoutWindow, 'start' | 'end'>): string {
  const startMonth = MONTH.format(window.start);
  const endMonth = MONTH.format(window.end);
  return startMonth === endMonth
    ? `${startMonth} ${window.start.getDate()}–${window.end.getDate()}`
    : `${startMonth} ${window.start.getDate()}–${endMonth} ${window.end.getDate()}`;
}
