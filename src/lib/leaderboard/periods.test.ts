import { describe, expect, it } from 'vitest';
import {
  chicagoMonthBounds,
  formatMonthParam,
  monthKeyFromParam,
  parseLeaderboardMonth,
  periodBounds,
} from './periods';

const inBounds = (date: Date, bounds: { start: Date; end: Date }) =>
  date.getTime() >= bounds.start.getTime() && date.getTime() < bounds.end.getTime();

// Sale dates are stored at the server's local noon: 12:00Z on a UTC host
// (Vercel), 17:00Z / 18:00Z on a host set to Chicago (CDT / CST).
const utcNoon = (day: string) => new Date(`${day}T12:00:00.000Z`);
const chicagoNoon = (day: string, offsetHours: 5 | 6) =>
  new Date(`${day}T${12 + offsetHours}:00:00.000Z`);

describe('chicagoMonthBounds', () => {
  it('runs Chicago midnight on the 1st to Chicago midnight on the next 1st', () => {
    expect(chicagoMonthBounds({ year: 2026, month: 9 })).toEqual({
      start: new Date('2026-10-01T05:00:00.000Z'),
      end: new Date('2026-11-01T05:00:00.000Z'),
    });
  });

  it('spans the spring DST change (March starts CST, ends CDT)', () => {
    expect(chicagoMonthBounds({ year: 2026, month: 2 })).toEqual({
      start: new Date('2026-03-01T06:00:00.000Z'),
      end: new Date('2026-04-01T05:00:00.000Z'),
    });
  });

  it('spans the fall DST change (November starts CDT, ends CST)', () => {
    expect(chicagoMonthBounds({ year: 2026, month: 10 })).toEqual({
      start: new Date('2026-11-01T05:00:00.000Z'),
      end: new Date('2026-12-01T06:00:00.000Z'),
    });
  });

  it('rolls December into January of the next year', () => {
    expect(chicagoMonthBounds({ year: 2025, month: 11 })).toEqual({
      start: new Date('2025-12-01T06:00:00.000Z'),
      end: new Date('2026-01-01T06:00:00.000Z'),
    });
  });

  it('matches the live month board for the current month', () => {
    const now = new Date('2026-10-13T15:00:00.000Z');
    expect(chicagoMonthBounds({ year: 2026, month: 9 })).toEqual(periodBounds('month', now));
  });

  it.each([
    { label: 'March (DST starts the 8th)', month: { year: 2026, month: 2 }, first: '2026-03-01', last: '2026-03-31', before: '2026-02-28', after: '2026-04-01', firstOffset: 6, lastOffset: 5 },
    { label: 'November (DST ends the 1st)', month: { year: 2026, month: 10 }, first: '2026-11-01', last: '2026-11-30', before: '2026-10-31', after: '2026-12-01', firstOffset: 6, lastOffset: 6 },
    { label: 'February', month: { year: 2026, month: 1 }, first: '2026-02-01', last: '2026-02-28', before: '2026-01-31', after: '2026-03-01', firstOffset: 6, lastOffset: 6 },
    { label: 'October', month: { year: 2026, month: 9 }, first: '2026-10-01', last: '2026-10-31', before: '2026-09-30', after: '2026-11-01', firstOffset: 5, lastOffset: 5 },
  ] as const)('keeps every local-noon sale date of $label in its month', ({ month, first, last, before, after, firstOffset, lastOffset }) => {
    const bounds = chicagoMonthBounds(month);
    expect(inBounds(utcNoon(first), bounds)).toBe(true);
    expect(inBounds(utcNoon(last), bounds)).toBe(true);
    expect(inBounds(chicagoNoon(first, firstOffset), bounds)).toBe(true);
    expect(inBounds(chicagoNoon(last, lastOffset), bounds)).toBe(true);
    expect(inBounds(utcNoon(before), bounds)).toBe(false);
    expect(inBounds(utcNoon(after), bounds)).toBe(false);
  });

  it('counts a late-night sale by the Chicago day, not the UTC day', () => {
    const october = chicagoMonthBounds({ year: 2026, month: 9 });
    // 11:30pm Oct 31 in Chicago is already Nov 1 in UTC.
    expect(inBounds(new Date('2026-11-01T04:30:00.000Z'), october)).toBe(true);
    expect(inBounds(new Date('2026-11-01T05:00:00.000Z'), october)).toBe(false);
  });
});

describe('parseLeaderboardMonth', () => {
  const now = new Date('2026-10-13T15:00:00.000Z');

  it('defaults to this month when absent', () => {
    expect(parseLeaderboardMonth(null, now)).toEqual({ ok: true, month: { year: 2026, month: 9 }, current: true });
    expect(parseLeaderboardMonth('', now)).toEqual({ ok: true, month: { year: 2026, month: 9 }, current: true });
  });

  it('accepts this month and past months', () => {
    expect(parseLeaderboardMonth('2026-10', now)).toEqual({ ok: true, month: { year: 2026, month: 9 }, current: true });
    expect(parseLeaderboardMonth('2026-09', now)).toEqual({ ok: true, month: { year: 2026, month: 8 }, current: false });
    expect(parseLeaderboardMonth('2025-12', now)).toEqual({ ok: true, month: { year: 2025, month: 11 }, current: false });
  });

  it('rejects future months', () => {
    expect(parseLeaderboardMonth('2026-11', now)).toEqual({ ok: false, error: 'month cannot be in the future' });
    expect(parseLeaderboardMonth('2027-01', now)).toMatchObject({ ok: false });
  });

  it('reads "this month" on the Chicago clock', () => {
    // 10pm Oct 31 in Chicago: November has begun in UTC but not at the office.
    const lateOctober = new Date('2026-11-01T03:00:00.000Z');
    expect(parseLeaderboardMonth('2026-11', lateOctober)).toMatchObject({ ok: false });
    expect(parseLeaderboardMonth(null, lateOctober)).toMatchObject({ ok: true, month: { year: 2026, month: 9 } });
  });

  it.each(['2026-13', '2026-00', '2026-1', '26-10', '2026/10', 'abc', '2026-10-01'])('rejects malformed %s', (value) => {
    expect(parseLeaderboardMonth(value, now)).toEqual({ ok: false, error: 'month must be YYYY-MM' });
  });
});

describe('month params', () => {
  it('round-trips YYYY-MM', () => {
    expect(formatMonthParam({ year: 2026, month: 0 })).toBe('2026-01');
    expect(formatMonthParam({ year: 2026, month: 11 })).toBe('2026-12');
    expect(monthKeyFromParam('2026-09')).toEqual({ year: 2026, month: 8 });
    expect(monthKeyFromParam(null)).toBeNull();
    expect(monthKeyFromParam('2026-13')).toBeNull();
  });
});
