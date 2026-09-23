import { describe, expect, it } from 'vitest';
import {
  carrierReasonLabel,
  groupCarrierNotices,
  planCarrierNotices,
  type StoredOrder,
} from './carrierNotice';
import type { OrderSale } from '@/lib/sales/installDateSync';
import type { FiberOrder } from '@/types/fiberOrder';

function order(overrides: Partial<FiberOrder> & Pick<FiberOrder, 'id'>): FiberOrder {
  return {
    status: 'pending_install',
    rawStatus: '',
    repDealerId: '4721016',
    repName: 'Rep One',
    matchedUserId: 'rep-1',
    orderDate: '2026-09-01',
    estInstallDate: '2026-09-20',
    activationDate: null,
    cancellationDate: null,
    deactivationDate: null,
    fiberPlan: null,
    mrc: null,
    address: '123 MAIN ST',
    unit: null,
    city: null,
    state: null,
    zip: null,
    breakageReason: null,
    breakageNotes: null,
    customerName: null,
    sourceSheet: 'Orders',
    reportReceivedAt: '2026-09-22T12:00:00.000Z',
    updatedAt: '2026-09-22T12:00:00.000Z',
    ...overrides,
  };
}

function sale(overrides: Partial<OrderSale> = {}): OrderSale {
  return {
    saleId: 'sale-1',
    salesRepId: 'rep-1',
    customerName: 'Dana Reyes',
    customerAddress: '123 Main St',
    status: 'approved',
    ...overrides,
  };
}

const stored = (entries: Record<string, Partial<StoredOrder>>) =>
  new Map(
    Object.entries(entries).map(([id, state]) => [
      id,
      { status: state.status ?? null, noticeStatus: state.noticeStatus ?? null },
    ])
  );

describe('planCarrierNotices', () => {
  it('tells the rep when a stored order moves into cancelled', () => {
    const notices = planCarrierNotices({
      orders: [order({ id: 'o-1', status: 'cancelled' })],
      stored: stored({ 'o-1': { status: 'pending_install' } }),
      orderSales: new Map([['o-1', sale()]]),
    });

    expect(notices).toEqual([
      {
        orderId: 'o-1',
        status: 'cancelled',
        userId: 'rep-1',
        saleId: 'sale-1',
        title: 'Carrier cancelled an order',
        message: 'Dana R.',
        link: '/portal/sales/sale-1',
      },
    ]);
  });

  it('tells the report-matched rep about a transition with no sale, by street', () => {
    const notices = planCarrierNotices({
      orders: [order({ id: 'o-1', status: 'churned', matchedUserId: 'rep-9' })],
      stored: stored({ 'o-1': { status: 'active' } }),
      orderSales: new Map(),
    });

    expect(notices).toMatchObject([
      { userId: 'rep-9', saleId: null, title: 'Customer disconnected', message: '123 Main St', link: '/portal/sales' },
    ]);
  });

  it('sends nothing when an identical report arrives again', () => {
    const orders = [
      order({ id: 'o-1', status: 'cancelled' }),
      order({ id: 'brk_1', status: 'breakage', breakageReason: 'CX Missed — Customer Not Home' }),
    ];
    const notices = planCarrierNotices({
      orders,
      stored: stored({ 'o-1': { status: 'cancelled' }, brk_1: { status: 'breakage' } }),
      orderSales: new Map([['brk_1', sale()]]),
    });

    expect(notices).toEqual([]);
  });

  it('never replays old history from rows it has not seen before unless they are a logged sale', () => {
    const notices = planCarrierNotices({
      orders: [
        order({ id: 'o-old', status: 'cancelled' }),
        order({ id: 'o-churn', status: 'churned' }),
        order({
          id: 'brk_1',
          status: 'breakage',
          customerName: 'MARIA LOPEZ',
          breakageReason: 'CX Missed — Customer Not Home',
        }),
      ],
      stored: new Map(),
      orderSales: new Map([['brk_1', sale({ customerName: null })]]),
    });

    expect(notices).toEqual([
      {
        orderId: 'brk_1',
        status: 'breakage',
        userId: 'rep-1',
        saleId: 'sale-1',
        title: 'Install missed',
        message: 'Maria L. · Customer not home. Pick a new date.',
        link: '/portal/sales/sale-1',
      },
    ]);
  });

  it('does not tell the same status twice once the order carries the marker', () => {
    const notices = planCarrierNotices({
      orders: [order({ id: 'o-1', status: 'cancelled' })],
      // Told once, then the carrier flapped it back to pending: not news again.
      stored: stored({ 'o-1': { status: 'pending_install', noticeStatus: 'cancelled' } }),
      orderSales: new Map([['o-1', sale()]]),
    });

    expect(notices).toEqual([]);
  });

  it('tells a new issue on an order already told about a different one', () => {
    const notices = planCarrierNotices({
      orders: [order({ id: 'o-1', status: 'churned' })],
      stored: stored({ 'o-1': { status: 'cancelled', noticeStatus: 'cancelled' } }),
      orderSales: new Map(),
    });

    expect(notices).toHaveLength(1);
    expect(notices[0].status).toBe('churned');
  });

  it('stays quiet about sales already cancelled or rejected, and live statuses', () => {
    const notices = planCarrierNotices({
      orders: [
        order({ id: 'o-1', status: 'cancelled' }),
        order({ id: 'o-2', status: 'cancelled' }),
        order({ id: 'o-3', status: 'active' }),
      ],
      stored: stored({
        'o-1': { status: 'pending_install' },
        'o-2': { status: 'pending_install' },
        'o-3': { status: 'pending_install' },
      }),
      orderSales: new Map([
        ['o-1', sale({ status: 'cancelled' })],
        ['o-2', sale({ saleId: 'sale-2', status: 'rejected' })],
      ]),
    });

    expect(notices).toEqual([]);
  });

  it("tells the sale's rep, not the report's, when they differ", () => {
    const notices = planCarrierNotices({
      orders: [order({ id: 'o-1', status: 'cancelled', matchedUserId: 'rep-report' })],
      stored: stored({ 'o-1': { status: 'pre_sale' } }),
      orderSales: new Map([['o-1', sale({ salesRepId: 'rep-sale' })]]),
    });

    expect(notices[0].userId).toBe('rep-sale');
  });
});

