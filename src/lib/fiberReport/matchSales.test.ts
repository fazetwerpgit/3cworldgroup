import { describe, expect, it } from 'vitest';
import type { FiberOrder } from '@/types/fiberOrder';
import {
  attachLoggedCustomerNames,
  attachMatchedUserNames,
  doorOrders,
  foldLeftoverOrders,
  matchFiberOrdersToSales,
  matchFiberOrdersToSalesDetailed,
  orderMatchKey,
  normalizeAddress,
  ordersPlacedForSale,
  saleUnitId,
  unitId,
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

  it('shows an active order over an older breakage row at the same address', () => {
    // Missed on Sep 3, installed on Sep 9: the miss is history.
    const activeOrder = order({ id: 'active-order', status: 'active', estInstallDate: '2026-09-09', activationDate: '2026-09-09' });
    const breakageOrder = order({ id: 'breakage-order', status: 'breakage', estInstallDate: '2026-09-03' });

    for (const orders of [[activeOrder, breakageOrder], [breakageOrder, activeOrder]]) {
      expect(matchFiberOrdersToSales([
        { id: 'sale-1', customerAddress: '5780 Hall St SE' },
      ], orders).get('sale-1')).toBe(activeOrder);
    }
  });

  it('shows the missed install while the order still carries the missed day', () => {
    const staleOrder = order({ id: 'pending', orderDate: '2026-08-20', estInstallDate: '2026-09-03' });
    const breakageOrder = order({ id: 'breakage-order', status: 'breakage', estInstallDate: '2026-09-03' });

    for (const orders of [[staleOrder, breakageOrder], [breakageOrder, staleOrder]]) {
      expect(matchFiberOrdersToSales([
        { id: 'sale-1', customerAddress: '5780 Hall St SE' },
      ], orders).get('sale-1')).toBe(breakageOrder);
    }
  });

  it('shows the order the carrier rescheduled past the miss', () => {
    const rescheduled = order({ id: 'pending', orderDate: '2026-08-20', estInstallDate: '2026-09-10' });
    const breakageOrder = order({ id: 'breakage-order', status: 'breakage', estInstallDate: '2026-09-03' });

    for (const orders of [[rescheduled, breakageOrder], [breakageOrder, rescheduled]]) {
      expect(matchFiberOrdersToSales([
        { id: 'sale-1', customerAddress: '5780 Hall St SE' },
      ], orders).get('sale-1')).toBe(rescheduled);
    }
  });

  it('shows a new order placed after the miss, and a cancellation after it', () => {
    const breakageOrder = order({ id: 'breakage-order', status: 'breakage', estInstallDate: '2026-09-03' });
    const reordered = order({ id: 'reorder', orderDate: '2026-09-05' });
    const cancelled = order({ id: 'cancel', status: 'cancelled', orderDate: '2026-08-20', cancellationDate: '2026-09-04' });

    const pick = (orders: FiberOrder[]) =>
      matchFiberOrdersToSales([{ id: 'sale-1', customerAddress: '5780 Hall St SE' }], orders).get('sale-1');
    expect(pick([breakageOrder, reordered])).toBe(reordered);
    expect(pick([breakageOrder, cancelled])).toBe(cancelled);
  });

  it('keeps the latest of two misses, and the miss when its day is unreadable', () => {
    const first = order({ id: 'miss-1', status: 'breakage', estInstallDate: '2026-09-03' });
    const second = order({ id: 'miss-2', status: 'breakage', estInstallDate: '2026-09-10' });
    const unreadable = order({ id: 'miss-x', status: 'breakage', estInstallDate: null });
    const pending = order({ id: 'pending', estInstallDate: '2026-09-12' });

    const pick = (orders: FiberOrder[]) =>
      matchFiberOrdersToSales([{ id: 'sale-1', customerAddress: '5780 Hall St SE' }], orders).get('sale-1');
    expect(pick([second, first])).toBe(second);
    expect(pick([first, second])).toBe(second);
    expect(pick([pending, unreadable])).toBe(unreadable);
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

describe("an admin's saleLink", () => {
  const link = { by: 'admin-1', byName: 'Jacob', at: '2026-09-03T00:00:00.000Z' };

  it('excludes an order marked "not a sale" from the address match', () => {
    const dismissed = order({ id: 'dismissed', saleLink: { saleId: null, ...link } });

    expect(matchFiberOrdersToSales([{ id: 'sale-1', customerAddress: '5780 Hall St SE' }], [dismissed]).size).toBe(0);
  });

  it('joins a linked order to its sale over any address match', () => {
    const guessable = order({ id: 'guess', status: 'active' });
    const linked = order({ id: 'linked', address: '77 Nobody Rd', saleLink: { saleId: 'sale-1', ...link } });

    for (const orders of [[guessable, linked], [linked, guessable]]) {
      expect(matchFiberOrdersToSales([{ id: 'sale-1', customerAddress: '5780 Hall St SE' }], orders).get('sale-1')).toBe(linked);
    }
  });

  it('never lets an order linked to one sale match another by address', () => {
    const linkedElsewhere = order({ id: 'linked', saleLink: { saleId: 'sale-x', ...link } });
    const result = matchFiberOrdersToSales(
      [
        { id: 'sale-x', customerAddress: '900 Other Rd' },
        { id: 'sale-y', customerAddress: '5780 Hall St SE' },
      ],
      [linkedElsewhere]
    );

    expect(result.get('sale-x')).toBe(linkedElsewhere);
    expect(result.has('sale-y')).toBe(false);
    // The sale it names may not be in the caller's list at all (another rep's).
    expect(matchFiberOrdersToSales([{ id: 'sale-y', customerAddress: '5780 Hall St SE' }], [linkedElsewhere]).size).toBe(0);
  });
});

describe('apartment buildings: a neighbour is not this sale', () => {
  const pick = (address: string, orders: FiberOrder[]) =>
    matchFiberOrdersToSales([{ id: 'sale-1', customerAddress: address }], orders).get('sale-1');
  // Unit 3 installed last week; unit 2 is the rep's sale, rescheduled after a miss.
  const neighbourActive = order({ id: 'u3', status: 'active', unit: '3', estInstallDate: '2026-09-09', activationDate: '2026-09-09' });
  const ownPending = order({ id: 'u2', unit: 'Apt 2', orderDate: '2026-08-20', estInstallDate: '2026-09-15' });
  const ownMiss = order({ id: 'u2-miss', status: 'breakage', unit: '2', estInstallDate: '2026-09-03' });

  it('reads the unit off either side', () => {
    expect(unitId('Apt 4B')).toBe('4b');
    expect(unitId('#4b')).toBe('4b');
    expect(unitId('Unit #12')).toBe('12');
    expect(unitId(null)).toBe('');
    expect(saleUnitId('5780 Hall St SE Apt 2, Grand Rapids MI')).toBe('2');
    expect(saleUnitId('5780 Hall St SE #2')).toBe('2');
    expect(saleUnitId('5780 Hall St SE, Suite 110')).toBe('110');
    expect(saleUnitId('5780 Hall St SE')).toBe('');
  });

  it("follows the sale's own unit, whichever order the rows come in", () => {
    for (const orders of [[neighbourActive, ownPending, ownMiss], [ownMiss, ownPending, neighbourActive]]) {
      expect(pick('5780 Hall St SE Apt 2', orders)).toBe(ownPending);
    }
    expect(pick('5780 Hall St SE Apt 2', [neighbourActive, ownMiss])).toBe(ownMiss);
  });

  it("never shows a neighbour's install when the sale names no unit", () => {
    for (const orders of [[neighbourActive, ownPending], [ownPending, neighbourActive]]) {
      expect(pick('5780 Hall St SE', orders)).toBe(ownPending);
    }
    expect(doorOrders('5780 Hall St SE', [neighbourActive, ownPending]).certain).toBe(false);
  });

  it("never shows a neighbour's install when the sale's unit is not on the report", () => {
    expect(pick('5780 Hall St SE Apt 7', [neighbourActive])).toBeUndefined();
    expect(pick('5780 Hall St SE Apt 7', [neighbourActive, ownPending])).toBeUndefined();
    expect(doorOrders('5780 Hall St SE Apt 7', [neighbourActive]).certain).toBe(false);
  });

  it('keeps unit-less rows with the own unit, and a house as before', () => {
    const cancelled = order({ id: 'cx', status: 'cancelled', orderDate: '2026-09-10', cancellationDate: '2026-09-16' });
    expect(pick('5780 Hall St SE Apt 2', [ownPending, cancelled, neighbourActive])).toBe(cancelled);
    const houseActive = order({ id: 'h', status: 'active', activationDate: '2026-09-09' });
    const houseMiss = order({ id: 'hm', status: 'breakage', estInstallDate: '2026-09-03' });
    expect(pick('5780 Hall St SE', [houseMiss, houseActive])).toBe(houseActive);
    expect(doorOrders('5780 Hall St SE', [houseMiss, houseActive]).certain).toBe(true);
  });
});

describe('orders placed well before the sale', () => {
  const pick = (saleDate: Date, orders: FiberOrder[]) =>
    matchFiberOrdersToSales([{ id: 'sale-1', customerAddress: '5780 Hall St SE', saleDate }], orders).get('sale-1');
  const noonOn = (day: string) => new Date(`${day}T17:00:00Z`);
  // Installed in the spring; the customer re-ordered at the door in September.
  const oldActive = order({ id: 'old', status: 'active', orderDate: '2026-03-02', estInstallDate: '2026-03-09', activationDate: '2026-03-09' });
  const newPending = order({ id: 'new', orderDate: '2026-09-15', estInstallDate: '2026-09-24' });

  it('does not read a re-order sale as the old install at the same door', () => {
    for (const orders of [[oldActive, newPending], [newPending, oldActive]]) {
      expect(pick(noonOn('2026-09-15'), orders)).toBe(newPending);
    }
    expect(pick(noonOn('2026-09-15'), [oldActive])).toBeUndefined();
  });

  it('still matches an order placed within the week before the sale, or after it', () => {
    const lastWeek = order({ id: 'o', orderDate: '2026-09-08', estInstallDate: '2026-09-20' });
    expect(pick(noonOn('2026-09-15'), [lastWeek])).toBe(lastWeek);
    const tooEarly = order({ id: 'o', orderDate: '2026-09-07', estInstallDate: '2026-09-20' });
    expect(pick(noonOn('2026-09-15'), [tooEarly])).toBeUndefined();
    const nextDay = order({ id: 'o', orderDate: '2026-09-16', estInstallDate: '2026-09-20' });
    expect(pick(noonOn('2026-09-15'), [nextDay])).toBe(nextDay);
  });

  it('keeps undated orders and the old sale its own install', () => {
    const miss = order({ id: 'brk', status: 'breakage', orderDate: null, estInstallDate: '2026-03-06' });
    expect(pick(noonOn('2026-09-15'), [miss])).toBe(miss);
    expect(pick(noonOn('2026-03-02'), [oldActive, newPending])).toBe(oldActive);
    expect(matchFiberOrdersToSales([{ id: 's', customerAddress: '5780 Hall St SE' }], [oldActive]).get('s')).toBe(oldActive);
  });
});

describe('ordersPlacedForSale: the 7-day cutoff', () => {
  const soldOn = new Date('2026-09-15T17:00:00Z');
  const placed = (orderDate: string | null) => order({ id: `o-${orderDate}`, orderDate, estInstallDate: '2026-09-24' });

  it('ignores an order placed 8 days before the sale', () => {
    expect(ordersPlacedForSale(soldOn, [placed('2026-09-07')])).toEqual([]);
  });

  it('keeps an order placed exactly 7 days before the sale', () => {
    const lastWeek = placed('2026-09-08');
    expect(ordersPlacedForSale(soldOn, [lastWeek])).toEqual([lastWeek]);
  });

  it('keeps an order with no order date', () => {
    const undated = placed(null);
    expect(ordersPlacedForSale(soldOn, [undated])).toEqual([undated]);
  });

  it('keeps every order when the sale day cannot be read', () => {
    const old = placed('2026-01-02');
    expect(ordersPlacedForSale(undefined, [old])).toEqual([old]);
    expect(ordersPlacedForSale('not a date', [old])).toEqual([old]);
  });

  it('counts days on the Chicago sale day, not UTC', () => {
    // 11pm in Chicago on 9/14 is already 9/15 in UTC; the cutoff is 9/07.
    const lateNight = new Date('2026-09-15T04:00:00Z');
    const eightBefore = placed('2026-09-06');
    const sevenBefore = placed('2026-09-07');
    expect(ordersPlacedForSale(lateNight, [eightBefore, sevenBefore])).toEqual([sevenBefore]);
  });
});

describe('order number first: a door with a missed install and the real order', () => {
  // Sharon T., 149 Varsity Dr (Oct 2026): the carrier printed a "Customer Not
  // Home" breakage row and her real order, both on the missed day. By address
  // alone the miss is the current row, so her sale read red and her real order
  // read "not logged". Her sale carries the real order's number.
  const real = order({
    id: 'TMO20261005Z30P4', address: '149 VARSITY DR', orderDate: '2026-10-05', estInstallDate: '2026-10-06',
  });
  const miss = order({
    id: 'brk_c07a787f', status: 'breakage', address: '149 VARSITY DR', orderDate: null, estInstallDate: '2026-10-06',
    breakageReason: 'CX Missed — Customer Not Home',
  });
  const sharon = {
    id: 'sharon', customerAddress: '149 VARSITY DR, HUNTSVILLE, TX 77340', saleDate: new Date('2026-10-05T12:00:00'),
    orderNumberOrBtn: 'TMO20261005Z30P4',
  };

  it('joins the sale to the row with its order number, whichever order the rows come in', () => {
    for (const orders of [[miss, real], [real, miss]]) {
      expect(matchFiberOrdersToSales([sharon], orders).get('sharon')).toBe(real);
    }
  });

  it('still shows the miss to a sale with no order number (address-only, unchanged)', () => {
    const { orderNumberOrBtn: _drop, ...noNumber } = sharon;
    void _drop;
    for (const orders of [[miss, real], [real, miss]]) {
      expect(matchFiberOrdersToSales([noNumber], orders).get('sharon')).toBe(miss);
    }
  });

  it('falls back to the address when the report does not have the number', () => {
    for (const orders of [[miss, real], [real, miss]]) {
      expect(matchFiberOrdersToSales([{ ...sharon, orderNumberOrBtn: 'TMO20261005ZZZZZ' }], orders).get('sharon')).toBe(miss);
    }
  });

  it('reads the number however it was typed or scanned', () => {
    expect(orderMatchKey(' tmo-20261005 z30p4 ')).toBe(orderMatchKey('TMO20261005Z30P4'));
    // A screenshot reader turned the O of TMO into a zero.
    expect(orderMatchKey('TM02026100654K46')).toBe(orderMatchKey('TMO2026100654K46'));
    expect(orderMatchKey('12')).toBe('');
    const scanned = order({ id: 'TMO2026100654K46', address: '528 MCDOUGAL ST', orderDate: '2026-10-06' });
    expect(matchFiberOrdersToSales([{ id: 's', customerAddress: '528 McDougal St', orderNumberOrBtn: 'TM02026100654K46' }], [scanned]).get('s')).toBe(scanned);
  });

  it('joins by number even where the address or the date window would not', () => {
    const typo = { id: 's', customerAddress: '194 Varsty Drive', orderNumberOrBtn: 'TMO20261005Z30P4', saleDate: new Date('2026-11-30T12:00:00') };
    expect(matchFiberOrdersToSales([typo], [miss, real]).get('s')).toBe(real);
  });

  it('never lets another sale take a row claimed by number through the address', () => {
    const second = { id: 'second', customerAddress: '149 Varsity Dr', saleDate: new Date('2026-10-05T12:00:00') };
    for (const sales of [[second, sharon], [sharon, second]]) {
      for (const orders of [[miss, real], [real, miss]]) {
        const { matches, contested } = matchFiberOrdersToSalesDetailed(sales, orders);
        expect(matches.get('sharon')).toBe(real);
        expect(matches.get('second')).toBe(miss);
        // The duplicate check still sees both sales at one order.
        expect(contested.get('second')).toBe(real);
      }
    }
    // With no other row at the door, the second sale has none.
    expect(matchFiberOrdersToSales([second, sharon], [real]).has('second')).toBe(false);
  });

  it('joins the live order by number at a door with a cancelled one', () => {
    const cancelled = order({ id: 'TMO20261008UNOT1', status: 'cancelled', address: '411 PALM ST', orderDate: '2026-10-08' });
    const live = order({ id: 'TMO2026100835WB1', address: '411 PALM ST', orderDate: '2026-10-08' });
    const sale = { id: 's', customerAddress: '411 Palm St', orderNumberOrBtn: 'TMO2026100835WB1' };
    for (const orders of [[cancelled, live], [live, cancelled]]) {
      expect(matchFiberOrdersToSales([sale], orders).get('s')).toBe(live);
    }
  });

  it('leaves a saleLink above the number', () => {
    const link = { by: 'admin-1', byName: 'Jacob', at: '2026-10-07T00:00:00.000Z' };
    const linked = order({ id: 'TMO2026100577777', address: '9 Elsewhere Rd', saleLink: { saleId: 'sharon', ...link } });
    expect(matchFiberOrdersToSales([sharon], [real, miss, linked]).get('sharon')).toBe(linked);
    const notASale = { ...real, saleLink: { saleId: null, ...link } };
    expect(matchFiberOrdersToSales([sharon], [notASale, miss]).get('sharon')).toBe(miss);
  });
});

describe('attachMatchedUserNames', () => {
  it("names the matched portal rep from their newest sale, never the report's dealer name", () => {
    const handoff = order({ repName: 'Jeremy McFarland', matchedUserId: 'miles' });
    const nobody = order({ id: 'o2', repName: 'Someone', matchedUserId: 'quiet-rep' });
    const [named, unnamed] = attachMatchedUserNames([handoff, nobody], [
      { salesRepId: 'miles', salesRepName: 'Miles S', createdAt: new Date('2026-10-01') },
      { salesRepId: 'miles', salesRepName: 'Miles Scoonover', createdAt: new Date('2026-10-05') },
      { salesRepId: 'jeremy', salesRepName: 'Jeremy McFarland', createdAt: new Date('2026-10-06') },
    ]);
    expect(named.matchedUserName).toBe('Miles Scoonover');
    expect(unnamed.matchedUserName).toBeNull();
  });
});

describe('foldLeftoverOrders: history at a matched door', () => {
  const held = order({ id: 'TMO-REAL', address: '149 VARSITY DR' });
  const miss = order({ id: 'brk_1', status: 'breakage', address: '149 Varsity Dr.' });
  const dead = order({ id: 'TMO-DEAD', status: 'cancelled', address: '149 VARSITY DR' });

  it('folds a missed install and a cancelled attempt beside the held order', () => {
    const folded = foldLeftoverOrders([held, miss, dead], [held]);
    expect(folded.get(miss)).toBe(held);
    expect(folded.get(dead)).toBe(held);
    expect(folded.has(held)).toBe(false);
  });

  it('leaves live rows, other doors, other units, other reps and linked rows alone', () => {
    const live = order({ id: 'TMO-LIVE', status: 'pending_install', address: '149 VARSITY DR' });
    const nextDoor = order({ id: 'brk_2', status: 'breakage', address: '151 VARSITY DR' });
    const otherUnit = order({ id: 'brk_3', status: 'breakage', address: '149 VARSITY DR', unit: '2' });
    const otherRep = order({ id: 'brk_4', status: 'breakage', address: '149 VARSITY DR', matchedUserId: 'rep-2' });
    const linked = order({
      id: 'brk_5', status: 'breakage', address: '149 VARSITY DR',
      saleLink: { saleId: null, by: 'a', byName: 'Jacob', at: '2026-10-07T00:00:00.000Z' },
    });
    expect(foldLeftoverOrders([held, live, nextDoor, otherUnit, otherRep, linked], [held]).size).toBe(0);
  });

  it('folds nothing at a door with no held order', () => {
    expect(foldLeftoverOrders([miss, dead], []).size).toBe(0);
  });
});
