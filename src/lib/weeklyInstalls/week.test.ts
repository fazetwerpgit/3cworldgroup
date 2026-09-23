import { describe, expect, it } from 'vitest';
import {
  addDays,
  chicagoHour,
  formatDay,
  formatRange,
  inRange,
  isDayKey,
  isSendHour,
  reportWeekFor,
  reportWeekFromStart,
  weekStartOf,
} from './week';

describe('weekly installs week bounds', () => {
  it('reports on the previous Sunday–Saturday from a Monday send', () => {
    const week = reportWeekFor(new Date('2026-09-21T13:00:00Z')); // Mon 8 AM CDT
    expect(week.last).toEqual({ from: '2026-09-13', to: '2026-09-19' });
    expect(week.sendDay).toBe('2026-09-21');
    expect(week.upcoming).toEqual({ from: '2026-09-21', to: '2026-09-26' });
  });

  it('uses the Chicago day, not the UTC day, late on a Saturday night', () => {
    // 03:30 UTC Sunday is still Saturday 10:30 PM in Chicago: that week is not over.
    const week = reportWeekFor(new Date('2026-09-20T03:30:00Z'));
    expect(week.last.from).toBe('2026-09-06');
  });

  it('keeps 7-day weeks across the spring-forward and fall-back Sundays', () => {
    // DST starts Sun Mar 8 2026, ends Sun Nov 1 2026.
    const spring = reportWeekFor(new Date('2026-03-16T13:00:00Z'));
    expect(spring.last).toEqual({ from: '2026-03-08', to: '2026-03-14' });
    const fall = reportWeekFor(new Date('2026-11-09T14:00:00Z'));
    expect(fall.last).toEqual({ from: '2026-11-01', to: '2026-11-07' });
    expect(addDays('2026-11-01', 7)).toBe('2026-11-08');
    expect(addDays('2026-03-08', 1)).toBe('2026-03-09');
  });

  it('spans a month and a year boundary', () => {
    expect(reportWeekFromStart('2026-12-27').last).toEqual({ from: '2026-12-27', to: '2027-01-02' });
    expect(weekStartOf('2027-01-01')).toBe('2026-12-27');
    expect(formatRange({ from: '2026-08-30', to: '2026-09-05' })).toBe('Aug 30–Sep 5');
    expect(formatRange({ from: '2026-09-13', to: '2026-09-19' })).toBe('Sep 13–19');
    expect(formatDay('2026-09-15')).toBe('Tue, Sep 15');
  });

  it('normalises any day to the Sunday of its week', () => {
    expect(reportWeekFromStart('2026-09-16').last.from).toBe('2026-09-13');
  });

  it('opens the send gate at exactly one of the two Monday UTC triggers', () => {
    // Summer (CDT, UTC-5): 13:00 UTC is 8 AM.
    expect(isSendHour(new Date('2026-09-21T13:00:00Z'))).toBe(true);
    expect(isSendHour(new Date('2026-09-21T14:00:00Z'))).toBe(false);
    // Winter (CST, UTC-6): 14:00 UTC is 8 AM.
    expect(isSendHour(new Date('2026-11-09T13:00:00Z'))).toBe(false);
    expect(isSendHour(new Date('2026-11-09T14:00:00Z'))).toBe(true);
    // Never on another weekday.
    expect(isSendHour(new Date('2026-09-22T13:00:00Z'))).toBe(false);
    expect(chicagoHour(new Date('2026-11-09T14:00:00Z'))).toBe(8);
  });

  it('validates day keys and ranges inclusively', () => {
    expect(isDayKey('2026-09-13')).toBe(true);
    expect(isDayKey('2026-02-31')).toBe(false);
    expect(isDayKey('9/13/2026')).toBe(false);
    const range = { from: '2026-09-13', to: '2026-09-19' };
    expect(inRange('2026-09-13', range)).toBe(true);
    expect(inRange('2026-09-19', range)).toBe(true);
    expect(inRange('2026-09-20', range)).toBe(false);
    expect(inRange(null, range)).toBe(false);
  });
});
