import { describe, expect, it } from 'vitest';
import { getMinutesUntil, isPastOccurrence } from './callTiming';

const call = { day: 'monday' as const, time: '09:00' };

describe('call timing', () => {
  it('keeps a call that started minutes ago joinable and next, not a week out', () => {
    const now = { day: 'monday' as const, minutes: 9 * 60 + 3 };
    expect(isPastOccurrence(call, now)).toBe(false);
    expect(getMinutesUntil(call, now)).toBe(-3);
  });

  it('marks the call done once the live window has passed', () => {
    const now = { day: 'monday' as const, minutes: 10 * 60 + 1 };
    expect(isPastOccurrence(call, now)).toBe(true);
    expect(getMinutesUntil(call, now)).toBeGreaterThan(6 * 1440);
  });

  it('counts down to a call later today', () => {
    expect(getMinutesUntil(call, { day: 'monday', minutes: 8 * 60 })).toBe(60);
  });
});
