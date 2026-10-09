import { describe, expect, it } from 'vitest';
import { firstName, firstNameLastInitial, normalizeOrderNumber, orderNumberRawVariants } from './orderNumber';

describe('normalizeOrderNumber', () => {
  it('trims, uppercases and drops spaces and dashes', () => {
    expect(normalizeOrderNumber(' tmo-123 45 ')).toBe('TMO12345');
    expect(normalizeOrderNumber('TMO12345')).toBe('TMO12345');
  });

  it('reads blank and non-text as no order number', () => {
    expect(normalizeOrderNumber('  - ')).toBe('');
    expect(normalizeOrderNumber(null)).toBe('');
    expect(normalizeOrderNumber(undefined)).toBe('');
  });
});

describe('orderNumberRawVariants', () => {
  it('covers the typed, trimmed, cased and normalized spellings once each', () => {
    expect(orderNumberRawVariants(' ord-1001 ')).toEqual([' ord-1001 ', 'ord-1001', 'ORD-1001', 'ORD1001']);
  });

  it('is empty when there is no order number', () => {
    expect(orderNumberRawVariants('  ')).toEqual([]);
  });
});

describe('names', () => {
  it('shortens a rep to first name and last initial', () => {
    expect(firstNameLastInitial('Dana  Whitfield')).toBe('Dana W.');
    expect(firstNameLastInitial('Cher')).toBe('Cher');
    expect(firstNameLastInitial('')).toBe('');
  });

  it("takes a customer's first name", () => {
    expect(firstName(' Maria Lopez ')).toBe('Maria');
    expect(firstName(undefined)).toBe('');
  });
});
