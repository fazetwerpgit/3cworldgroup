import { describe, expect, it } from 'vitest';
import { displayPhone, formatPhone, telHref } from './phone';

describe('formatPhone', () => {
  it('formats a 10-digit US phone and drops anything else', () => {
    expect(formatPhone('+1 512.555.0142')).toBe('(512) 555-0142');
    expect(formatPhone('555-0142')).toBeNull();
  });
});

describe('displayPhone', () => {
  it('spaces out a phone stored as bare digits, the way reps type it', () => {
    expect(displayPhone('5155550123')).toBe('(515) 555-0123');
    expect(displayPhone('15155550123')).toBe('(515) 555-0123');
  });

  it('shows anything that is not a US number exactly as typed', () => {
    expect(displayPhone(' +44 20 7946 0958 ')).toBe('+44 20 7946 0958');
    expect(displayPhone('+')).toBe('+');
  });
});

describe('telHref', () => {
  it('dials the digits only', () => {
    expect(telHref('(515) 555-0123')).toBe('tel:5155550123');
  });
});
