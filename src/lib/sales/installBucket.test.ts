import { describe, it, expect } from 'vitest';
import type { FiberOrder, Sale } from '@/types';
import {
  AWAITING_CARRIER_LABEL,
  awaitingCarrierDay,
  awaitingCarrierLabel,
  cancelledSales,
  carrierReportCovers,
  isAwaitingCarrier,
  judgedInstallDay,
  countInstallBuckets,
  countedSales,
  installAttentionReason,
  installBucketForSale,
  isInstallToday,
  isStandingBreakage,
  scheduledInstallDay,
  rollupSalesByRep,
} from './installBucket';

const NOW = new Date('2026-09-15T12:00:00');

function sale(overrides: Partial<Sale> = {}): Sale {
  return {
    id: 's1',
    salesRepId: 'rep1',
    salesRepName: 'Wil Teasdale',
    customerName: 'M. Garcia',
    customerAddress: '1 Main St',
    saleType: 'new_service',
    products: [],
    totalValue: 100,
    totalPoints: 0,
    status: 'approved',
    saleDate: new Date('2026-09-01T12:00:00'),
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  } as Sale;
}

function order(status: FiberOrder['status']): FiberOrder {
  return { status } as FiberOrder;
}

describe('installBucketForSale', () => {
  it('calls a sale with no install date attention', () => {
    expect(installBucketForSale(sale({ installDate: undefined }), null, NOW)).toBe('attention');
  });

  it('calls a past install date installed and a future one scheduled', () => {
    expect(installBucketForSale(sale({ installDate: new Date('2026-09-08T12:00:00') }), null, NOW)).toBe('installed');
    expect(installBucketForSale(sale({ installDate: new Date('2026-09-20T12:00:00') }), null, NOW)).toBe('scheduled');
  });

  it('pulls a breakage back to attention even with a date on the calendar', () => {
    const scheduled = sale({ installDate: new Date('2026-09-20T12:00:00') });
    expect(installBucketForSale(scheduled, order('breakage'), NOW)).toBe('attention');
  });

  it('lets a later date on the sale stand over the breakage it replaced', () => {
    const broke = { status: 'breakage', estInstallDate: '2026-09-09' } as FiberOrder;
    const sameDay = sale({ installDate: new Date('2026-09-09T12:00:00') });
    const rescheduled = sale({ installDate: new Date('2026-09-20T12:00:00') });
    const rescheduledPast = sale({ installDate: new Date('2026-09-10T12:00:00') });
    expect(isStandingBreakage(sameDay, broke)).toBe(true);
    expect(installBucketForSale(sameDay, broke, NOW)).toBe('attention');
    expect(isStandingBreakage(rescheduled, broke)).toBe(false);
    expect(installBucketForSale(rescheduled, broke, NOW)).toBe('scheduled');
    expect(installBucketForSale(rescheduledPast, broke, NOW)).toBe('installed');
    // An earlier date than the one that broke is not a reschedule.
    expect(installBucketForSale(sale({ installDate: new Date('2026-09-05T12:00:00') }), broke, NOW)).toBe('attention');
  });

  it('does not call a cancelled or churned order installed off the sale date', () => {
    const past = sale({ installDate: new Date('2026-09-08T12:00:00') });
    expect(installBucketForSale(past, order('cancelled'), NOW)).toBe('attention');
    expect(installBucketForSale(past, order('churned'), NOW)).toBe('attention');
  });

  it('trusts an active fiber order over a future date', () => {
    const scheduled = sale({ installDate: new Date('2026-09-20T12:00:00') });
    expect(installBucketForSale(scheduled, order('active'), NOW)).toBe('installed');
  });

  it('does not call a past sale date installed while the carrier has not installed it', () => {
    const past = sale({ installDate: new Date('2026-09-10T12:00:00') });
    const now = new Date('2026-09-20T12:00:00');
    expect(installBucketForSale(past, order('pre_sale'), now)).toBe('attention');
    expect(installBucketForSale(past, order('pending_install'), now)).toBe('attention');
    const pending = (estInstallDate: string) => ({ status: 'pending_install', estInstallDate }) as FiberOrder;
    // A report that covers the 18th still shows it pending: overdue.
    expect(installBucketForSale(past, pending('2026-09-18'), now, '2026-09-19')).toBe('attention');
    // With no report stamp, two days back is still inside the grace.
    expect(installBucketForSale(past, pending('2026-09-18'), now)).toBe('scheduled');
    expect(installBucketForSale(past, pending('2026-09-17'), now)).toBe('attention');
    expect(installBucketForSale(past, pending('2026-09-24'), now)).toBe('scheduled');
  });

  it('keeps a pending install scheduled on its install day, overdue from the next', () => {
    const past = sale({ installDate: new Date('2026-10-08T12:00:00') });
    const pending = { status: 'pending_install', estInstallDate: '2026-10-09' } as FiberOrder;
    // Late on the install day itself, the carrier has not activated yet: still scheduled.
    const installDay = new Date('2026-10-09T18:00:00');
    expect(installBucketForSale(past, pending, installDay)).toBe('scheduled');
    expect(scheduledInstallDay(past, pending, installDay)).toBe('2026-10-09');
    expect(isInstallToday(scheduledInstallDay(past, pending, installDay), installDay)).toBe(true);
    // The day after, still pending in a report that covers the day: overdue,
    // not "no install date".
    const dayAfter = new Date('2026-10-10T09:00:00');
    expect(installBucketForSale(past, pending, dayAfter, '2026-10-09')).toBe('attention');
    // A report only through the 8th cannot know: waiting on the carrier.
    expect(installBucketForSale(past, pending, dayAfter, '2026-10-08')).toBe('scheduled');
    expect(installAttentionReason(past, pending)).toBe('overdue');
    expect(installAttentionReason(past, order('pre_sale'))).toBe('overdue');
    expect(installAttentionReason(past, null)).toBe('overdue');
  });

  it('names why a sale needs attention', () => {
    expect(installAttentionReason(sale({ installDate: undefined }), null)).toBe('no-date');
    expect(installAttentionReason({ installDate: 'not-a-date' as unknown as Date }, null)).toBe('no-date');
    const past = sale({ installDate: new Date('2026-09-10T12:00:00') });
    expect(installAttentionReason(past, { status: 'breakage', estInstallDate: '2026-09-10' } as FiberOrder)).toBe('missed');
    expect(installAttentionReason(past, order('cancelled'))).toBe('cancelled');
    expect(installAttentionReason(past, order('churned'))).toBe('cancelled');
  });

  it('reads the scheduled day off the sale while it is ahead, else the carrier estimate', () => {
    const ahead = sale({ installDate: new Date('2026-09-20T12:00:00') });
    expect(scheduledInstallDay(ahead, null, NOW)).toBe('2026-09-20');
    const pending = { status: 'pending_install', estInstallDate: '2026-09-22' } as FiberOrder;
    expect(scheduledInstallDay(sale({ installDate: new Date('2026-09-10T12:00:00') }), pending, NOW)).toBe('2026-09-22');
    expect(isInstallToday('2026-09-15', NOW)).toBe(true);
    expect(isInstallToday('2026-09-16', NOW)).toBe(false);
    expect(isInstallToday(null, NOW)).toBe(false);
  });

  it('treats an unparseable date as no date', () => {
    expect(installBucketForSale({ installDate: 'not-a-date' as unknown as Date }, null, NOW)).toBe('attention');
  });
});

