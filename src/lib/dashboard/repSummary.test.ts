import { describe, expect, it } from 'vitest';
import type { FiberOrder, Sale, SaleProduct } from '@/types';
import {
  callsToday,
  formatCallTime,
  needsDateRows,
  recentSaleRows,
  shortName,
  standingFrom,
  summarizePay,
  weekTimeLeft,
  type LeaderboardRow,
} from './repSummary';

const d = (y: number, m: number, day: number) => new Date(y, m - 1, day, 12, 0, 0);
const NOW = d(2026, 9, 22); // a Tuesday

function product(company: string, productId: string): SaleProduct {
  return { company, productId, productName: productId, quantity: 1, unitPrice: 0, totalPrice: 0, points: 0 };
}

let seq = 0;
function sale(overrides: Partial<Sale> = {}): Sale {
  seq += 1;
  return {
    id: `s${seq}`,
    salesRepId: 'me',
    salesRepName: 'Me',
    customerName: `Customer ${seq}`,
    customerAddress: `${seq} Main St`,
    saleType: 'new_service',
    products: [product('tfiber', 'tfiber-1gig')],
    totalValue: 60,
    totalPoints: 8,
    status: 'approved',
    saleDate: d(2026, 9, 2),
    createdAt: d(2026, 9, 2),
    updatedAt: d(2026, 9, 2),
    ...overrides,
  } as Sale;
}

const rates = { tfiber: { 'tfiber-1gig': 130 }, att: { 'att-500': 90 } };
const noFiber = new Map<string, FiberOrder>();

describe('summarizePay', () => {
  it('sums pay by INSTALL date this month, scheduled or completed, not by sale date', () => {
    const sales = [
      sale({ saleDate: d(2026, 9, 3), installDate: d(2026, 9, 10) }), // completed Sep: 130
      sale({ saleDate: d(2026, 9, 18), installDate: d(2026, 9, 29) }), // scheduled Sep: 130
      sale({ saleDate: d(2026, 9, 20) }), // no install date: 130
      sale({ saleDate: d(2026, 9, 21), status: 'cancelled', installDate: d(2026, 9, 25) }), // dead: nowhere
      sale({ saleDate: d(2026, 8, 20), installDate: d(2026, 9, 2), products: [product('att', 'att-500')] }), // sold Aug, installs Sep: 90
      sale({ saleDate: d(2026, 9, 15), installDate: d(2026, 10, 2) }), // sold Sep, installs Oct: not this month
      sale({ saleDate: d(2026, 8, 25), installDate: d(2026, 8, 30), products: [product('att', 'att-500')] }), // Aug: 90
      sale({ saleDate: d(2026, 7, 28), installDate: d(2026, 8, 4) }), // Aug: 130
    ];
    const summary = summarizePay(sales, noFiber, rates, NOW);
    expect(summary.estThisMonth).toBe(350); // 130 + 130 + 90
    expect(summary.deltaPct).toBe(59); // 350 vs 220
    expect(summary.estNoDate).toBe(130);
    // The month's sales COUNT is still by sale date.
    expect(summary.monthCount).toBe(4);
    expect(summary.counts).toEqual({ installed: 1, scheduled: 2, attention: 1 });
  });

  it('keeps sales with no install date out of every month', () => {
    const sales = [sale({ saleDate: d(2026, 9, 1) }), sale({ saleDate: d(2026, 8, 30) })];
    const summary = summarizePay(sales, noFiber, rates, NOW);
    expect(summary.estThisMonth).toBe(0);
    expect(summary.deltaPct).toBeNull();
    expect(summary.estNoDate).toBe(260);
  });

  it('keeps carrier cancellations out of the month and out of no-date', () => {
    const churned = sale({ installDate: d(2026, 9, 9) });
    const undatedCancel = sale({});
    const fiber = new Map<string, FiberOrder>([
      [churned.id!, { status: 'churned' } as FiberOrder],
      [undatedCancel.id!, { status: 'cancelled' } as FiberOrder],
    ]);
    const summary = summarizePay([churned, undatedCancel], fiber, rates, NOW);
    expect(summary.estThisMonth).toBe(0);
    expect(summary.estNoDate).toBe(0);
  });

  it('follows a reschedule into the new month', () => {
    const before = sale({ installDate: d(2026, 9, 29) });
    expect(summarizePay([before], noFiber, rates, NOW).estThisMonth).toBe(130);
    const after = { ...before, installDate: d(2026, 10, 3) };
    expect(summarizePay([after], noFiber, rates, NOW).estThisMonth).toBe(0);
  });

  it('reads the month in America/Chicago', () => {
    // 11pm Aug 31 in Chicago is already Sep 1 in UTC.
    const lateAug31 = new Date('2026-09-01T04:00:00Z');
    const summary = summarizePay([sale({ installDate: lateAug31 })], noFiber, rates, NOW);
    expect(summary.estThisMonth).toBe(0);
    expect(summary.deltaPct).toBe(-100); // it is August's money
  });

  it('reports no plan as null, never $0', () => {
    const summary = summarizePay([sale()], noFiber, null, NOW);
    expect(summary.estThisMonth).toBeNull();
    expect(summary.deltaPct).toBeNull();
    expect(summary.estNoDate).toBeNull();
  });

  it('hides the delta when last month was zero', () => {
    expect(summarizePay([sale()], noFiber, rates, NOW).deltaPct).toBeNull();
  });

  it('finds the next T-Fiber payout window across months of installs', () => {
    const sales = [
      sale({ saleDate: d(2026, 8, 28), installDate: d(2026, 9, 16) }),
      sale({ saleDate: d(2026, 9, 1), installDate: d(2026, 9, 19) }),
      sale({ saleDate: d(2026, 9, 1), installDate: d(2026, 9, 19), products: [product('att', 'att-500')] }),
    ];
    const { payout } = summarizePay(sales, noFiber, rates, NOW);
    expect(payout?.amount).toBe(260);
    expect(payout?.count).toBe(2);
    expect(payout?.scheduled).toBe(0);
  });

  it('gives a scheduled T-Fiber install its payout window too', () => {
    // Today is Sep 22; an install booked for Sep 23 pays Oct 7–11.
    const { payout } = summarizePay([sale({ installDate: d(2026, 9, 23) })], noFiber, rates, NOW);
    expect(payout?.window.start.getDate()).toBe(7);
    expect(payout?.window.start.getMonth()).toBe(9);
    expect(payout?.count).toBe(1);
    expect(payout?.scheduled).toBe(1);
  });

  it('drops a carrier-cancelled sale from the money', () => {
    const cancelled = sale({ saleDate: d(2026, 9, 5), installDate: d(2026, 9, 9) });
    const fiber = new Map<string, FiberOrder>([[cancelled.id!, { status: 'cancelled' } as FiberOrder]]);
    expect(summarizePay([cancelled], fiber, rates, NOW).estThisMonth).toBe(0);
    expect(summarizePay([cancelled], fiber, rates, NOW).payout).toBeNull();
  });
});

