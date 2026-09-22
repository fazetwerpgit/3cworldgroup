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
  it('sums this calendar month by sale date and compares with last month', () => {
    const sales = [
      sale({ saleDate: d(2026, 9, 3), installDate: d(2026, 9, 10) }),
      sale({ saleDate: d(2026, 9, 18), installDate: d(2026, 9, 29) }),
      sale({ saleDate: d(2026, 9, 20) }),
      sale({ saleDate: d(2026, 9, 21), status: 'cancelled' }),
      sale({ saleDate: d(2026, 8, 20), installDate: d(2026, 9, 2), products: [product('att', 'att-500')] }),
      sale({ saleDate: d(2026, 8, 25), installDate: d(2026, 8, 30), products: [product('att', 'att-500')] }),
    ];
    const summary = summarizePay(sales, noFiber, rates, NOW);
    expect(summary.estThisMonth).toBe(390);
    expect(summary.deltaPct).toBe(117); // 390 vs 180
    expect(summary.monthCount).toBe(3);
    expect(summary.counts).toEqual({ installed: 1, scheduled: 1, attention: 1 });
  });

  it('reports no plan as null, never $0', () => {
    const summary = summarizePay([sale()], noFiber, null, NOW);
    expect(summary.estThisMonth).toBeNull();
    expect(summary.deltaPct).toBeNull();
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
  });

  it('drops a carrier-cancelled sale from the money', () => {
    const cancelled = sale({ saleDate: d(2026, 9, 5), installDate: d(2026, 9, 9) });
    const fiber = new Map<string, FiberOrder>([[cancelled.id!, { status: 'cancelled' } as FiberOrder]]);
    expect(summarizePay([cancelled], fiber, rates, NOW).estThisMonth).toBe(0);
  });
});

describe('recentSaleRows', () => {
  it('labels status, est. pay and a payout window only for installed T-Fiber', () => {
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
    expect(rows.map((r) => r.payoutLabel)).toEqual(['Sep 28–Oct 3', null, null, null, null]);
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