describe('countedSales', () => {
  it('drops rejected and cancelled sales', () => {
    const kept = countedSales([
      sale({ id: 'a', status: 'approved' }),
      sale({ id: 'b', status: 'rejected' }),
      sale({ id: 'c', status: 'cancelled' }),
      sale({ id: 'd', status: 'pending' }),
    ]);
    expect(kept.map((s) => s.id)).toEqual(['a', 'd']);
  });
});

describe('a carrier cancellation', () => {
  // Jacob 2026-09-10: the carrier taking a customer away takes the money with
  // it. Before this, a rep's month counted a cancelled customer as a sale.
  const all = [sale({ id: 'a', status: 'approved' }), sale({ id: 'b', status: 'approved' })];
  const fiberBySale = new Map<string, FiberOrder>([['b', order('cancelled')]]);

  it('leaves the counted sales', () => {
    expect(countedSales(all, fiberBySale).map((s) => s.id)).toEqual(['a']);
  });

  it('joins the cancellations instead', () => {
    expect(cancelledSales(all, fiberBySale).map((s) => s.id)).toEqual(['b']);
  });

  it('is ignored when the caller has no report to read', () => {
    expect(countedSales(all).map((s) => s.id)).toEqual(['a', 'b']);
  });
});

describe('cancelledSales', () => {
  it('is the exact complement of what the board counts: the cancellations', () => {
    const all = [
      sale({ id: 'a', status: 'approved' }),
      sale({ id: 'b', status: 'cancelled' }),
      sale({ id: 'c', status: 'cancelled' }),
    ];
    expect(cancelledSales(all).map((s) => s.id)).toEqual(['b', 'c']);
    // A cancelled sale is never in both lists — the sheet relies on that to
    // decide which list it is arrowing through.
    expect(countedSales(all).some((s) => s.status === 'cancelled')).toBe(false);
  });
});