describe('summarizePay missed installs', () => {
  it('moves a missed install out of the month, the delta and the payout into estMissed', () => {
    const missed = sale({ saleDate: d(2026, 9, 3), installDate: d(2026, 9, 16) });
    const live = sale({ saleDate: d(2026, 9, 3), installDate: d(2026, 9, 17) });
    const fiber = new Map<string, FiberOrder>([[missed.id!, { status: 'breakage' } as FiberOrder]]);
    const summary = summarizePay([missed, live], fiber, rates, NOW);
    expect(summary.estThisMonth).toBe(130);
    expect(summary.estMissed).toBe(130);
    expect(summary.estNoDate).toBe(0);
    expect(summary.payout?.count).toBe(1);
    expect(summary.payout?.amount).toBe(130);
    // Still a sale this month: it counts as activity, in the attention bucket.
    expect(summary.monthCount).toBe(2);
    expect(summary.counts.attention).toBe(1);
  });

  it('reports estMissed as null without a plan and 0 with none missed', () => {
    expect(summarizePay([sale()], noFiber, null, NOW).estMissed).toBeNull();
    expect(summarizePay([sale()], noFiber, rates, NOW).estMissed).toBe(0);
  });
});

describe('recentSaleRows', () => {
  it('shows a missed install with its est. pay but no payout window', () => {
    const missed = sale({ installDate: d(2026, 9, 16) });
    const fiber = new Map<string, FiberOrder>([[missed.id!, { status: 'breakage' } as FiberOrder]]);
    const [row] = recentSaleRows([missed], fiber, rates, NOW);
    expect(row.status).toBe('missed');
    expect(row.payoutLabel).toBeNull();
    expect(row.estPay).toBe(130);
  });

  it('labels status, est. pay and a payout window for every dated, live T-Fiber sale', () => {
    const rows = recentSaleRows(
      [
        sale({ installDate: d(2026, 9, 16) }),
        sale({ installDate: d(2026, 9, 16), products: [product('att', 'att-500')] }),
        sale({ installDate: d(2026, 9, 30) }),
        sale({}),
        sale({ status: 'cancelled', installDate: d(2026, 9, 10) }),
      ],
      noFiber,
      rates,
      NOW
    );
    expect(rows.map((r) => r.status)).toEqual(['installed', 'installed', 'scheduled', 'needs-date', 'cancelled']);
    expect(rows.map((r) => r.payoutLabel)).toEqual(['Sep 28–Oct 3', null, 'Oct 7–11', null, null]);
    expect(rows[1].estPay).toBe(90);
    expect(rows[4].estPay).toBeNull();
  });

  it('shows at most five', () => {
    expect(recentSaleRows(Array.from({ length: 8 }, () => sale()), noFiber, rates, NOW)).toHaveLength(5);
  });
});

