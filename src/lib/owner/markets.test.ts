import { describe, expect, it } from 'vitest';
import type { Sale } from '@/types';
import { periodBounds } from '@/lib/leaderboard/periods';
import { addressState, countsForMonth, repHomeMarkets, summarizeMarkets, zipState } from './markets';

describe('addressState', () => {
  it.each([
    ['123 Main St, East Lansing, MI 48823', 'MI'],
    ['123 Main St, East Lansing, Michigan 48823', 'MI'],
    ['123 Main St, East Lansing Michigan', 'MI'],
    ['4500 Elm Dr, Killeen, TX', 'TX'],
    ['4500 Elm Dr, Killeen, TX 76542-1234', 'TX'],
    ['4500 ELM DR KILLEEN TX 76542, USA', 'TX'],
    ['123 main st, east lansing, mi 48823', 'MI'],
    ['123 main st lansing mi', 'MI'],
    ['900 Oak Ave, Harker Heights, texas', 'TX'],
    ['48823', 'MI'],
    ['123 Main St 76542', 'TX'],
    ['12 Hill Rd, Charleston, West Virginia 25301', 'WV'],
    ['55 Pine St, Washington 48094', 'MI'],
  ])('%s -> %s', (address, expected) => {
    expect(addressState(address)).toBe(expected);
  });

  it.each([
    ['', null],
    ['   ', null],
    [undefined, null],
    [null, null],
    ['123 Main St', null],
    // A street suffix that is also a state code is not a state on its own.
    ['1234 Maple Ct', null],
    // A direction is not Nebraska.
    ['1234 Dexter Ave NE', null],
    // A leading 5-digit street number is not a ZIP.
    ['12345 Main St', null],
  ])('%s -> %s', (address, expected) => {
    expect(addressState(address)).toBe(expected);
  });

  it('takes an ambiguous code after a comma', () => {
    expect(addressState('1 Elm St, Denver, CO')).toBe('CO');
    expect(addressState('1 Elm St, Omaha, NE')).toBe('NE');
    expect(addressState('1 Elm St Omaha NE 68102')).toBe('NE');
  });
});

describe('zipState', () => {
  it('maps ZIP prefixes to states', () => {
    expect(zipState('48823')).toBe('MI');
    expect(zipState('49002')).toBe('MI');
    expect(zipState('76542')).toBe('TX');
    expect(zipState('88510')).toBe('TX');
    expect(zipState('50310')).toBe('IA');
    expect(zipState('00601')).toBeNull();
    expect(zipState('4882')).toBeNull();
  });
});

// Oct 2026 in Chicago (CDT): Oct 1 05:00Z to Nov 1 05:00Z.
const NOW = new Date('2026-10-09T17:00:00Z');
const OCT = periodBounds('month', NOW)!;

let n = 0;
const sale = (over: Partial<Sale> & { saleDate?: Date | string }): Sale =>
  ({
    id: `s${(n += 1)}`,
    salesRepId: 'r1',
    status: 'approved',
    customerAddress: '1 Main St, Lansing, MI 48823',
    saleDate: new Date('2026-10-05T15:00:00Z'),
    ...over,
  }) as unknown as Sale;

describe('countsForMonth (the leaderboard rule)', () => {
  it('counts approved sales dated inside the Chicago month', () => {
    expect(countsForMonth(sale({}), OCT)).toBe(true);
    // 11:30pm Oct 31 in Chicago is still October.
    expect(countsForMonth(sale({ saleDate: new Date('2026-11-01T04:30:00Z') }), OCT)).toBe(true);
    // 11:30pm Sep 30 in Chicago is September.
    expect(countsForMonth(sale({ saleDate: new Date('2026-10-01T04:30:00Z') }), OCT)).toBe(false);
  });

  it('leaves out pending, rejected and cancelled sales and undated ones', () => {
    for (const status of ['pending', 'rejected', 'cancelled'] as const) {
      expect(countsForMonth(sale({ status }), OCT)).toBe(false);
    }
    expect(countsForMonth(sale({ saleDate: undefined }), OCT)).toBe(false);
  });
});

describe('summarizeMarkets', () => {
  it('counts the month by state, biggest first, with full names', () => {
    const sales = [
      sale({}),
      sale({ customerAddress: '2 Oak St, Killeen, TX 76542' }),
      sale({ customerAddress: '3 Oak St, Killeen, TX 76542' }),
      sale({ customerAddress: '4 Elm, Okemos, Michigan' }),
      sale({ customerAddress: '5 Elm, Waco, TX' }),
      sale({ status: 'cancelled', customerAddress: '6 Elm, Waco, TX' }),
      sale({ status: 'pending' }),
      sale({ saleDate: new Date('2026-09-20T15:00:00Z') }),
    ];
    expect(summarizeMarkets(sales, OCT)).toEqual({
      markets: [
        { market: 'Texas', count: 3 },
        { market: 'Michigan', count: 2 },
      ],
      total: 5,
      placedByRep: 0,
    });
  });

  it('places an unparseable address by where that rep sells, else Other last', () => {
    const sales = [
      sale({ salesRepId: 'wil', customerAddress: '1 Main St, Lansing, MI 48823' }),
      sale({ salesRepId: 'wil', customerAddress: '2 Main St, Lansing, MI 48823' }),
      sale({ salesRepId: 'wil', customerAddress: '3 Main St' }),
      sale({ salesRepId: 'tx', customerAddress: '4 Oak, Waco, TX' }),
      sale({ salesRepId: 'new', customerAddress: '' }),
    ];
    const summary = summarizeMarkets(sales, OCT);
    expect(summary.markets).toEqual([
      { market: 'Michigan', count: 3 },
      { market: 'Texas', count: 1 },
      { market: 'Other', count: 1 },
    ]);
    expect(summary.total).toBe(5);
    expect(summary.placedByRep).toBe(1);
  });

  it('shows no Other row when every sale is placed', () => {
    const summary = summarizeMarkets([sale({})], OCT);
    expect(summary.markets.map((m) => m.market)).toEqual(['Michigan']);
  });

  it('adds a new state automatically', () => {
    const summary = summarizeMarkets([sale({ customerAddress: '9 Peach St, Macon, GA 31201' })], OCT);
    expect(summary.markets).toEqual([{ market: 'Georgia', count: 1 }]);
  });

  it('is empty for a month with no approved sales', () => {
    expect(summarizeMarkets([sale({ status: 'pending' })], OCT)).toEqual({ markets: [], total: 0, placedByRep: 0 });
  });
});

describe('repHomeMarkets', () => {
  it("prefers the rep's states this month, then their whole book", () => {
    const sales = [
      sale({ salesRepId: 'a', customerAddress: '1 Oak, Waco, TX', saleDate: new Date('2026-06-01T15:00:00Z') }),
      sale({ salesRepId: 'a', customerAddress: '2 Oak, Waco, TX', saleDate: new Date('2026-06-02T15:00:00Z') }),
      sale({ salesRepId: 'a', customerAddress: '3 Main, Lansing, MI' }),
      sale({ salesRepId: 'b', customerAddress: '4 Oak, Waco, TX', saleDate: new Date('2026-07-01T15:00:00Z') }),
      sale({ salesRepId: 'c', customerAddress: 'no state here' }),
    ];
    const home = repHomeMarkets(sales, OCT);
    expect(home.get('a')).toBe('MI');
    expect(home.get('b')).toBe('TX');
    expect(home.has('c')).toBe(false);
  });
});
