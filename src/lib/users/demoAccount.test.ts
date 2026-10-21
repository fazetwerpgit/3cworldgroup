import { describe, expect, it } from 'vitest';
import {
  isDemoAccount,
  isDemoSale,
  isHiddenUser,
  isTestAccount,
  saleVisibleTo,
  withoutDemoDocs,
  withoutHiddenUserDocs,
} from './demoAccount';

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

describe('test accounts', () => {
  it('isTestAccount is true only for testAccount === true', () => {
    expect(isTestAccount({ testAccount: true })).toBe(true);
    for (const value of [false, 'true', 1, null, undefined]) expect(isTestAccount({ testAccount: value })).toBe(false);
    expect(isTestAccount(null)).toBe(false);
  });

  it('isHiddenUser covers demo and test accounts, nothing else', () => {
    expect(isHiddenUser({ demoAccount: true })).toBe(true);
    expect(isHiddenUser({ testAccount: true })).toBe(true);
    expect(isHiddenUser({ testAccount: 'true', demoAccount: false })).toBe(false);
    expect(isHiddenUser({})).toBe(false);
    expect(isHiddenUser(undefined)).toBe(false);
  });

  it('withoutHiddenUserDocs drops demo and test docs; withoutDemoDocs still drops demo only', () => {
    const doc = (id: string, data: Record<string, unknown>) => ({ id, data: () => data });
    const docs = [doc('a', {}), doc('demo', { demoAccount: true }), doc('test', { testAccount: true })];
    expect(withoutHiddenUserDocs(docs).map((d) => d.id)).toEqual(['a']);
    expect(withoutDemoDocs(docs).map((d) => d.id)).toEqual(['a', 'test']);
  });

  it('hides a test sale from everyone but the test account that logged it', () => {
    const test = { salesRepId: 'qa', testAccount: true };
    expect(isDemoSale(test)).toBe(true);
    expect(isDemoSale({ salesRepId: 'r1', testAccount: 'true' })).toBe(false);
    expect(saleVisibleTo(test, 'qa')).toBe(true);
    expect(saleVisibleTo(test, 'r1')).toBe(false);
    expect(saleVisibleTo(test)).toBe(false);
  });

  it('leaves the demo account rule alone', () => {
    expect(isDemoAccount({ testAccount: true })).toBe(false);
  });
});
