import type { CompPlanCompanyRates, Sale } from '@/types';

// What a rep should expect to be paid for one sale, and when. Pure so the Pay
// view, the MTD tile and the tests all read the same numbers.
//
// `rates` here is already the caller's OWN slice of the comp plan (company →
// planId → dollars) as served by GET /api/portal/comp-plan for a field user —
// never the full role-keyed table.

/**
 * Is there still money coming for this sale? A rejected or cancelled sale is
 * dead — it must never show an expected amount, count toward an expected total,
 * or sit on the Pay list. Pending sales stay payable: they are money in review,
 * not money lost.
 */
export function isPayableSale(sale: Pick<Sale, 'status'>): boolean {
  return sale.status !== 'rejected' && sale.status !== 'cancelled';
}

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

// There is deliberately NO expected pay DATE here.
//
// Jacob, 2026-09-03: the portal used to print "pays on the 25th". The carrier's
// owner reads a printed pay date as a statement of pay, and a statement of pay
// that the final claims/chargeback report later contradicts is a liability. The
// portal shows the ESTIMATED AMOUNT off installs and nothing about when it
// lands; the rep ticks the sale off themselves once the money actually arrives.