describe('countInstallBuckets', () => {
  it('counts only live sales', () => {
    const counts = countInstallBuckets(
      [
        sale({ id: 'a', installDate: new Date('2026-09-08T12:00:00') }),
        sale({ id: 'b', installDate: new Date('2026-09-20T12:00:00') }),
        sale({ id: 'c', installDate: undefined }),
        sale({ id: 'd', installDate: undefined, status: 'cancelled' }),
      ],
      undefined,
      NOW
    );
    expect(counts).toEqual({ installed: 1, scheduled: 1, attention: 1 });
  });
});

describe('rollupSalesByRep', () => {
  const sales = [
    sale({ id: 'a', salesRepId: 'r1', salesRepName: 'Noah', totalValue: 200, installDate: new Date('2026-09-08T12:00:00') }),
    sale({ id: 'b', salesRepId: 'r1', salesRepName: 'Noah', totalValue: 300, installDate: undefined }),
    sale({ id: 'c', salesRepId: 'r2', salesRepName: 'Wil', totalValue: 100, installDate: new Date('2026-09-20T12:00:00') }),
    sale({ id: 'd', salesRepId: 'r2', salesRepName: 'Wil', totalValue: 50, status: 'cancelled' }),
  ];

  it('orders reps by monthly value, highest first', () => {
    const reps = rollupSalesByRep(sales, undefined, NOW);
    expect(reps.map((r) => r.repName)).toEqual(['Noah', 'Wil']);
    expect(reps[0].value).toBe(500);
    expect(reps[0].count).toBe(2);
  });

  it('leaves a cancelled sale out of the rep total', () => {
    const wil = rollupSalesByRep(sales, undefined, NOW).find((r) => r.repName === 'Wil')!;
    expect(wil.count).toBe(1);
    expect(wil.value).toBe(100);
  });

  it('puts what needs chasing at the top of a rep’s list', () => {
    const noah = rollupSalesByRep(sales, undefined, NOW).find((r) => r.repName === 'Noah')!;
    expect(noah.sales.map((s) => s.id)).toEqual(['b', 'a']);
  });

  it('groups by rep id so a renamed rep does not split into two rows', () => {
    const reps = rollupSalesByRep(
      [
        sale({ id: 'a', salesRepId: 'r1', salesRepName: 'Wil Teasdale' }),
        sale({ id: 'b', salesRepId: 'r1', salesRepName: 'Will Teasdale' }),
      ],
      undefined,
      NOW
    );
    expect(reps).toHaveLength(1);
    expect(reps[0].count).toBe(2);
  });
});

