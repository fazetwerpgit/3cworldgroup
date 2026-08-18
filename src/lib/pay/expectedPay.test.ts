import { describe, it, expect } from 'vitest';
import type { SaleProduct } from '@/types';
import { expectedPayDate, expectedPayForSale } from './expectedPay';

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

describe('expectedPayDate', () => {
  it('adds the pay delay to the install date', () => {
    const due = expectedPayDate({ installDate: new Date(2026, 2, 3, 12) }, 14);
    expect(due?.getFullYear()).toBe(2026);
    expect(due?.getMonth()).toBe(2);
    expect(due?.getDate()).toBe(17);
  });

  it('rolls into the next month correctly', () => {
    const due = expectedPayDate({ installDate: new Date(2026, 0, 25, 12) }, 14);
    expect(due?.getMonth()).toBe(1);
    expect(due?.getDate()).toBe(8);
  });

  it('keeps the local day across a DST spring-forward window', () => {
    // 2026-03-01 noon + 14d lands on 2026-03-15, after the US DST shift.
    const due = expectedPayDate({ installDate: new Date(2026, 2, 1, 12) }, 14);
    expect(due?.getDate()).toBe(15);
    expect(due?.getMonth()).toBe(2);
  });

  it('defaults to the 14-day plan delay', () => {
    const due = expectedPayDate({ installDate: new Date(2026, 5, 1, 12) });
    expect(due?.getDate()).toBe(15);
  });

  it('returns null without an install date, and for an unparseable one', () => {
    expect(expectedPayDate({}, 14)).toBeNull();
    expect(expectedPayDate({ installDate: 'not-a-date' as unknown as Date }, 14)).toBeNull();
  });
});
