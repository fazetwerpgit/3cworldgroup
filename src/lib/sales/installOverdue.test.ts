import { describe, expect, it } from 'vitest';
import type { FiberOrder, Sale } from '@/types';
import { buildMergedBook } from '@/lib/sales/mergeBook';
import {
  daysBetween,
  overdueAlertDue,
  overdueInstall,
  overdueOwnerMessage,
  overdueRepMessage,
  overdueSales,
  type OverdueSale,
} from './installOverdue';

// Friday Oct 9 2026, 9 AM in Chicago (CDT, UTC-5): the morning the report lands.
const NOW = new Date('2026-10-09T14:00:00Z');
const TODAY = '2026-10-09';
/** Noon Chicago on a day, as sale install dates are stored. */
const noon = (day: string) => new Date(`${day}T17:00:00Z`);

function order(over: Partial<FiberOrder> = {}): FiberOrder {
  return {
    id: 'o-1',
    status: 'pending_install',
    rawStatus: '',
    repDealerId: '1',
    repName: 'Cooper Rep',
    matchedUserId: 'cooper',
    orderDate: '2026-07-20',
    estInstallDate: '2026-08-01',
    activationDate: null,
    cancellationDate: null,
    deactivationDate: null,
    fiberPlan: null,
    mrc: null,
    address: '12 OAK ST',
    unit: null,
    city: null,
    state: null,
    zip: null,
    breakageReason: null,
    breakageNotes: null,
    customerName: null,
    sourceSheet: 'x',
    reportReceivedAt: '2026-10-09T12:00:00Z',
    updatedAt: '2026-10-09T12:00:00Z',
    ...over,
  };
}

const sale = (over: Partial<Sale> = {}) =>
  ({ status: 'approved', installDate: noon('2026-08-01'), ...over }) as Pick<Sale, 'installDate' | 'status'>;

describe('overdueInstall', () => {
  it('flags a pending order 69 days past its estimate (Craig T., Aug 1 → Oct 9)', () => {
    expect(overdueInstall(sale(), order(), NOW)).toEqual({ dueDay: '2026-08-01', daysOverdue: 69 });
  });

  it('starts at 3 days past the install day, not 2', () => {
    const at = (day: string) => overdueInstall(sale({ installDate: noon(day) }), order({ estInstallDate: day }), NOW);
    expect(at('2026-10-07')).toBeNull(); // 2 days
    expect(at('2026-10-06')).toEqual({ dueDay: '2026-10-06', daysOverdue: 3 });
  });

  it('counts Chicago calendar days, not hours: late evening on day 3 is still day 3', () => {
    const lateNight = new Date('2026-10-10T04:30:00Z'); // 11:30 PM Oct 9 in Chicago
    expect(overdueInstall(sale({ installDate: noon('2026-10-06') }), order({ estInstallDate: '2026-10-06' }), lateNight))
      ?.toEqual({ dueDay: '2026-10-06', daysOverdue: 3 });
  });

  it('is never overdue once installed or cancelled by the carrier', () => {
    expect(overdueInstall(sale(), order({ status: 'active', activationDate: '2026-08-02' }), NOW)).toBeNull();
    expect(overdueInstall(sale(), order({ status: 'cancelled' }), NOW)).toBeNull();
    expect(overdueInstall(sale(), order({ status: 'churned' }), NOW)).toBeNull();
  });

  it('is never overdue for a sale cancelled or rejected in the portal', () => {
    expect(overdueInstall(sale({ status: 'cancelled' }), order(), NOW)).toBeNull();
    expect(overdueInstall(sale({ status: 'rejected' }), order(), NOW)).toBeNull();
  });

  it('stops when the sale is rescheduled to today or later, whatever the stale estimate says', () => {
    expect(overdueInstall(sale({ installDate: noon('2026-10-12') }), order(), NOW)).toBeNull();
    expect(overdueInstall(sale({ installDate: noon(TODAY) }), order(), NOW)).toBeNull();
  });

  it('stops when the carrier moves its estimate to a future day', () => {
    expect(overdueInstall(sale(), order({ estInstallDate: '2026-10-14' }), NOW)).toBeNull();
  });

  it('measures from the later of the two days', () => {
    // Rescheduled past a missed install, and that day passed too.
    expect(
      overdueInstall(sale({ installDate: noon('2026-10-01') }), order({ status: 'breakage', estInstallDate: '2026-09-20' }), NOW)
    ).toEqual({ dueDay: '2026-10-01', daysOverdue: 8 });
    // A standing missed install that nobody rescheduled.
    expect(
      overdueInstall(sale({ installDate: noon('2026-09-20') }), order({ status: 'breakage', estInstallDate: '2026-09-20' }), NOW)
    ).toEqual({ dueDay: '2026-09-20', daysOverdue: 19 });
  });

  it('uses the carrier estimate when the sale has no date, and the sale day when the carrier has none', () => {
    expect(overdueInstall(sale({ installDate: undefined }), order({ estInstallDate: '2026-09-30' }), NOW)).toEqual({
      dueDay: '2026-09-30',
      daysOverdue: 9,
    });
    expect(overdueInstall(sale({ installDate: noon('2026-09-30') }), order({ status: 'pre_sale', estInstallDate: null }), NOW))
      .toEqual({ dueDay: '2026-09-30', daysOverdue: 9 });
  });

  it('is never overdue with no date anywhere, or with no matched carrier order', () => {
    expect(overdueInstall(sale({ installDate: undefined }), order({ estInstallDate: null }), NOW)).toBeNull();
    expect(overdueInstall(sale(), null, NOW)).toBeNull();
    expect(overdueInstall(sale(), undefined, NOW)).toBeNull();
  });
});

