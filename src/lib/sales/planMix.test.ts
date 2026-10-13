import { describe, expect, it } from 'vitest';
import type { SaleProduct } from '@/types';
import { formatPlanMix, planMix, productTier } from './planMix';

const p = (productId: string, quantity = 1): SaleProduct => ({
  company: productId.split('-')[0],
  productId,
  productName: productId,
  quantity,
  unitPrice: 0,
  totalPrice: 0,
  points: 0,
});
const sale = (...ids: string[]) => ({ products: ids.map((id) => p(id)) });

describe('productTier', () => {
  it('maps catalog speeds to short tiers, the same speed on any carrier being one tier', () => {
    expect(productTier('tfiber-300')).toEqual({ tier: '300', mbps: 300 });
    expect(productTier('tfiber-500')).toEqual({ tier: '500', mbps: 500 });
    expect(productTier('tfiber-1gig')).toEqual({ tier: '1 Gig', mbps: 1000 });
    expect(productTier('att-1gig')).toEqual({ tier: '1 Gig', mbps: 1000 });
    expect(productTier('tfiber-2gig')?.tier).toBe('2 Gig');
    expect(productTier('att-5gig')?.tier).toBe('5 Gig');
  });

  it('skips unknown products and add-ons that are not internet tiers', () => {
    expect(productTier('mystery-9000')).toBeNull();
    expect(productTier('')).toBeNull();
    expect(productTier(undefined)).toBeNull();
    expect(productTier('xfinity-tv')).toBeNull();
    expect(productTier('xfinity-eero-secure')).toBeNull();
  });
});

describe('planMix', () => {
  it('counts by tier, most sold first, then the faster tier on a tie', () => {
    const sales = [
      ...Array.from({ length: 4 }, () => sale('tfiber-300')),
      ...Array.from({ length: 6 }, () => sale('tfiber-2gig')),
      ...Array.from({ length: 6 }, () => sale('tfiber-1gig')),
      ...Array.from({ length: 4 }, () => sale('att-1gig')),
    ];
    expect(planMix(sales)).toEqual([
      { tier: '1 Gig', count: 10 },
      { tier: '2 Gig', count: 6 },
      { tier: '300', count: 4 },
    ]);
    expect(formatPlanMix(planMix(sales))).toBe('10× 1 Gig · 6× 2 Gig · 4× 300');
  });

  it('breaks a tie on speed, faster first', () => {
    expect(formatPlanMix(planMix([sale('tfiber-300'), sale('tfiber-2gig'), sale('tfiber-500')]))).toBe(
      '1× 2 Gig · 1× 500 · 1× 300'
    );
  });

  it('counts each internet tier on a multi-product sale once, ignoring add-ons and quantity', () => {
    const mixed = { products: [p('xfinity-1gig', 2), p('xfinity-tv'), p('xfinity-1gig'), p('xfinity-2gig')] };
    expect(planMix([mixed])).toEqual([
      { tier: '2 Gig', count: 1 },
      { tier: '1 Gig', count: 1 },
    ]);
  });

  it('adds nothing for a sale with no recognizable tier, and formats empty as empty', () => {
    expect(planMix([sale('mystery-9000'), { products: [] }, {} as { products: SaleProduct[] }])).toEqual([]);
    expect(formatPlanMix(planMix([]))).toBe('');
    expect(formatPlanMix(undefined)).toBe('');
  });
});
