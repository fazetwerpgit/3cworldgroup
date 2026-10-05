import type { CompPlanMargin, CompPlanRates, CompPlanRole, Sale } from '@/types';
import { rateFor } from '@/types/compPlan';

type Priced = Pick<Sale, 'products'>;

function sumProducts(sale: Priced, rateOf: (company: string, planId: string) => number): number {
  return (sale.products || []).reduce((sum, product) => {
    const quantity = typeof product.quantity === 'number' && Number.isFinite(product.quantity) ? product.quantity : 0;
    return sum + rateOf(product.company, product.productId) * quantity;
  }, 0);
}

/**
 * What 3C is paid for one sale: each product's "3C Receives" rate (the owner's
 * margin table in Pay rates) times its quantity. A product with no rate yet
 * counts as $0. Owner-only data: callers must only have `margin` for an owner.
 */
export function saleRevenue(sale: Priced, margin: CompPlanMargin): number {
  return sumProducts(sale, (company, planId) => {
    const rate = margin[company]?.[planId];
    return typeof rate === 'number' && Number.isFinite(rate) ? rate : 0;
  });
}

/** What the selling rep is paid for one sale on their comp role; 0 when they have none. */
export function saleCommission(sale: Priced, rates: Partial<CompPlanRates>, compRole: CompPlanRole | null): number {
  return compRole ? sumProducts(sale, (company, planId) => rateFor(rates, compRole, company, planId)) : 0;
}

/** Everything the owner's Sales board needs to price a sale. Owner-only. */
export interface OwnerPricing {
  margin: CompPlanMargin;
  rates: Partial<CompPlanRates>;
  /** uid -> comp role the user is paid on. */
  repCompRoles: Record<string, CompPlanRole>;
}

/** What 3C keeps from one sale: its revenue minus the selling rep's pay. */
export function saleNetRevenue(sale: Priced & Pick<Sale, 'salesRepId'>, pricing: OwnerPricing): number {
  const compRole = pricing.repCompRoles[sale.salesRepId] ?? null;
  return saleRevenue(sale, pricing.margin) - saleCommission(sale, pricing.rates, compRole);
}