describe('needsDateRows', () => {
  it('lists counted sales with no date or a missed install', () => {
    const missed = sale({ installDate: d(2026, 9, 12) });
    const fiber = new Map<string, FiberOrder>([[missed.id!, { status: 'breakage' } as FiberOrder]]);
    const rows = needsDateRows([sale(), missed, sale({ status: 'cancelled' }), sale({ installDate: d(2026, 9, 30) })], fiber, NOW);
    expect(rows.map((r) => r.missed)).toEqual([false, true]);
  });
});

describe('standingFrom', () => {
  const row = (rank: number, name: string, pts: number, id = name): LeaderboardRow => ({
    salesRepId: id,
    salesRepName: name,
    rank,
    totalPoints: pts,
    totalSales: 1,
  });
  const board = [row(1, 'Ana Lopez', 30), row(2, 'Braeden Carter', 14), row(3, 'Devon Price', 11), row(4, 'Eli Ford', 11)];

  it('reports the gap to the rep one place up', () => {
    const s = standingFrom(board, board[2], 18)!;
    expect(s).toMatchObject({ rank: 3, of: 18, points: 11, ahead: { name: 'Braeden C.', rank: 2, gap: 3 } });
  });

  it('says tied instead of a zero gap', () => {
    const s = standingFrom(board, board[3], 18)!;
    expect(s.ahead).toBeNull();
    expect(s.tiedWith).toBe('Devon P.');
  });

  it('gives the leader their margin', () => {
    expect(standingFrom(board, board[0], 18)!.leadBy).toBe(16);
  });

  it('is null off the board', () => {
    expect(standingFrom(board, null, 18)).toBeNull();
  });
});

describe('helpers', () => {
  it('shortens names', () => {
    expect(shortName('Braeden Carter')).toBe('Braeden C.');
    expect(shortName('Cher')).toBe('Cher');
  });

  it('formats call times', () => {
    expect(formatCallTime('10:00')).toBe('10:00 AM');
    expect(formatCallTime('14:30')).toBe('2:30 PM');
    expect(formatCallTime('00:05')).toBe('12:05 AM');
  });

  it('counts down to the end of the Chicago week', () => {
    // Tue Sep 22 2026 12:00 CDT → Sun Sep 27 00:00 CDT = 4d 12h
    expect(weekTimeLeft(new Date('2026-09-22T17:00:00Z'))).toBe('4d 12h left');
    expect(weekTimeLeft(new Date('2026-09-26T23:30:00Z'))).toBe('5h 30m left');
  });

  it("keeps today's calls in Chicago and drops ones long finished", () => {
    const calls = [
      { id: 'a', title: 'Late', day: 'tuesday' as const, time: '18:00' },
      { id: 'b', title: 'Early', day: 'tuesday' as const, time: '09:00' },
      { id: 'c', title: 'Tomorrow', day: 'wednesday' as const, time: '09:00' },
      { id: 'd', title: 'Off', day: 'tuesday' as const, time: '12:00', active: false },
    ];
    // 10:30 CDT Tuesday: the 09:00 call started 90 minutes ago.
    expect(callsToday(calls, new Date('2026-09-22T15:30:00Z')).map((c) => c.id)).toEqual(['a']);
    // 09:30 CDT: both Tuesday calls still show, soonest first.
    expect(callsToday(calls, new Date('2026-09-22T14:30:00Z')).map((c) => c.id)).toEqual(['b', 'a']);
  });
});
