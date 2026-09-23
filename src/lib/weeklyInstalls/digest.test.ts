import { describe, expect, it } from 'vitest';
import { buildRepDigest, estimatedPayForSale, isDigestEmpty, NEEDS_DATE_LIMIT, shortAddress } from './digest';
import {
  busyWeekInput,
  FIXTURE_RATES,
  FIXTURE_WEEK,
  fixtureOrder,
  fixtureSale,
  lightWeekInput,
  product,
} from './fixtures';

const ids = <T extends { saleId: string }>(rows: T[]) => rows.map((row) => row.saleId);

describe('buildRepDigest', () => {
  const digest = buildRepDigest(busyWeekInput());

  it('lists last week’s T-Fiber installs, oldest first, with the carrier date winning', () => {
    // s3 was typed as Sep 12 but the carrier activated it Sep 17.
    expect(ids(digest.installed)).toEqual(['s2', 's1', 's3', 's4']);
    expect(digest.installed.map((row) => row.installDay)).toEqual([
      '2026-09-14',
      '2026-09-15',
      '2026-09-17',
      '2026-09-19',
    ]);
  });

  it('drops other carriers, rejected sales, old installs and other reps', () => {
    const all = [
      ...ids(digest.installed),
      ...ids(digest.upcoming),
      ...ids(digest.needsDate),
    ];
    for (const noise of ['n1', 'n2', 'n3', 'x1']) expect(all).not.toContain(noise);
    expect(digest.cancelled.map((row) => row.orderId)).not.toContain('TMO_X');
  });

  it('prices each install from the rep’s own rates and gives a payout RANGE', () => {
    const byId = Object.fromEntries(digest.installed.map((row) => [row.saleId, row]));
    expect(byId.s1.estPay).toBe(138);
    expect(byId.s2.estPay).toBe(168);
    expect(byId.s3.estPay).toBe(97.5);
    expect(byId.s4.estPay).toBe(67.5);
    // Installs 8th–14th pay 21st–25th; 15th–21st pay 28th–3rd of next month.
    expect(byId.s2.payoutWindow).toBe('Sep 21–25');
    expect(byId.s1.payoutWindow).toBe('Sep 28–Oct 3');
    expect(byId.s1.carrierConfirmed).toBe(true);
    expect(byId.s2.carrierConfirmed).toBe(false);
  });

  it('totals the week', () => {
    expect(digest.total).toEqual({ count: 4, estAmount: 138 + 168 + 97.5 + 67.5, estCount: 4 });
  });

  it('lists this week’s scheduled installs', () => {
    expect(ids(digest.upcoming)).toEqual(['s5', 's6']);
  });

  it('lists carrier cancellations dated last week, logged or not', () => {
    expect(digest.cancelled.map((row) => row.orderId)).toEqual(['TMO7', 'TMO8']);
    expect(digest.cancelled[0]).toMatchObject({ customer: 'Kevin Tran', address: '3301 Lakeside Blvd', cancelledDay: '2026-09-16' });
    expect(digest.cancelled[1]).toMatchObject({ customer: null, plan: 'Fiber 500' });
    // A carrier-cancelled sale is not also an install.
    expect(ids(digest.installed)).not.toContain('s7');
  });

  it('uses the disconnect date for a churn', () => {
    const input = busyWeekInput();
    input.orders = [
      fixtureOrder({ id: 'CH', address: '5 Churn Way', matchedUserId: 'rep-braeden', status: 'churned', deactivationDate: '2026-09-15', cancellationDate: '2026-08-01' }),
    ];
    const churned = buildRepDigest(input).cancelled;
    expect(churned).toHaveLength(1);
    expect(churned[0]).toMatchObject({ kind: 'churned', cancelledDay: '2026-09-15' });
  });

  it('lists sales that need a date, newest first, flagging a missed install', () => {
    expect(ids(digest.needsDate)).toEqual(['s8', 's9']);
    expect(digest.needsDate[0].missed).toBe(false);
    expect(digest.needsDate[1].missed).toBe(true);
  });

  it('moves a missed install to upcoming once it is rescheduled past the broken day', () => {
    const input = busyWeekInput();
    input.orders = input.orders.map((order) =>
      order.id === 'brk_9' ? { ...order, estInstallDate: '2026-09-10' } : order
    );
    input.sales = input.sales.map((sale) =>
      sale.id === 's9' ? { ...sale, installDate: new Date(2026, 8, 22, 12) } : sale
    );
    const rescheduled = buildRepDigest(input);
    expect(ids(rescheduled.needsDate)).toEqual(['s8']);
    expect(ids(rescheduled.upcoming)).toContain('s9');
  });

  it('caps the needs-a-date list and counts the rest', () => {
    const input = lightWeekInput();
    for (let i = 0; i < NEEDS_DATE_LIMIT + 3; i += 1) {
      input.sales.push(fixtureSale({ id: `u${i}`, salesRepId: 'rep-jasmine', customerAddress: `${100 + i} Elm St`, soldDay: '2026-09-0' + ((i % 9) + 1) }));
    }
    const capped = buildRepDigest(input);
    expect(capped.needsDate).toHaveLength(NEEDS_DATE_LIMIT);
    expect(capped.needsDateMore).toBe(4); // 11 new + j2, minus the cap
  });

  it('leaves out an amount that has no real rate instead of inventing one', () => {
    expect(estimatedPayForSale({ products: [product('tfiber-1gig')] }, null)).toBeNull();
    expect(estimatedPayForSale({ products: [product('tfiber-8gig')] }, FIXTURE_RATES)).toBeNull();
    expect(estimatedPayForSale({ products: [product('tfiber-1gig')] }, { tfiber: { 'tfiber-1gig': 0 } })).toBeNull();
    expect(estimatedPayForSale({ products: [] }, FIXTURE_RATES)).toBeNull();

    const input = lightWeekInput();
    input.rates = null;
    const noPlan = buildRepDigest(input);
    expect(noPlan.installed[0].estPay).toBeNull();
    expect(noPlan.total).toEqual({ count: 1, estAmount: null, estCount: 0 });
  });

  it('is empty when a rep has nothing this week', () => {
    const empty = buildRepDigest({
      rep: { uid: 'rep-q', name: 'Quiet Rep' },
      rates: FIXTURE_RATES,
      week: FIXTURE_WEEK,
      sales: [fixtureSale({ id: 'q1', salesRepId: 'rep-q', installDay: '2026-08-20' })],
      orders: [],
    });
    expect(isDigestEmpty(empty)).toBe(true);
    expect(isDigestEmpty(digest)).toBe(false);
  });

  it('shortens an address to the street line', () => {
    expect(shortAddress('4417 Ridgecrest Dr, Plano, TX 75024')).toBe('4417 Ridgecrest Dr');
    expect(shortAddress(null)).toBe('');
  });
});
