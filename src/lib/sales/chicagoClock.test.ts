// Every period boundary runs on the company's clock (America/Chicago), whatever
// the time zone of the server (UTC on Vercel) or the rep's phone (Eastern).
// Each block sets process.env.TZ to the zone in its title.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AE1, noonUtc, sale, useTimeZone } from '@/lib/pay/moneyDateFixtures';
import { summarizePay } from '@/lib/dashboard/repSummary';
import { buildWidgetData } from '@/lib/app/shellExtras';
import { chicagoTodayKey, latestSaleDayKey, parseSaleDateInput } from '@/lib/sales/saleDate';
import { computeHistory, dayKey } from '@/lib/leaderboard/history';
import { periodBounds, chicagoMonthBounds } from '@/lib/leaderboard/periods';
import { chicagoMonthKey, currentMonth, isCurrentMonth } from '@/lib/sales/monthWindow';

describe('[TZ=America/New_York] dashboard + widget at 00:30 ET Nov 1 (23:30 CT Oct 31)', () => {
  useTimeZone('America/New_York');
  const now = new Date('2026-11-01T04:30:00Z');
  const october = () => [
    sale({ saleDate: noonUtc('2026-10-31'), installDate: noonUtc('2026-10-31') }),
    sale({ saleDate: noonUtc('2026-10-30'), installDate: noonUtc('2026-10-30') }),
  ];

  it('est. pay is October (Chicago): 2 x 67.5 = 135, summed exact', () => {
    expect(summarizePay(october(), new Map(), AE1, now).estThisMonth).toBe(135);
  });

  it('the month count uses the same month as the estimate (October -> 2, was 0)', () => {
    expect(summarizePay(october(), new Map(), AE1, now).monthCount).toBe(2);
  });

  it('the widget says October with 2 sales, beside October est. pay', () => {
    const pay = summarizePay(october(), new Map(), AE1, now);
    const widget = buildWidgetData({ uidHash: 'x', estThisMonth: pay.estThisMonth, hasPlan: true, monthCount: pay.monthCount, standing: null, now });
    expect([widget.periodLabel, widget.salesMtd, widget.estPayMtd]).toEqual(['October', 2, 135]);
  });

  it('the Sales page month is Chicago\'s too', () => {
    expect(currentMonth(now)).toEqual({ year: 2026, month: 9 });
    expect(isCurrentMonth({ year: 2026, month: 9 }, now)).toBe(true);
  });
});

describe('[TZ=UTC] the no-future-dates check uses the Chicago day, not the server UTC day', () => {
  useTimeZone('UTC');
  afterEach(() => vi.useRealTimers());

  it.each([
    ['20:00 CDT Oct 17, sale dated Oct 18 (tomorrow in Chicago)', '2026-10-18T01:00:00Z', '2026-10-18', false],
    ['19:30 CDT Oct 31, sale dated Nov 1 (next month in Chicago)', '2026-11-01T00:30:00Z', '2026-11-01', false],
    ['20:00 CST Dec 31, sale dated Jan 1 2027 (next year)', '2027-01-01T02:00:00Z', '2027-01-01', false],
    ['10:00 CDT Oct 17, sale dated Oct 17 (control)', '2026-10-17T15:00:00Z', '2026-10-17', true],
    ['20:00 CDT Oct 17, sale dated Oct 17 (still today in Chicago)', '2026-10-18T01:00:00Z', '2026-10-17', true],
  ])('%s', (_label, instant, input, ok) => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(instant));
    expect(parseSaleDateInput(input).ok).toBe(ok);
  });

  it('an Eastern rep after midnight ET may date a sale their own today (one day past Chicago)', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-01T04:30:00Z')); // 00:30 ET Nov 1, 23:30 CT Oct 31
    expect(parseSaleDateInput('2026-11-01', { clientToday: '2026-11-01' }).ok).toBe(true);
    expect(parseSaleDateInput('2026-11-01').ok).toBe(false);
  });

  it('a phone claiming more than one day ahead is ignored', () => {
    const now = new Date('2026-10-17T15:00:00Z');
    expect(latestSaleDayKey('2026-10-18', now)).toBe('2026-10-18');
    expect(latestSaleDayKey('2026-10-19', now)).toBe('2026-10-17');
    expect(latestSaleDayKey('2026-10-16', now)).toBe('2026-10-17');
    expect(latestSaleDayKey('junk', now)).toBe('2026-10-17');
  });

  it('chicagoTodayKey turns over at Chicago midnight', () => {
    expect(chicagoTodayKey(new Date('2026-11-01T04:59:00Z'))).toBe('2026-10-31');
    expect(chicagoTodayKey(new Date('2026-11-01T05:00:00Z'))).toBe('2026-11-01');
  });
});

