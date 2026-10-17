import { describe, expect, it } from 'vitest';
import { swipeOffset } from './MobileThread';

describe('swipeOffset', () => {
  it('tracks the finger up to the reply threshold, then resists', () => {
    expect(swipeOffset(-20)).toBe(0);
    expect(swipeOffset(30)).toBe(30);
    expect(swipeOffset(56)).toBe(56);
    expect(swipeOffset(76)).toBeCloseTo(63);
    expect(swipeOffset(400)).toBe(88);
  });
});
