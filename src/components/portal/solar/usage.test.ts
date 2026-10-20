// The usage helper's math: monthly, daily and twelve-month entries become the
// annual and monthly kWh, and the Aurora block carries them.
import { describe, expect, it } from 'vitest';
import {
  auroraText,
  cleanKwhDraft,
  EMPTY_USAGE,
  estimateUsage,
  normalizeUsage,
  parseKwh,
  usageBasis,
  type UsageEntry,
} from './usage';

const entry = (patch: Partial<UsageEntry>): UsageEntry => ({ ...EMPTY_USAGE, months: [...EMPTY_USAGE.months], ...patch });

const LEAD = { first: 'Ana', last: 'Ruiz', address: '12 Elm St', city: 'Fresno', state: 'ca', zip: '93701' };

describe('kWh field', () => {
  it('cleans what is typed', () => {
    expect(cleanKwhDraft('1,250 kWh')).toBe('1250');
    expect(cleanKwhDraft('32.')).toBe('32.');
    expect(cleanKwhDraft('32.45')).toBe('32.4');
    expect(cleanKwhDraft('007')).toBe('7');
    expect(cleanKwhDraft('.5')).toBe('0.5');
  });

  it('parses to a number, or null when blank or zero', () => {
    expect(parseKwh('1,250')).toBe(1250);
    expect(parseKwh('32.4')).toBe(32.4);
    expect(parseKwh('')).toBeNull();
    expect(parseKwh('0')).toBeNull();
    expect(parseKwh('.')).toBeNull();
    expect(parseKwh('999999')).toBe(99999);
  });
});

describe('estimateUsage', () => {
  it('is null until the chosen mode has a value', () => {
    expect(estimateUsage(entry({}))).toBeNull();
    expect(estimateUsage(entry({ mode: 'daily', monthly: 900 }))).toBeNull();
    expect(estimateUsage(entry({ mode: 'months' }))).toBeNull();
  });

  it('monthly kWh x 12', () => {
    expect(estimateUsage(entry({ monthly: 950 }))).toEqual({ annualKwh: 11400, monthlyKwh: 950, monthsEntered: 0 });
  });

  it('daily average x 365, then / 12', () => {
    expect(estimateUsage(entry({ mode: 'daily', daily: 30 }))).toEqual({ annualKwh: 10950, monthlyKwh: 913, monthsEntered: 0 });
  });

  it('sums all twelve months', () => {
    const months = [800, 700, 650, 600, 700, 900, 1200, 1300, 1100, 800, 700, 850];
    expect(estimateUsage(entry({ mode: 'months', months }))).toEqual({ annualKwh: 10300, monthlyKwh: 858, monthsEntered: 12 });
  });

  it('fills blank months with the average of the rest', () => {
    const months = [1000, null, 800, null, null, null, null, null, null, null, null, 900];
    expect(estimateUsage(entry({ mode: 'months', months }))).toEqual({ annualKwh: 10800, monthlyKwh: 900, monthsEntered: 3 });
  });
});

describe('usageBasis', () => {
  it('says how the estimate was reached', () => {
    const daily = entry({ mode: 'daily', daily: 32.5 });
    expect(usageBasis(daily, estimateUsage(daily)!)).toBe('Daily average 32.5 kWh x 365');
    const some = entry({ mode: 'months', months: [900, 1000, ...Array(10).fill(null)] });
    expect(usageBasis(some, estimateUsage(some)!)).toBe('Average of 2 of 12 months x 12');
  });
});

describe('auroraText', () => {
  it('lists the customer, address and totals', () => {
    const e = entry({ monthly: 1000 });
    expect(auroraText(LEAD, e, estimateUsage(e)!)).toBe(
      [
        'Customer: Ana Ruiz',
        'Address: 12 Elm St, Fresno, CA 93701',
        'Annual usage: 12,000 kWh (est.)',
        'Monthly average: 1,000 kWh',
        'Based on: Monthly kWh from the bill x 12',
      ].join('\n')
    );
  });

  it('adds the monthly values when entered', () => {
    const e = entry({ mode: 'months', months: [1200, null, 900, ...Array(9).fill(null)] });
    const text = auroraText(LEAD, e, estimateUsage(e)!);
    expect(text).toContain('Monthly kWh: Jan 1,200, Mar 900');
  });

  it('marks a blank name and address', () => {
    const e = entry({ monthly: 500 });
    const text = auroraText({ first: '', last: '', address: '', city: '', state: '', zip: '' }, e, estimateUsage(e)!);
    expect(text.split('\n').slice(0, 2)).toEqual(['Customer: -', 'Address: -']);
  });
});

describe('normalizeUsage', () => {
  it('reads back a stored entry and drops junk', () => {
    expect(normalizeUsage(undefined)).toEqual(EMPTY_USAGE);
    const back = normalizeUsage({ mode: 'months', monthly: -4, daily: 'x', months: [100, 'a', null, 5e9] });
    expect(back.mode).toBe('months');
    expect(back.monthly).toBeNull();
    expect(back.daily).toBeNull();
    expect(back.months.slice(0, 4)).toEqual([100, null, null, 99999]);
    expect(back.months).toHaveLength(12);
  });
});
