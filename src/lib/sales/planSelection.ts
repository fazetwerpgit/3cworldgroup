import { FIBER_PLANS, type FiberPlan, type SaleProduct } from '@/types/sales';

// ONE internet plan per sale.
//
// Jacob, 2026-09-03: "it's not possible to sell more than one plan at an
// address." The bug that surfaced it: a sale at 12150 Parkside Cir carried both
// TFiber 1 Gig ($60) and TFiber 2 Gig ($70) — $130 against a carrier MRC of
// $70. The rep tapped 1 Gig, changed his mind, tapped 2 Gig, and the form added
// a second plan instead of swapping. Nothing downstream can tell that apart
// from a genuine $130 sale, so it has to be impossible to enter.
//
// Extras are NOT plans. The Xfinity add-ons (TV, a mobile line, EERO Secure,
// home phone) are sold alongside the internet plan and still stack, which is
// why the rule is "one internet plan" rather than "one product".

/** A plan id that is an add-on rather than an internet plan. Unknown ids are internet. */
export function isExtraPlanId(productId: string): boolean {
  return FIBER_PLANS.find((plan) => plan.id === productId)?.category === 'extra';
}

/** The internet plan already on a sale, if any. */
export function selectedInternetProduct(products: SaleProduct[]): SaleProduct | null {
  return products.find((product) => !isExtraPlanId(product.productId)) ?? null;
}

function toProduct(plan: FiberPlan): SaleProduct {
  return {
    productId: plan.id,
    productName: `${plan.name} (${plan.speed})`,
    company: plan.company,
    quantity: 1,
    unitPrice: plan.price,
    totalPrice: plan.price,
    points: plan.points,
  };
}

/**
 * Add `plan` to `products` under the one-internet-plan rule.
 *
 * An internet plan REPLACES whichever internet plan is already there — picking
 * a second one is how a rep changes their mind, not how they sell two. Extras
 * append. Re-picking what is already selected is a no-op (the same array comes
 * back) so a double-tap cannot duplicate a line.
 */
export function addPlanToProducts(products: SaleProduct[], plan: FiberPlan): SaleProduct[] {
  if (products.some((product) => product.productId === plan.id)) return products;
  if (plan.category === 'extra') return [...products, toProduct(plan)];
  // Swap in place: the internet plan keeps its position in the list, so the
  // summary does not reorder itself under the rep as they change their mind.
  const existingIndex = products.findIndex((product) => !isExtraPlanId(product.productId));
  if (existingIndex === -1) return [...products, toProduct(plan)];
  const next = [...products];
  next[existingIndex] = toProduct(plan);
  return next;
}

/**
 * Server-side guard. Returns an error message when a payload breaks the rule,
 * else null. The form makes a second internet plan unreachable; this makes it
 * unwritable, including for the sales already in flight from an older client.
 */
export function validateOnePlanPerSale(products: SaleProduct[]): string | null {
  const internet = products.filter((product) => !isExtraPlanId(product.productId));
  if (internet.length > 1) {
    return `Only one internet plan can be sold at an address — this sale has ${internet.length}: ${internet
      .map((product) => product.productName)
      .join(', ')}`;
  }
  return null;
}