describe('daysBetween', () => {
  it('counts whole calendar days across a DST change', () => {
    expect(daysBetween('2026-10-30', '2026-11-03')).toBe(4);
    expect(daysBetween('2026-08-01', '2026-10-09')).toBe(69);
    expect(daysBetween('nope', '2026-10-09')).toBeNaN();
  });
});

describe('overdueSales', () => {
  it('reads the board’s own join (buildMergedBook), oldest first; a carrier estimate moved ahead clears it', () => {
    const sales = [
      {
        id: 'craig',
        salesRepId: 'cooper',
        salesRepName: 'Cooper Smith',
        customerName: 'Craig Thompson',
        customerAddress: '12 Oak St',
        status: 'approved',
        saleDate: noon('2026-07-20'),
        installDate: noon('2026-08-01'),
        products: [],
        totalValue: 0,
      },
      {
        id: 'ok',
        salesRepId: 'cooper',
        salesRepName: 'Cooper Smith',
        customerName: 'Erin Ok',
        customerAddress: '40 Pine Ave',
        status: 'approved',
        saleDate: noon('2026-09-20'),
        installDate: noon('2026-09-30'),
        products: [],
        totalValue: 0,
      },
      {
        id: 'dana',
        salesRepId: 'cooper',
        salesRepName: 'Cooper Smith',
        customerName: 'dana lee',
        customerAddress: '9 Bay Rd',
        status: 'approved',
        saleDate: noon('2026-09-20'),
        installDate: noon('2026-09-30'),
        products: [],
        totalValue: 0,
      },
    ] as unknown as Sale[];
    const orders = [
      order({ id: 'o-craig', address: '12 OAK ST' }),
      order({ id: 'o-ok', address: '40 PINE AVE', estInstallDate: '2026-10-14' }),
      order({ id: 'o-dana', address: '9 BAY RD', orderDate: '2026-09-20', estInstallDate: '2026-09-30' }),
    ];
    const book = buildMergedBook(sales, orders, { now: NOW, repNames: new Map([['cooper', 'Cooper Smith']]) });
    expect(overdueSales(book.rows, NOW)).toEqual([
      {
        saleId: 'craig',
        orderId: 'o-craig',
        repId: 'cooper',
        repName: 'Cooper Smith',
        customer: 'Craig T.',
        dueDay: '2026-08-01',
        daysOverdue: 69,
      },
      {
        saleId: 'dana',
        orderId: 'o-dana',
        repId: 'cooper',
        repName: 'Cooper Smith',
        customer: 'Dana L.', // typed all lowercase, still capitalised
        dueDay: '2026-09-30',
        daysOverdue: 9,
      },
    ]);
  });
});