describe('[TZ=UTC] rank history runs on Chicago days, like every period', () => {
  useTimeZone('UTC');
  // Sat Oct 17 2026, 23:30 CDT = Sun Oct 18 00:30 EDT.
  const now = new Date('2026-10-18T04:30:00Z');

  it('today is the Chicago day', () => expect(dayKey(now)).toBe('2026-10-17'));

  it('a rep who sold Fri Oct 16 keeps a 1-day streak (was 0 on New York days)', () => {
    const record = { salesRepId: 'repA', saleDate: noonUtc('2026-10-16'), totalPoints: 3 };
    const start = periodBounds('week', now)!.start;
    const history = computeHistory({ periodSales: [record], allSales: [record], currentRanks: new Map([['repA', 1]]), periodStartKey: dayKey(start), metric: 'totalPoints', now });
    expect(history.get('repA')!.streakDays).toBe(1);
  });

  it('the 7-day spark is Chicago Oct 11-17, not New York Oct 12-18', () => {
    const record = { salesRepId: 'repA', saleDate: noonUtc('2026-10-12'), totalPoints: 3 };
    const start = periodBounds('week', now)!.start; // Sun Oct 11
    const history = computeHistory({ periodSales: [record], allSales: [record], currentRanks: new Map([['repA', 1]]), periodStartKey: dayKey(start), metric: 'totalPoints', now });
    expect(history.get('repA')!.spark[0]).toBeNull(); // Oct 11: nothing sold yet
  });
});

describe('[TZ=UTC] period math across DST, year end and leap February', () => {
  useTimeZone('UTC');
  it.each([
    ['week spanning DST end (Nov 1 2026)', 'week', '2026-11-04T17:00:00Z', '2026-11-01T05:00:00.000Z', '2026-11-08T06:00:00.000Z'],
    ['week spanning DST start (Mar 8 2026)', 'week', '2026-03-10T17:00:00Z', '2026-03-08T06:00:00.000Z', '2026-03-15T05:00:00.000Z'],
    ['month at 23:30 CST Dec 31 is December', 'month', '2027-01-01T05:30:00Z', '2026-12-01T06:00:00.000Z', '2027-01-01T06:00:00.000Z'],
    ['leap Feb 2028', 'month', '2028-02-29T23:00:00Z', '2028-02-01T06:00:00.000Z', '2028-03-01T06:00:00.000Z'],
  ])('%s', (_label, period, instant, start, end) => {
    const bounds = periodBounds(period as 'week', new Date(instant))!;
    expect([bounds.start.toISOString(), bounds.end.toISOString()]).toEqual([start, end]);
  });

  it('chicagoMonthBounds Dec -> Jan', () => {
    const bounds = chicagoMonthBounds({ year: 2026, month: 11 });
    expect(bounds.end.toISOString()).toBe('2027-01-01T06:00:00.000Z');
    expect(chicagoMonthKey(new Date('2027-01-01T05:59:00Z'))).toEqual({ year: 2026, month: 11 });
  });
});
