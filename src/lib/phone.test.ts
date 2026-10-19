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
  it('dials a US number as +1 and its ten digits', () => {
    expect(telHref('(515) 555-0123')).toBe('tel:+15155550123');
    expect(telHref('1-515-555-0123')).toBe('tel:+15155550123');
  });

  it('dials only the first number when a rep typed an extension or a second phone', () => {
    expect(telHref('512-555-0142 ext 12')).toBe('tel:+15125550142');
    expect(telHref('512-555-0142 x12')).toBe('tel:+15125550142');
    expect(telHref('512-555-0142 / 512-555-0199')).toBe('tel:+15125550142');
    expect(telHref('5125550142, 5125550199')).toBe('tel:+15125550142');
  });

  it('keeps an international number with its leading +', () => {
    expect(telHref(' +44 20 7946 0958 ')).toBe('tel:+442079460958');
  });
});
