import { describe, expect, it } from 'vitest';
import type { Sale } from '@/types';
import { saleRevenue } from './revenue';

describe('saleRevenue', () => {
  const margin = { tfiber: { 'tfiber-2gig': 560, 'tfiber-500': 325 } };

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
