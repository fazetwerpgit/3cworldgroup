import { describe, it, expect } from 'vitest';
import {
  addPlanToProducts,
  isExtraPlanId,
  selectedInternetProduct,
  validateOnePlanPerSale,
} from './planSelection';
import { FIBER_PLANS, type FiberPlan, type SaleProduct } from '@/types/sales';

const plan = (id: string): FiberPlan => {
  const found = FIBER_PLANS.find((p) => p.id === id);
  if (!found) throw new Error(`no such plan: ${id}`);
  return found;
};

const ids = (products: SaleProduct[]) => products.map((p) => p.productId);

describe('isExtraPlanId', () => {
  it('an Xfinity add-on is an extra', () => {
    expect(isExtraPlanId('xfinity-tv')).toBe(true);
  });
  it('an internet plan is not', () => {
    expect(isExtraPlanId('tfiber-2gig')).toBe(false);
  });
  it('an id not in the catalog counts as internet, so the rule still binds it', () => {
    expect(isExtraPlanId('retired-plan-from-2024')).toBe(false);
  });
});

describe('addPlanToProducts', () => {
  it('adds the first internet plan', () => {
    expect(ids(addPlanToProducts([], plan('tfiber-1gig')))).toEqual(['tfiber-1gig']);
  });

  // The Parkside Cir bug: 1 Gig then 2 Gig produced a $130 sale against a $70
  // carrier MRC. Changing your mind must swap, not add.
  it('a second internet plan REPLACES the first', () => {
    const after = addPlanToProducts(addPlanToProducts([], plan('tfiber-1gig')), plan('tfiber-2gig'));
    expect(ids(after)).toEqual(['tfiber-2gig']);
    expect(after.reduce((sum, p) => sum + p.totalPrice, 0)).toBe(70);
  });

  it('the swap keeps the internet plan in place, ahead of the extras', () => {
    let products = addPlanToProducts([], plan('xfinity-1gig'));
    products = addPlanToProducts(products, plan('xfinity-tv'));
    products = addPlanToProducts(products, plan('xfinity-2gig'));
    expect(ids(products)).toEqual(['xfinity-2gig', 'xfinity-tv']);
  });

  it('extras stack alongside the internet plan', () => {
    let products = addPlanToProducts([], plan('xfinity-500'));
    products = addPlanToProducts(products, plan('xfinity-tv'));
    products = addPlanToProducts(products, plan('xfinity-home-phone'));
    expect(ids(products)).toEqual(['xfinity-500', 'xfinity-tv', 'xfinity-home-phone']);
  });

  it('re-picking the selected plan is a no-op, so a double tap cannot duplicate it', () => {
    const once = addPlanToProducts([], plan('att-1gig'));
    expect(addPlanToProducts(once, plan('att-1gig'))).toBe(once);
  });

  it('switching provider swaps the internet plan across companies too', () => {
    const after = addPlanToProducts(addPlanToProducts([], plan('tfiber-2gig')), plan('att-2gig'));
    expect(ids(after)).toEqual(['att-2gig']);
  });

  it('snapshots the plan price and points onto the line', () => {
    const [line] = addPlanToProducts([], plan('tfiber-2gig'));
    expect(line).toMatchObject({
      productName: 'TFiber 2 Gig (2 Gbps)',
      company: 'tfiber',
      quantity: 1,
      unitPrice: 70,
      totalPrice: 70,
      points: 10,
    });
  });
});

describe('selectedInternetProduct', () => {
  it('null when only extras are on the sale', () => {
    expect(selectedInternetProduct(addPlanToProducts([], plan('xfinity-tv')))).toBeNull();
  });
  it('finds the internet plan behind the extras', () => {
    let products = addPlanToProducts([], plan('xfinity-tv'));
    products = addPlanToProducts(products, plan('xfinity-1gig'));
    expect(selectedInternetProduct(products)?.productId).toBe('xfinity-1gig');
  });
});

describe('validateOnePlanPerSale', () => {
  it('passes one internet plan with any number of extras', () => {
    let products = addPlanToProducts([], plan('xfinity-1gig'));
    products = addPlanToProducts(products, plan('xfinity-tv'));
    products = addPlanToProducts(products, plan('xfinity-eero-secure'));
    expect(validateOnePlanPerSale(products)).toBeNull();
  });

  it('passes a sale with no products — a different check owns that', () => {
    expect(validateOnePlanPerSale([])).toBeNull();
  });

  // The client cannot build this any more; an old phone still can.
  it('rejects two internet plans and names them', () => {
    const products = [...addPlanToProducts([], plan('tfiber-1gig')), ...addPlanToProducts([], plan('tfiber-2gig'))];
    const error = validateOnePlanPerSale(products);
    expect(error).toContain('TFiber 1 Gig');
    expect(error).toContain('TFiber 2 Gig');
  });
});