describe('carrier report coverage (Noah, 2026-10-10)', () => {
  // Sat Oct 10, mid-morning Chicago. The report on file covers Thu Oct 8.
  const SAT = new Date('2026-10-10T15:00:00Z');
  const friday = sale({ installDate: new Date('2026-10-09T17:00:00Z') });
  const pendingFri = { status: 'pending_install', estInstallDate: '2026-10-09' } as FiberOrder;

  it('judges a day only once the report covers it', () => {
    expect(carrierReportCovers('2026-10-08', '2026-10-08', SAT)).toBe(true); // D == asOf
    expect(carrierReportCovers('2026-10-09', '2026-10-08', SAT)).toBe(false); // D == asOf + 1
    expect(carrierReportCovers('2026-10-01', '2026-10-08', SAT)).toBe(true);
    // A stamp days behind holds every later day, however old.
    expect(carrierReportCovers('2026-10-09', '2026-10-08', new Date('2026-10-20T15:00:00Z'))).toBe(false);
  });

  it('gives an unknown stamp a 2-day grace', () => {
    for (const asOf of [null, undefined, '', 'garbage']) {
      expect(carrierReportCovers('2026-10-09', asOf, SAT)).toBe(false); // 1 day back
      expect(carrierReportCovers('2026-10-08', asOf, SAT)).toBe(false); // 2 days back
      expect(carrierReportCovers('2026-10-07', asOf, SAT)).toBe(true); // 3 days back
    }
  });

  it('judges the later of the sale day and the carrier estimate', () => {
    expect(judgedInstallDay(friday, { status: 'pending_install', estInstallDate: '2026-10-05' } as FiberOrder)).toBe('2026-10-09');
    expect(judgedInstallDay(sale({ installDate: new Date('2026-10-05T17:00:00Z') }), pendingFri)).toBe('2026-10-09');
    expect(judgedInstallDay(friday, null)).toBe('2026-10-09');
    expect(judgedInstallDay(sale({ installDate: undefined }), null)).toBeNull();
  });

  it('keeps a Friday install off attention while the report is only through Thursday', () => {
    expect(installBucketForSale(friday, pendingFri, SAT, '2026-10-08')).toBe('scheduled');
    expect(installBucketForSale(friday, order('pre_sale'), SAT, '2026-10-08')).toBe('scheduled');
    expect(awaitingCarrierDay(friday, pendingFri, SAT, '2026-10-08')).toBe('2026-10-09');
    expect(isAwaitingCarrier(friday, pendingFri, SAT, '2026-10-08')).toBe(true);
    expect(awaitingCarrierLabel(friday, pendingFri, SAT, '2026-10-08')).toBe(AWAITING_CARRIER_LABEL);
    expect(AWAITING_CARRIER_LABEL).toBe('Install day passed · waiting on carrier');
    // Once a report covers Friday and still has it pending, it is overdue.
    expect(installBucketForSale(friday, pendingFri, SAT, '2026-10-09')).toBe('attention');
    expect(installAttentionReason(friday, pendingFri)).toBe('overdue');
    expect(awaitingCarrierLabel(friday, pendingFri, SAT, '2026-10-09')).toBeNull();
  });

  it('never waits on a carrier breakage, cancellation or install', () => {
    const broke = { status: 'breakage', estInstallDate: '2026-10-09' } as FiberOrder;
    expect(installBucketForSale(friday, broke, SAT, '2026-10-08')).toBe('attention');
    expect(installAttentionReason(friday, broke)).toBe('missed');
    expect(awaitingCarrierDay(friday, broke, SAT, '2026-10-08')).toBeNull();
    expect(installBucketForSale(friday, order('cancelled'), SAT, '2026-10-08')).toBe('attention');
    expect(installBucketForSale(friday, order('active'), SAT, '2026-10-08')).toBe('installed');
    // No carrier order at all reads installed off its own past date, as before.
    expect(awaitingCarrierDay(friday, null, SAT, '2026-10-08')).toBeNull();
    expect(installBucketForSale(friday, null, SAT, '2026-10-08')).toBe('installed');
  });

  it('reads the install day itself as today, not "passed"', () => {
    // Rescheduled to today while the carrier still has an older estimate.
    const today = sale({ installDate: new Date('2026-10-10T05:00:00Z') });
    const oldEst = { status: 'pending_install', estInstallDate: '2026-10-05' } as FiberOrder;
    expect(installBucketForSale(today, oldEst, SAT, '2026-10-09')).toBe('scheduled');
    expect(isAwaitingCarrier(today, oldEst, SAT, '2026-10-09')).toBe(false);
    expect(awaitingCarrierLabel(today, oldEst, SAT, '2026-10-09')).toBe('Installs today');
  });

  it('counts awaiting installs as scheduled in the counts and the rollups', () => {
    const fiber = new Map([['s1', pendingFri]]);
    expect(countInstallBuckets([friday], fiber, SAT, '2026-10-08')).toEqual({ attention: 0, scheduled: 1, installed: 0 });
    expect(countInstallBuckets([friday], fiber, SAT, '2026-10-09')).toEqual({ attention: 1, scheduled: 0, installed: 0 });
    expect(rollupSalesByRep([friday], fiber, SAT, '2026-10-08')[0].counts.scheduled).toBe(1);
  });
});
