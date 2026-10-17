import { describe, expect, it } from 'vitest';
import { isDemoAccount, isDemoSale, saleVisibleTo, withoutDemoDocs } from './demoAccount';

describe('isDemoAccount', () => {
  it('is true only for demoAccount === true', () => {
    expect(isDemoAccount({ demoAccount: true })).toBe(true);
    for (const value of [false, 'true', 1, null, undefined]) {
      expect(isDemoAccount({ demoAccount: value })).toBe(false);
    }
    expect(isDemoAccount({})).toBe(false);
    expect(isDemoAccount(null)).toBe(false);
    expect(isDemoAccount(undefined)).toBe(false);
  });
});

describe('withoutDemoDocs', () => {
  it('drops demo docs and keeps the rest in order', () => {
    const doc = (id: string, data: Record<string, unknown> | undefined) => ({ id, data: () => data });
    const docs = [doc('a', { status: 'active' }), doc('demo', { demoAccount: true }), doc('b', undefined)];
    expect(withoutDemoDocs(docs).map((d) => d.id)).toEqual(['a', 'b']);
  });
});

describe('isDemoSale / saleVisibleTo', () => {
  const demo = { salesRepId: 'demo', demoAccount: true };
  const real = { salesRepId: 'r1' };

  it('marks only a sale stamped demoAccount === true', () => {
    expect(isDemoSale(demo)).toBe(true);
    expect(isDemoSale({ ...real, demoAccount: 'true' })).toBe(false);
    expect(isDemoSale(real)).toBe(false);
    expect(isDemoSale(undefined)).toBe(false);
  });

  it('shows every real sale to everyone, and a demo sale only to its own account', () => {
    expect(saleVisibleTo(real, 'someone')).toBe(true);
    expect(saleVisibleTo(real)).toBe(true);
    expect(saleVisibleTo(demo, 'demo')).toBe(true);
    expect(saleVisibleTo(demo, 'r1')).toBe(false);
    expect(saleVisibleTo(demo)).toBe(false);
    expect(saleVisibleTo(demo, null)).toBe(false);
    expect(saleVisibleTo({ demoAccount: true }, '')).toBe(false);
  });
});
