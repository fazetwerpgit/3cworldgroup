import { describe, it, expect } from 'vitest';
import type { SaleProduct } from '@/types';
import { expectedPayForSale, isPayableSale } from './expectedPay';

const rates = {
  tfiber: { 'tfiber-1gig': 100, 'tfiber-2gig': 125 },
  att: { 'att-500': 60 },
};

function product(overrides: Partial<SaleProduct> & Pick<SaleProduct, 'productId' | 'company'>): SaleProduct {
  return {
    productName: overrides.productId,
    quantity: 1,
    unitPrice: 0,
    totalPrice: 0,
    points: 0,
    ...overrides,
  };
}

describe('expectedPayForSale', () => {
  it('sums rate x quantity across products and companies', () => {
    const sale = {
      products: [
        product({ productId: 'tfiber-1gig', company: 'tfiber', quantity: 2 }),
        product({ productId: 'att-500', company: 'att', quantity: 3 }),
      ],
    };
    expect(expectedPayForSale(sale, rates)).toBe(380);
  });

  it('counts an unknown product, an unknown company and a zero rate as 0', () => {
    const sale = {
      products: [
        product({ productId: 'tfiber-1gig', company: 'tfiber' }),
        product({ productId: 'tfiber-nope', company: 'tfiber' }),
        product({ productId: 'att-500', company: 'frontier' }),
      ],
    };
    expect(expectedPayForSale(sale, rates)).toBe(100);
  });

  it('returns 0 for a sale with no products', () => {
    expect(expectedPayForSale({ products: [] }, rates)).toBe(0);
  });

  it('returns 0 when every rate in the plan is 0 (no contract yet)', () => {
    const sale = { products: [product({ productId: 'tfiber-1gig', company: 'tfiber' })] };
    expect(expectedPayForSale(sale, { tfiber: { 'tfiber-1gig': 0 } })).toBe(0);
  });

  it('returns null when the rep has no rates at all', () => {
    const sale = { products: [product({ productId: 'tfiber-1gig', company: 'tfiber' })] };
    expect(expectedPayForSale(sale, null)).toBeNull();
    expect(expectedPayForSale(sale, undefined)).toBeNull();
  });
});

describe('isPayableSale', () => {
  it('treats pending and approved sales as money still coming', () => {
    expect(isPayableSale({ status: 'pending' })).toBe(true);
    expect(isPayableSale({ status: 'approved' })).toBe(true);
  });

  it('treats rejected and cancelled sales as dead', () => {
    expect(isPayableSale({ status: 'rejected' })).toBe(false);
    expect(isPayableSale({ status: 'cancelled' })).toBe(false);
  });
});
