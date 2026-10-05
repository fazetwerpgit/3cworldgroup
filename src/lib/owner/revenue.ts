import type { CompPlanMargin, Sale } from '@/types';

/**
 * What 3C is paid for one sale: each product's "3C Receives" rate (the owner's
 * margin table in Pay rates) times its quantity. A product with no rate yet
 * counts as $0. Owner-only data: callers must only have `margin` for an owner.
 */
export function saleRevenue(sale: Pick<Sale, 'products'>, margin: CompPlanMargin): number {
  return (sale.products || []).reduce((sum, product) => {
    const quantity = typeof product.quantity === 'number' && Number.isFinite(product.quantity) ? product.quantity : 0;
    const rate = margin[product.company]?.[product.productId];
    return sum + (typeof rate === 'number' && Number.isFinite(rate) ? rate : 0) * quantity;
  }, 0);
}
