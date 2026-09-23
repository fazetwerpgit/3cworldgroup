import { describe, expect, it } from 'vitest';
import { firstRescheduleDay, missedInstallDay, nextDay, rescheduleDayError } from './rescheduleDay';

describe('missedInstallDay', () => {
  const chicagoNoon = new Date('2026-09-19T17:00:00Z');

  it("takes the carrier's day in any stored shape", () => {
    expect(missedInstallDay('2026-09-19', '2026-09-15')).toBe('2026-09-19');
    expect(missedInstallDay(chicagoNoon.toISOString(), '2026-09-15')).toBe('2026-09-19');
    expect(missedInstallDay({ toDate: () => chicagoNoon }, '2026-09-15')).toBe('2026-09-19');
    expect(missedInstallDay(chicagoNoon, '2026-09-15')).toBe('2026-09-19');
  });

  it("falls back to the sale's date only when the carrier gave none", () => {
    expect(missedInstallDay(null, '2026-09-15')).toBe('2026-09-15');
    expect(missedInstallDay('not a date', '2026-09-15')).toBe('2026-09-15');
    expect(missedInstallDay(undefined, undefined)).toBe('');
  });
});

describe('firstRescheduleDay', () => {
  it('is the day after the miss, or the sale day when that is later', () => {
    expect(nextDay('2026-09-30')).toBe('2026-10-01');
    expect(firstRescheduleDay('2026-09-19', '2026-09-14')).toBe('2026-09-20');
    expect(firstRescheduleDay('2026-09-10', '2026-09-14')).toBe('2026-09-14');
    expect(firstRescheduleDay('', '2026-09-14')).toBe('2026-09-14');
  });
});

describe('rescheduleDayError', () => {
  it('needs a day after the missed one', () => {
    expect(rescheduleDayError('', '2026-09-19')).toBe('Pick the install day.');
    expect(rescheduleDayError('2026-09-19', '2026-09-19')).toBe('Pick a day after the missed one.');
    expect(rescheduleDayError('2026-09-18', '2026-09-19')).toBe('Pick a day after the missed one.');
    expect(rescheduleDayError('2026-09-20', '2026-09-19')).toBeNull();
    expect(rescheduleDayError('2026-09-01', '')).toBeNull();
  });
});