describe('groupCarrierNotices', () => {
  const notice = (userId: string, n: number) => ({
    orderId: `o-${userId}-${n}`,
    status: 'cancelled' as const,
    userId,
    saleId: null,
    title: 'Carrier cancelled an order',
    message: `Order ${n}`,
    link: '/portal/sales',
  });

  it('sends up to five notices to a rep one by one', () => {
    const dispatches = groupCarrierNotices([1, 2, 3, 4, 5].map((n) => notice('rep-1', n)));

    expect(dispatches).toHaveLength(5);
    expect(dispatches.every((dispatch) => !dispatch.summary)).toBe(true);
  });

  it('folds more than five for one rep into one summary, leaving other reps alone', () => {
    const dispatches = groupCarrierNotices([
      ...[1, 2, 3, 4, 5, 6].map((n) => notice('rep-1', n)),
      notice('rep-2', 1),
    ]);

    expect(dispatches).toEqual([
      {
        userId: 'rep-1',
        title: 'Carrier report',
        message: '6 orders need attention · Open Sales',
        link: '/portal/sales',
        orderIds: [1, 2, 3, 4, 5, 6].map((n) => `o-rep-1-${n}`),
        summary: true,
      },
      {
        userId: 'rep-2',
        title: 'Carrier cancelled an order',
        message: 'Order 1',
        link: '/portal/sales',
        orderIds: ['o-rep-2-1'],
        summary: false,
      },
    ]);
  });
});

describe('carrierReasonLabel', () => {
  it.each([
    ['CX Missed — Customer Not Home', 'Customer not home'],
    ['CX Missed — ', 'CX missed'],
    [' — Tech No Show', 'Tech no show'],
    ['CX Missed — Not A Customer', 'Not a customer'],
    ['CX — CUSTOMER NOT HOME', 'Customer not home'],
    ['CX MISSED — CUSTOMER NOT HOME', 'Customer not home'],
    [' — ', null],
    [null, null],
  ])('%s → %s', (raw, label) => {
    expect(carrierReasonLabel(raw)).toBe(label);
  });
});
