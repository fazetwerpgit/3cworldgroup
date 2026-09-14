import { describe, expect, it } from 'vitest';
import type { FiberOrder } from '@/types/fiberOrder';
import {
  attachLoggedCustomerNames,
  matchFiberOrdersToSales,
  normalizeAddress,
} from './matchSales';

function order(overrides: Partial<FiberOrder> = {}): FiberOrder {
  return {
    id: 'order-1',
    status: 'pending_install',
    rawStatus: 'Pending Installation',
    repDealerId: 'dealer-1',
    repName: 'Rep One',
    matchedUserId: 'rep-1',
    orderDate: null,
    estInstallDate: null,
    activationDate: null,
    cancellationDate: null,
    deactivationDate: null,
    fiberPlan: null,
    mrc: null,
    address: '5780 Hall St SE',
    unit: null,
    city: 'Grand Rapids',
    state: 'MI',
    zip: '49546',
    breakageReason: null,
    breakageNotes: null,
    customerName: null,
    sourceSheet: 'Pending Installation',
    reportReceivedAt: '2026-08-24T00:00:00.000Z',
    updatedAt: '2026-08-24T00:00:00.000Z',
    ...overrides,
  };
}

describe('normalizeAddress', () => {
  it('removes diacritics and punctuation, normalizes case, and collapses spaces', () => {
    expect(normalizeAddress('  5780 Háll St.  SE, Apt #2  ')).toBe('5780 hall st se apt 2');
    expect(normalizeAddress(null)).toBe('');
    expect(normalizeAddress(undefined)).toBe('');
  });
});

describe('attachLoggedCustomerNames', () => {
  it('matches only a sale logged by the order representative', () => {
    const orders = [order()];
    const result = attachLoggedCustomerNames(orders, [
      {
        salesRepId: 'other-rep',
        customerName: 'Wrong Customer',
        customerAddress: '5780 Hall St SE, Grand Rapids MI',
      },
    ]);

    expect(result[0].loggedCustomerName).toBeNull();
    expect(result).not.toBe(orders);
  });

  it('matches address prefixes in either direction', () => {
    const result = attachLoggedCustomerNames(
      [order(), order({ id: 'order-2', address: '5780 Hall St SE, Grand Rapids MI' })],
      [
        {
          salesRepId: 'rep-1',
          customerName: '  Hall Customer  ',
          customerAddress: '5780 Hall St SE',
        },
      ],
    );

    expect(result.map((item) => item.loggedCustomerName)).toEqual(['Hall Customer', 'Hall Customer']);
  });

  it('uses the latest created sale when multiple sales match', () => {
    const result = attachLoggedCustomerNames([order()], [
      {
        salesRepId: 'rep-1',
        customerName: 'Old Customer',
        customerAddress: '5780 Hall St SE',
        createdAt: new Date('2026-08-20T00:00:00.000Z'),
      },
      {
        salesRepId: 'rep-1',
        customerName: 'New Customer',
        customerAddress: '5780 Hall St SE, Grand Rapids MI',
        createdAt: new Date('2026-08-24T00:00:00.000Z'),
      },
    ]);

    expect(result[0].loggedCustomerName).toBe('New Customer');
  });

  it('does not match short or empty addresses', () => {
    const sales = [{
      salesRepId: 'rep-1',
      customerName: 'Customer',
      customerAddress: '123',
    }];

    expect(attachLoggedCustomerNames([order({ address: '123' })], sales)[0].loggedCustomerName).toBeNull();
    expect(attachLoggedCustomerNames([order({ address: '' })], sales)[0].loggedCustomerName).toBeNull();
    expect(attachLoggedCustomerNames([order()], [
      { ...sales[0], customerAddress: '' },
    ])[0].loggedCustomerName).toBeNull();
  });

  it('does not attach an empty customer name and clears unmatched names', () => {
    const result = attachLoggedCustomerNames([
      order({ loggedCustomerName: 'stale' }),
      order({ id: 'order-2', matchedUserId: null, loggedCustomerName: 'stale' }),
    ], [
      {
        salesRepId: 'rep-1',
        customerName: '   ',
        customerAddress: '5780 Hall St SE',
      },
    ]);

    expect(result.map((item) => item.loggedCustomerName)).toEqual([null, null]);
  });
});

describe('matchFiberOrdersToSales', () => {
  it('maps a sale to a matching fiber order by address', () => {
    const matchingOrder = order();

    expect(matchFiberOrdersToSales([
      { id: 'sale-1', customerAddress: '5780 Hall St SE, Grand Rapids MI' },
    ], [matchingOrder])).toEqual(new Map([['sale-1', matchingOrder]]));
  });

  it('prefers a breakage order over an active order at the same address', () => {
    const activeOrder = order({ id: 'active-order', status: 'active' });
    const breakageOrder = order({ id: 'breakage-order', status: 'breakage' });

    expect(matchFiberOrdersToSales([
      { id: 'sale-1', customerAddress: '5780 Hall St SE' },
    ], [activeOrder, breakageOrder]).get('sale-1')).toBe(breakageOrder);
  });

  it('uses the latest order date when no breakage order matches', () => {
    const olderOrder = order({ id: 'older-order', orderDate: '2026-08-20' });
    const newerOrder = order({ id: 'newer-order', orderDate: '2026-08-24' });

    expect(matchFiberOrdersToSales([
      { id: 'sale-1', customerAddress: '5780 Hall St SE' },
    ], [olderOrder, newerOrder]).get('sale-1')).toBe(newerOrder);
  });

  it('omits sales with a short or empty address or missing id', () => {
    const matchingOrder = order();
    const result = matchFiberOrdersToSales([
      { id: 'short-address', customerAddress: '123' },
      { id: 'empty-address', customerAddress: '' },
      { id: 'missing-address' },
      { customerAddress: '5780 Hall St SE' },
    ], [matchingOrder]);

    expect(result).toEqual(new Map());
  });

  it('does not match unrelated addresses', () => {
    const result = matchFiberOrdersToSales([
      { id: 'sale-1', customerAddress: '100 Main St' },
    ], [order()]);

    expect(result).toEqual(new Map());
  });
});

describe('same-day re-order at one address', () => {
  it('prefers the live order over the cancelled one, whichever came first', () => {
    // Rosaria Lepo, 54806 Ashley Lauren Dr: the carrier opened two orders on
    // Jul 31, cancelled one the same day, and installed the other on Sep 12.
    const sale = { id: 's1', customerAddress: '54806 Ashley Lauren Dr Macomb, MI' };
    const dead = { id: 'dead', status: 'cancelled', orderDate: '2026-07-31', address: '54806 ASHLEY LAUREN DR' } as FiberOrder;
    const live = { id: 'live', status: 'active', orderDate: '2026-07-31', address: '54806 ASHLEY LAUREN DR' } as FiberOrder;

    expect(matchFiberOrdersToSales([sale], [dead, live]).get('s1')?.id).toBe('live');
    expect(matchFiberOrdersToSales([sale], [live, dead]).get('s1')?.id).toBe('live');
  });
});
