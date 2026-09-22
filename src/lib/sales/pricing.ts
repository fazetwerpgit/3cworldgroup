import { getPlanById, type SaleProduct } from '@/types/sales';

// Server-side pricing for sale product lines.
//
// The client used to send each line's price and points and the API summed them,
// so an edited request could log any points/value it liked. Every line is now
// rebuilt from the FIBER_PLANS catalog by productId; only the id (and nothing
// else) is taken from the client. Stored shape is unchanged — the same fields
// planSelection.toProduct() builds on the form.

export type PricedSaleProducts =
  | { ok: true; products: SaleProduct[]; totalValue: number; totalPoints: number }
  | { ok: false; error: string };

const roundCents = (value: number) => Math.round(value * 100) / 100;

/**
 * Rebuild `input` product lines from the catalog.
 *
 * `snapshot` is the sale's stored lines (edits only): a line whose productId is
 * already on the sale keeps its stored snapshot, so correcting an old sale never
 * silently reprices it to today's catalog, and a line for a plan since retired
 * from the catalog can still be re-saved. Any other unknown productId is an
 * error.
 */
export function priceSaleProducts(
  input: unknown,
  snapshot: SaleProduct[] = []
): PricedSaleProducts {
  if (!Array.isArray(input)) {
    return { ok: false, error: 'products must be a list' };
  }

  const products: SaleProduct[] = [];
  // Each stored line can be matched once, so a replayed id cannot clone it.
  const unmatchedSnapshot = Array.isArray(snapshot) ? [...snapshot] : [];
  const pricedIds = new Set<string>();
  for (const raw of input) {
    const productId =
      raw && typeof raw === 'object' ? (raw as { productId?: unknown }).productId : undefined;
    if (typeof productId !== 'string' || !productId) {
      return { ok: false, error: 'Each product needs a productId' };
    }

    const storedIndex = unmatchedSnapshot.findIndex((line) => line.productId === productId);
    if (storedIndex !== -1) {
      products.push(unmatchedSnapshot[storedIndex]);
      unmatchedSnapshot.splice(storedIndex, 1);
      pricedIds.add(productId);
      continue;
    }

    const plan = getPlanById(productId);
    if (!plan) {
      return { ok: false, error: `Unknown product: ${productId}` };
    }
    // One line per plan: the form dedupes re-picks, so a repeated id is never
    // a real sale — only a way to multiply points.
    if (pricedIds.has(plan.id)) {
      return { ok: false, error: `Duplicate product: ${plan.name}` };
    }
    pricedIds.add(plan.id);
    products.push({
      productId: plan.id,
      productName: `${plan.name} (${plan.speed})`,
      company: plan.company,
      quantity: 1,
      unitPrice: plan.price,
      totalPrice: plan.price,
      points: plan.points,
    });
  }

  return {
    ok: true,
    products,
    totalValue: roundCents(products.reduce((sum, line) => sum + (Number(line.totalPrice) || 0), 0)),
    totalPoints: products.reduce((sum, line) => sum + (Number(line.points) || 0), 0),
  };
}

/** Client idempotency key for a new sale: the form's 32-hex proofUploadId. */
export const CLIENT_SALE_ID_RE = /^[a-f0-9]{32}$/;
