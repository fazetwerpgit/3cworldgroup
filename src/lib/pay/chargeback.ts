import type { CompPlanCompanyRates, FiberOrder, Sale } from '@/types';
import { expectedPayForSale, isPayableSale } from '@/lib/pay/expectedPay';
import { countedSales, daysBetween } from '@/lib/sales/installBucket';
import { installDayKey } from '@/lib/sales/saleDate';
import { firstNameLastInitial } from '@/lib/sales/orderNumber';
import type { MonthKey } from '@/lib/sales/monthWindow';

// The 120-day chargeback rule (owner, 2026-10-13):
//
//   - The carrier cancels the order BEFORE install ('cancelled'): no pay and no
//     chargeback. The sale drops out of every figure (countedSales).
//   - The customer cancels WITHIN 120 days of install (a 'churned' order whose
//     deactivation is 120 days or fewer after its activation): full chargeback.
//   - The customer cancels AFTER 120 days: it was a normal install and nothing
//     changes.
//
// A churned sale always stays counted in its install month, so a past month
// never rewrites itself when a customer later disconnects. A chargeback is a
// separate, negative "Est. chargeback" line that lands in the month of the
// deactivation, equal to the sale's own estimated pay. The leaderboard takes a
// charged-back sale's points off (boardCountedSales); after 120 days it keeps them.
//
// Every figure here is an estimate, like the rest of pay: the carrier's final
// report decides what is actually charged back.

/** A customer who cancels this many days after install, or fewer, is charged back. */
export const CHARGEBACK_WINDOW_DAYS = 120;

/** Row and pay-line words for a charged-back sale. */
export const CHARGEBACK_REASON = 'Cancelled within 120 days of install';

export interface Chargeback {
  /** The install day the window runs from: the carrier's activation, else the sale's install day. */
  installDay: string;
  /** The day the carrier deactivated the account (YYYY-MM-DD); the month it lands in. */
  deactivationDay: string;
  /** Whole days from install to deactivation. */
  days: number;
}

/**
 * The chargeback a sale carries, or null. Only a sale that still counts (not
 * cancelled or rejected here) and whose carrier order churned can carry one:
 * a portal-cancelled sale never paid, so there is nothing to take back. The
 * window runs from the carrier's activation date, falling back to the sale's
 * own install day when the report has none. Without a readable install day or
 * deactivation day there is no window to judge, so there is no chargeback; a
 * deactivation dated before the install reads the same way.
 */
export function chargebackFor(
  sale: Pick<Sale, 'status' | 'installDate'>,
  order: FiberOrder | null | undefined
): Chargeback | null {
  if (!isPayableSale(sale) || order?.status !== 'churned') return null;
  const deactivationDay = carrierDayKey(order.deactivationDate ?? order.cancellationDate);
  const installDay = carrierDayKey(order.activationDate) ?? installDayKey(sale.installDate);
  if (!deactivationDay || !installDay) return null;
  const days = daysBetween(installDay, deactivationDay);
  // A deactivation dated before the activation is unreadable carrier data
  // (a swapped column, a typo), like a missing date: no window, no chargeback.
  if (!Number.isFinite(days) || days < 0 || days > CHARGEBACK_WINDOW_DAYS) return null;
  return { installDay, deactivationDay, days };
}

const DAY_KEY = /^\d{4}-\d{2}-\d{2}$/;

/** Carrier dates are bare calendar days: read them as written, never through a time zone. */
function carrierDayKey(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return DAY_KEY.test(trimmed) ? trimmed : installDayKey(trimmed);
}

/** The month a day key falls in. */
export function dayKeyMonth(day: string): MonthKey {
  const [year, month] = day.split('-').map(Number);
  return { year, month: month - 1 };
}

/** A day key at local noon, the way sale and carrier dates are stored. */
export function dayKeyDate(day: string): Date {
  const [year, month, date] = day.split('-').map(Number);
  return new Date(year, month - 1, date, 12, 0, 0);
}

type SaleForBoard = Pick<Sale, 'status' | 'installDate'> & { id?: string };

/**
 * What the leaderboard counts: the sales the estimate counts (countedSales,
 * same carrier join), less any sale charged back under the 120-day rule. A
 * customer who disconnected within 120 days takes the rep's points with them;
 * after 120 days the sale keeps its points.
 */
export function boardCountedSales<T extends SaleForBoard>(sales: T[], fiberBySale?: Map<string, FiberOrder>): T[] {
  return countedSales(sales, fiberBySale).filter(
    (sale) => !chargebackFor(sale, fiberBySale?.get(sale.id || ''))
  );
}

export interface ChargebackLine<T extends Sale = Sale> {
  sale: T;
  chargeback: Chargeback;
  /** "Rosaria M.": first name and last initial, else the street, else "Customer". */
  customer: string;
  /** The sale's est. pay as a NEGATIVE exact figure (round at display); null = no pay plan. */
  amount: number | null;
}

/**
 * Every chargeback in the book, newest deactivation first, priced at the same
 * exact est. pay the sale earned in its install month.
 */
export function chargebackLines<T extends Sale>(
  sales: T[],
  fiberBySale: Map<string, FiberOrder>,
  rates: CompPlanCompanyRates | null
): ChargebackLine<T>[] {
  const lines: ChargebackLine<T>[] = [];
  for (const sale of countedSales(sales, fiberBySale)) {
    const chargeback = chargebackFor(sale, fiberBySale.get(sale.id || ''));
    if (!chargeback) continue;
    const pay = expectedPayForSale(sale, rates);
    lines.push({
      sale,
      chargeback,
      customer:
        firstNameLastInitial(sale.customerName) ||
        (sale.customerAddress || '').split(',')[0].trim() ||
        'Customer',
      amount: pay === null ? null : -pay,
    });
  }
  return lines.sort((a, b) => b.chargeback.deactivationDay.localeCompare(a.chargeback.deactivationDay));
}

/** The chargebacks landing in `month` (by deactivation day). */
export function chargebacksIn<T extends Sale>(lines: ChargebackLine<T>[], month: MonthKey): ChargebackLine<T>[] {
  return lines.filter((line) => {
    const landed = dayKeyMonth(line.chargeback.deactivationDay);
    return landed.year === month.year && landed.month === month.month;
  });
}

/** Σ chargeback amounts (negative), or null when there is no pay plan. */
export function sumChargebacks(lines: ChargebackLine[], rates: CompPlanCompanyRates | null): number | null {
  if (!rates) return null;
  return lines.reduce((sum, line) => sum + (line.amount ?? 0), 0);
}