describe('overdueAlertDue', () => {
  const overdue = (daysOverdue: number, dueDay = '2026-08-01') => ({ dueDay, daysOverdue });

  it('sends on day 3 the first time', () => {
    expect(overdueAlertDue(null, overdue(3), TODAY)).toEqual({ send: true, count: 1 });
    expect(overdueAlertDue(null, overdue(2), TODAY)).toEqual({ send: false });
  });

  it('never sends twice on the same day', () => {
    const record = { dueDay: '2026-08-01', lastAlertDay: TODAY, count: 1 };
    expect(overdueAlertDue(record, overdue(69), TODAY)).toEqual({ send: false });
  });

  it('repeats every 7 days while still overdue', () => {
    const record = { dueDay: '2026-08-01', lastAlertDay: '2026-10-03', count: 1 };
    expect(overdueAlertDue(record, overdue(69), TODAY)).toEqual({ send: false }); // 6 days
    expect(overdueAlertDue({ ...record, lastAlertDay: '2026-10-02' }, overdue(69), TODAY)).toEqual({ send: true, count: 2 });
  });

  it('starts over at day 3 of a new day after a reschedule that also passed', () => {
    const record = { dueDay: '2026-08-01', lastAlertDay: '2026-10-02', count: 3 };
    // Rescheduled to Oct 5 after the last alert: Oct 7 is day 2, Oct 8 day 3.
    expect(overdueAlertDue(record, overdue(2, '2026-10-05'), '2026-10-07')).toEqual({ send: false });
    expect(overdueAlertDue(record, overdue(3, '2026-10-05'), '2026-10-08')).toEqual({ send: true, count: 1 });
  });

  it('keeps the weekly rhythm when the due day only shifts between days already past', () => {
    const record = { dueDay: '2026-08-01', lastAlertDay: '2026-10-07', count: 2 };
    expect(overdueAlertDue(record, overdue(66, '2026-08-04'), TODAY)).toEqual({ send: false });
  });

  it('stops once nothing is overdue (the caller only asks about overdue sales)', () => {
    const record = { dueDay: '2026-08-01', lastAlertDay: '2026-09-01', count: 5 };
    expect(overdueAlertDue(record, overdue(0, TODAY), TODAY)).toEqual({ send: false });
  });
});

describe('copy', () => {
  const overdue = (customer: string, repName: string, daysOverdue: number): OverdueSale => ({
    saleId: customer,
    orderId: 'o',
    repId: 'r',
    repName,
    customer,
    dueDay: '2026-08-01',
    daysOverdue,
  });

  it('tells the rep who, when it was due, and how long, with no money', () => {
    expect(overdueRepMessage({ customer: 'Craig T.', dueDay: '2026-08-01', daysOverdue: 69 })).toBe(
      'Craig T. was due Aug 1 (69 days). Check with the customer or reschedule.'
    );
  });

  it('summarises for the owners with the oldest, rep by first name', () => {
    expect(
      overdueOwnerMessage([overdue('Dana L.', 'Ava Jones', 5), overdue('Craig T.', 'Cooper Smith', 69), overdue('Ed K.', 'Bo Li', 12)])
    ).toBe('3 overdue. Oldest: Craig T. (Cooper, 69 days)');
    expect(overdueOwnerMessage([overdue('Craig T.', 'Cooper Smith', 69)])).toBe('1 overdue: Craig T. (Cooper, 69 days)');
    expect(overdueOwnerMessage([])).toBeNull();
  });
});
