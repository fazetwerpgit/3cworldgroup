import { describe, expect, it } from 'vitest';
import { isDemoAccount, withoutDemoDocs } from './demoAccount';

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
