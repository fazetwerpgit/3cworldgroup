import { describe, expect, it } from 'vitest';
import type { SaleProduct } from '@/types';
import { compactTier, formatPlanMix, formatPlanMixCompact, planMix, planMixForms, productTier } from './planMix';

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

describe('compact plan mix', () => {
  const worst = [
    { tier: '1 Gig', count: 23 },
    { tier: '2 Gig', count: 14 },
    { tier: '500', count: 9 },
    { tier: '300', count: 6 },
  ];

  it('drops the Gig word and the spaces around ×', () => {
    expect(compactTier('1 Gig')).toBe('1G');
    expect(compactTier('2.5 Gig')).toBe('2.5G');
    expect(compactTier('300')).toBe('300');
    expect(formatPlanMixCompact(worst)).toBe('23×1G · 14×2G · 9×500 · 6×300');
  });

  it('keeps the top tiers and adds the rest as +N sales', () => {
    expect(formatPlanMixCompact(worst, 2)).toBe('23×1G · 14×2G +15');
    expect(formatPlanMixCompact(worst, 1)).toBe('23×1G +29');
    expect(formatPlanMixCompact(worst, 0)).toBe('23×1G +29');
    expect(formatPlanMixCompact(worst, 9)).toBe('23×1G · 14×2G · 9×500 · 6×300');
    expect(formatPlanMixCompact([])).toBe('');
    expect(formatPlanMixCompact(null, 2)).toBe('');
  });

  it('lists every form longest first, without repeats', () => {
    expect(planMixForms(worst)).toEqual([
      '23× 1 Gig · 14× 2 Gig · 9× 500 · 6× 300',
      '23×1G · 14×2G · 9×500 · 6×300',
      '23×1G · 14×2G +15',
      '23×1G +29',
    ]);
    expect(planMixForms([{ tier: '1 Gig', count: 9 }, { tier: '300', count: 1 }])).toEqual([
      '9× 1 Gig · 1× 300',
      '9×1G · 1×300',
      '9×1G +1',
    ]);
    expect(planMixForms([{ tier: '300', count: 4 }])).toEqual(['4× 300', '4×300']);
    expect(planMixForms([{ tier: '500', count: 4 }]).length).toBe(2);
    expect(planMixForms(undefined)).toEqual([]);
  });
});
