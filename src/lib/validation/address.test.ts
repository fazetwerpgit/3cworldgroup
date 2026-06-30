import { describe, it, expect } from 'vitest';
import { US_STATES, isValidZip, validateAddress } from './address';

describe('US_STATES', () => {
  it('has 51 entries (50 states + DC) with 2-letter codes', () => {
    expect(US_STATES).toHaveLength(51);
    for (const s of US_STATES) {
      expect(s.code).toMatch(/^[A-Z]{2}$/);
      expect(s.name.length).toBeGreaterThan(0);
    }
    expect(US_STATES.some((s) => s.code === 'DC')).toBe(true);
    expect(US_STATES.some((s) => s.code === 'CA')).toBe(true);
  });
});

describe('isValidZip', () => {
  it('accepts 5-digit and ZIP+4', () => {
    expect(isValidZip('12345')).toBe(true);
    expect(isValidZip('12345-6789')).toBe(true);
    expect(isValidZip('  12345 ')).toBe(true); // trimmed
  });
  it('rejects malformed zips', () => {
    expect(isValidZip('1234')).toBe(false);
    expect(isValidZip('123456')).toBe(false);
    expect(isValidZip('abcde')).toBe(false);
    expect(isValidZip('')).toBe(false);
  });
});

describe('validateAddress', () => {
  it('accepts all-empty input and returns an empty clean object', () => {
    expect(validateAddress({})).toEqual({ ok: true, clean: {} });
    expect(validateAddress({ address: '', city: '  ', state: '', zip: '' })).toEqual({
      ok: true,
      clean: {},
    });
  });

  it('trims and keeps only non-empty fields', () => {
    const r = validateAddress({ address: ' 1 Main St ', city: 'Austin', state: 'TX', zip: '78701' });
    expect(r).toEqual({
      ok: true,
      clean: { address: '1 Main St', city: 'Austin', state: 'TX', zip: '78701' },
    });
  });

  it('accepts a valid ZIP+4', () => {
    const r = validateAddress({ zip: '78701-1234' });
    expect(r).toEqual({ ok: true, clean: { zip: '78701-1234' } });
  });

  it('rejects a non-empty invalid zip with a zip message', () => {
    const r = validateAddress({ zip: '7870' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/zip/i);
  });

  it('rejects an unknown state code with a state message', () => {
    const r = validateAddress({ state: 'ZZ' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/state/i);
  });

  it('coerces non-string inputs to empty instead of throwing', () => {
    // Raw JSON bodies can carry non-strings; these must not throw a 500.
    const r = validateAddress({ address: 123, city: { x: 1 }, state: null, zip: undefined });
    expect(r).toEqual({ ok: true, clean: {} });
  });

  it('caps overly long street and city', () => {
    const long = 'x'.repeat(300);
    const r = validateAddress({ address: long, city: long });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.clean.address!.length).toBe(200);
      expect(r.clean.city!.length).toBe(200);
    }
  });
});
