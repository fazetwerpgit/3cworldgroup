import { describe, expect, it } from 'vitest';
import type { Sale } from '@/types';
import { saleNetRevenue, saleRevenue, type OwnerPricing } from './revenue';

const margin = { tfiber: { 'tfiber-2gig': 560, 'tfiber-500': 325 } };

describe('saleRevenue', () => {
  it('adds each product\'s "3C Receives" rate times its quantity', () => {
    const sale = {
      products: [
        { company: 'tfiber', productId: 'tfiber-2gig', quantity: 1 },
        { company: 'tfiber', productId: 'tfiber-500', quantity: 2 },
      ],
    } as unknown as Sale;
    expect(saleRevenue(sale, margin)).toBe(560 + 2 * 325);
  });

  it('counts a product with no rate yet as $0', () => {
    const sale = { products: [{ company: 'xfinity', productId: 'xfinity-tv', quantity: 1 }] } as unknown as Sale;
    expect(saleRevenue(sale, margin)).toBe(0);
  });
});

describe('saleNetRevenue', () => {
  const pricing: OwnerPricing = {
    margin,
    rates: {
      ae_tier_1: { tfiber: { 'tfiber-2gig': 200 } },
      director: { tfiber: { 'tfiber-2gig': 300 } },
    },
    repCompRoles: { aeRep: 'ae_tier_1', director: 'director' },
  };
  const twoGig = (salesRepId: string) =>
    ({ salesRepId, products: [{ company: 'tfiber', productId: 'tfiber-2gig', quantity: 2 }] }) as unknown as Sale;

  it("subtracts the selling rep's pay on their own role", () => {
    expect(saleNetRevenue(twoGig('aeRep'), pricing)).toBe(2 * (560 - 200));
    expect(saleNetRevenue(twoGig('director'), pricing)).toBe(2 * (560 - 300));
  });

  it('subtracts nothing for a seller with no comp role', () => {
    expect(saleNetRevenue(twoGig('unknown'), pricing)).toBe(2 * 560);
  });
});
