import { describe, expect, it } from 'vitest';
import { estimateDollars, formatEstimate } from '@/lib/pay/estimate';

describe('estimateDollars: round down once, never overstate', () => {
  it.each([
    [67.5, 67],
    [135, 135],
    [975, 975],
    [1234.6, 1234],
    [-320.4, -321],
    [-67.5, -68],
    [0, 0],
    [0.1 + 0.2 + 0.7, 1], // float noise just under a whole dollar is that dollar
  ])('%s -> %s', (value, whole) => expect(estimateDollars(value)).toBe(whole));

  it('never returns -0 or NaN', () => {
    expect(Object.is(estimateDollars(-0), 0)).toBe(true);
    expect(estimateDollars(Number.NaN)).toBe(0);
  });

  it('formats with a minus sign below zero', () => {
    expect(formatEstimate(1234.99)).toBe('$1,234');
    expect(formatEstimate(-67.5)).toBe('−$68');
  });
});
