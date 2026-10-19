import { describe, expect, it } from 'vitest';
import { getMinutesUntil, getNextOccurrenceDateNumber, getWeekStripDays, isPastOccurrence } from './callTiming';

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

describe('week strip dates', () => {
  // Sunday Oct 18 2026, 10:00 CT (15:00 UTC).
  const sunday = new Date('2026-10-18T15:00:00Z');

  it('dates days earlier in the week at their next occurrence, not last week', () => {
    expect(getNextOccurrenceDateNumber('monday', sunday)).toBe('19');
    expect(getNextOccurrenceDateNumber('saturday', sunday)).toBe('24');
    expect(getNextOccurrenceDateNumber('sunday', sunday)).toBe('18');
  });

  it('uses the Central date, not UTC, late in the evening', () => {
    // Sunday Oct 18, 23:30 CT is already Monday in UTC.
    const lateSunday = new Date('2026-10-19T04:30:00Z');
    expect(getNextOccurrenceDateNumber('sunday', lateSunday)).toBe('18');
    expect(getNextOccurrenceDateNumber('monday', lateSunday)).toBe('19');
  });

  it('rolls over month ends', () => {
    // Friday Oct 30 2026 CT.
    const friday = new Date('2026-10-30T15:00:00Z');
    expect(getNextOccurrenceDateNumber('monday', friday)).toBe('2');
    expect(getNextOccurrenceDateNumber('thursday', friday)).toBe('5');
  });

  it('starts the strip at today so dates run in order', () => {
    expect(getWeekStripDays('sunday')).toEqual([
      'sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday',
    ]);
    expect(getWeekStripDays('monday')[0]).toBe('monday');
  });
});
