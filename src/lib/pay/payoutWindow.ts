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
//
// Owner, 2026-09-22: a window belongs to EVERY T-Fiber sale with an install
// date, scheduled or completed. It is computed live from the sale's CURRENT
// install date (the carrier's activation date wins, via
// applyCarrierInstallDates), so a rescheduled install moves its window on its
// own. Nothing is stored.

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
  /** How many of `count` are still scheduled (install date after now). */
  scheduled: number;
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
 * The payout window for one sale, or null. Only a dated T-Fiber sale gets one,
 * and only when the caller says it is `eligible` — the rep's views pass "not
 * cancelled" (scheduled and completed installs both get a window); the company
 * board still passes "installed".
 */
export function payoutWindowForSale(
  sale: Pick<Sale, 'products' | 'installDate'>,
  eligible: boolean
): PayoutWindow | null {
  if (!eligible || !isTFiberSale(sale)) return null;
  const install = toDate(sale.installDate as Date | string | undefined);
  return install ? payoutWindowForInstall(install) : null;
}

function startOfDay(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

/**
 * The next upcoming payout: the earliest window that ends today or later and
 * has T-Fiber sales in it. `installs` must already be the rep's counted sales
 * (cancelled and carrier-cancelled removed); scheduled installs count toward
 * their window and are tallied in `scheduled`. Anything that is not T-Fiber, or
 * has no install date, is ignored here.
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
    const scheduled = (toDate(sale.installDate as Date | string | undefined)?.getTime() ?? 0) > now.getTime() ? 1 : 0;
    const entry = byWindow.get(key);
    if (entry) {
      entry.count += 1;
      entry.scheduled += scheduled;
      entry.amount = entry.amount === null || pay === null ? null : entry.amount + pay;
    } else {
      byWindow.set(key, { window, amount: pay, count: 1, scheduled });
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

const DATE_INPUT = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * The estimated window for a sale still being logged: its products and the
 * install date typed into the form (YYYY-MM-DD). "Oct 7–11", or null when it is
 * not T-Fiber or the date is missing or not a real day.
 */
export function payoutLabelForDraft(
  products: Sale['products'] | undefined,
  installDateInput: string | null | undefined
): string | null {
  if (!isTFiberSale({ products: products || [] })) return null;
  const parts = DATE_INPUT.exec((installDateInput || '').trim());
  if (!parts) return null;
  const [year, month, day] = [Number(parts[1]), Number(parts[2]) - 1, Number(parts[3])];
  const date = noon(year, month, day);
  if (date.getFullYear() !== year || date.getMonth() !== month || date.getDate() !== day) return null;
  return formatPayoutWindow(payoutWindowForInstall(date));
}
