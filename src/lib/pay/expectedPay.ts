import type { CompPlanCompanyRates, Sale } from '@/types';
import { PAY_DELAY_DAYS } from '@/types';

// What a rep should expect to be paid for one sale, and when. Pure so the Pay
// view, the MTD tile and the tests all read the same numbers.
//
// `rates` here is already the caller's OWN slice of the comp plan (company →
// planId → dollars) as served by GET /api/portal/comp-plan for a field user —
// never the full role-keyed table.

/** A stored plan can lag the product catalog, so an unknown company/plan is 0, never a throw. */
function rateForProduct(rates: CompPlanCompanyRates, company: string, planId: string): number {
  const value = rates[company]?.[planId];
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

/**
 * Σ rate × quantity across the sale's products.
 *
 * Returns null when there are no rates at all — a rep whose role carries no comp
 * slice must see "no pay plan assigned", not a confident $0. Within a plan, an
 * unknown product (or a corrupt quantity) contributes 0: expected pay may fall
 * short of reality, but it must never overstate it.
 */
export function expectedPayForSale(
  sale: Pick<Sale, 'products'>,
  rates: CompPlanCompanyRates | null | undefined
): number | null {
  if (!rates) return null;
  return (sale.products || []).reduce((sum, product) => {
    const quantity =
      typeof product.quantity === 'number' && Number.isFinite(product.quantity) ? product.quantity : 0;
    return sum + rateForProduct(rates, product.company, product.productId) * quantity;
  }, 0);
}

/**
 * Install date + the pay delay (~2 weeks). Null until the sale has an install
 * date — nothing is owed before the install happens.
 *
 * Install dates are stored at local noon, so adding days with setDate can never
 * cross a day boundary on a DST shift.
 */
export function expectedPayDate(
  sale: Pick<Sale, 'installDate'>,
  payDelayDays: number = PAY_DELAY_DAYS
): Date | null {
  if (!sale.installDate) return null;
  // Sales arrive from the API as JSON, so installDate is a string at runtime
  // even though the Sale type calls it a Date.
  const installed = new Date(sale.installDate as Date | string);
  if (Number.isNaN(installed.getTime())) return null;
  const due = new Date(installed.getTime());
  due.setDate(due.getDate() + payDelayDays);
  return due;
}
