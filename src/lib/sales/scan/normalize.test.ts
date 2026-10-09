import { describe, expect, it } from 'vitest';
import {
  cleanIsoDate,
  cleanOrderNumber,
  clockGap,
  joinAddress,
  matchCarrier,
  matchPlanId,
  planTextMbps,
  statusBarMinutes,
  toFormFields,
} from './normalize';
import { parseScanResponse } from './extract';

describe('matchCarrier', () => {
  it.each([
    ['T-Mobile Fiber', 'tfiber'],
    ['T-Fiber', 'tfiber'],
    ['TFiber Home Internet', 'tfiber'],
    ['AT&T Fiber', 'att'],
    ['AT & T', 'att'],
    ['Frontier Communications', 'frontier'],
    ['Xfinity', 'xfinity'],
    ['Comcast Business', 'xfinity'],
    ['Spectrum', null],
    ['', null],
  ])('%s → %s', (text, company) => expect(matchCarrier(text)).toBe(company));
});

describe('planTextMbps / matchPlanId', () => {
  it.each([
    ['Fiber 1 Gig', 1000],
    ['2 GIG', 2000],
    ['Internet 1000', 1000],
    ['Fiber 500', 500],
    ['300 Mbps', 300],
    ['Gigabit', 1000],
    ['Fiber Internet', null],
  ])('%s → %s Mbps', (text, mbps) => expect(planTextMbps(text)).toBe(mbps));

  it('picks the one internet plan of that company at that speed', () => {
    expect(matchPlanId('tfiber', 'Fiber 2 Gig')).toBe('tfiber-2gig');
    expect(matchPlanId('tfiber', 'Fiber 300')).toBe('tfiber-300');
    expect(matchPlanId('att', 'AT&T Internet 1000')).toBe('att-1gig');
    expect(matchPlanId('frontier', 'Fiber 5 Gig')).toBe('frontier-5gig');
  });

  it('leaves the plan empty with no speed or no plan at that speed', () => {
    expect(matchPlanId('tfiber', 'Fiber Internet')).toBeNull();
    expect(matchPlanId('xfinity', 'Xfinity 300')).toBeNull();
    expect(matchPlanId('tfiber', undefined)).toBeNull();
  });
});

describe('field cleanup', () => {
  it('joins the address into the one line the form takes', () => {
    expect(joinAddress({ street: '9 Oak St', unit: '', city: 'Waco', state: 'tx', zip: '76701', confidence: 'high' })).toBe(
      '9 Oak St, Waco, TX 76701'
    );
    expect(joinAddress({ street: '9 Oak St Apt 2', unit: 'Apt 2', city: 'Waco', state: 'TX', zip: '', confidence: 'high' })).toBe(
      '9 Oak St Apt 2, Waco, TX'
    );
  });

  it('keeps only real calendar days', () => {
    expect(cleanIsoDate('2026-10-02')).toBe('2026-10-02');
    expect(cleanIsoDate('2026-02-30')).toBeNull();
    expect(cleanIsoDate('10/02/2026')).toBeNull();
  });

  it('strips an order label and needs a digit', () => {
    expect(cleanOrderNumber('Order #: TF-100234')).toBe('TF-100234');
    expect(cleanOrderNumber('#A12')).toBe('A12');
    expect(cleanOrderNumber('Pending')).toBeNull();
  });
});

describe('status-bar clock', () => {
  it.each([
    ['9:41', 581],
    ['09:41', 581],
    ['21:41', 1301],
    ['9:41 PM', 1301],
    ['9:41 a.m.', 581],
    ['12:05 AM', 5],
    ['0:03', 3],
    ['', null],
    ['9:61', null],
    ['24:00', null],
    ['13:00 PM', null],
    ['Oct 6', null],
  ])('%s -> %s minutes past midnight', (text, minutes) => expect(statusBarMinutes(text)).toBe(minutes));

  it('measures the gap on a 12-hour dial, across noon and midnight', () => {
    expect(clockGap(statusBarMinutes('9:41')!, statusBarMinutes('9:50')!)).toBe(9);
    expect(clockGap(statusBarMinutes('23:58')!, statusBarMinutes('00:03')!)).toBe(5);
    expect(clockGap(statusBarMinutes('11:58')!, statusBarMinutes('12:03')!)).toBe(5);
    // A 12-hour clock without AM/PM may be either half of the day.
    expect(clockGap(statusBarMinutes('9:41')!, statusBarMinutes('21:45')!)).toBe(4);
    expect(clockGap(statusBarMinutes('9:00')!, statusBarMinutes('9:31')!)).toBe(31);
  });

  it('comes back from the reader as minutes past midnight, and not at all when unsure or missing', () => {
    expect(toFormFields({ statusBarTime: { value: '9:41', confidence: 'high' } })).toEqual({
      statusBarTime: { value: '581', confidence: 'high' },
    });
    expect(toFormFields({ statusBarTime: { value: '12:00', confidence: 'medium' } }).statusBarTime?.value).toBe('720');
    expect(toFormFields({ statusBarTime: { value: '9:41', confidence: 'low' } })).toEqual({});
    expect(toFormFields({ statusBarTime: { value: '', confidence: 'low' } })).toEqual({});
    expect(parseScanResponse(JSON.stringify({ statusBarTime: { value: '21:41', confidence: 'high' } }))).toEqual({
      statusBarTime: { value: '1301', confidence: 'high' },
    });
  });
});
