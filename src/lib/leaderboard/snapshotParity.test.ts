import { describe, expect, it } from 'vitest';
import type { FiberOrder, Sale } from '@/types';
import { companyFiberBySale } from '@/lib/leaderboard/board';
import { periodBounds } from '@/lib/leaderboard/periods';
import { chicagoMonthKey } from '@/lib/sales/monthWindow';
import { summarizeCompanySales, tapeForViewer } from '@/lib/sales/companyTapeStats';
import { boardRowsFromTotals, countedBoardSales, rankBoard } from '@/lib/ask/liveData';
import { saleVisibleTo } from '@/lib/users/demoAccount';
import { buildBoardSnapshot, monthPeriodId, periodFromSnapshot, type BoardSnapshot } from '@/lib/leaderboard/snapshot';
import { NOW, fixture } from '@/lib/leaderboard/snapshot.fixture';

// The company tape and Ask's Board now read the leaderboard snapshot instead of
// every sale. Each must give exactly what its live read gave: the tape as
// company-stats counted it (summarizeCompanySales over every visible sale and
// the carrier join), Ask's week and month as liveData counted them
// (countedBoardSales + rankBoard).

const toDate = (value: unknown): Date | undefined => {
  if (!value) return undefined;
  if (value instanceof Date) return value;
  const maybe = value as { toDate?: () => Date };
  if (typeof maybe.toDate === 'function') return maybe.toDate();
  const date = new Date(value as string);
  return Number.isNaN(date.getTime()) ? undefined : date;
};

/** The sales a live read saw: every sale (viewerUid undefined), or those `viewerUid` may see. */
function liveSales(docs: ReturnType<typeof fixture>['docs'], viewerUid?: string): Sale[] {
  return docs
    .filter((doc) => viewerUid === undefined || saleVisibleTo(doc.data, viewerUid))
    .map(({ id, data }) => ({
      ...data,
      id,
      saleDate: toDate(data.saleDate),
      installDate: toDate(data.installDate),
      createdAt: toDate(data.createdAt),
      approvedAt: toDate(data.approvedAt),
    }) as unknown as Sale);
}

const json = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

describe('snapshot parity with the live reads it replaced', () => {
  const { docs, orders } = fixture(400);
  const reportAsOf = '2026-10-13';
  const stored = json(buildBoardSnapshot(docs, orders, { now: NOW, reportAsOf }));

  it('the stored tape is the company-stats tape, for an owner and a rep', () => {
    const sales = liveSales(docs, 'someone');
    const fiber = companyFiberBySale(sales, orders as FiberOrder[], { now: NOW, reportAsOf });
    const live = summarizeCompanySales(sales, fiber, periodBounds('month', NOW)!);
    expect(live.mtdCount).toBeGreaterThan(0);
    expect(tapeForViewer(stored.tape, { isOwner: true })).toEqual(live);
    const { mtdMonthlyValue: _value, ...repView } = live;
    expect(tapeForViewer(stored.tape, { isOwner: false })).toEqual(repView);
  });

  it("Ask's week and month are the snapshot's, ranked the same", () => {
    const counted = countedBoardSales(liveSales(docs), orders as FiberOrder[], { now: NOW, reportAsOf });
    const periods = ['week', 'month'] as const;
    const bounds = periods.map((period) => periodBounds(period, NOW)!);
    for (const viewer of ['rep0', 'rep5', 'nobody']) {
      const live = rankBoard(counted, bounds.map((b) => b.start.getTime()), viewer, bounds.map((b) => b.end.getTime()));
      const fromSnapshot = periods.map((period, i) =>
        boardRowsFromTotals(
          periodFromSnapshot(stored as BoardSnapshot, {
            scope: 'approved',
            periodId: period === 'month' ? monthPeriodId(chicagoMonthKey(NOW)) : period,
            start: bounds[i].start,
            end: bounds[i].end,
            withHistory: false,
          }).payload.totals
        )
      );
      expect(live[0].length + live[1].length).toBeGreaterThan(0);
      expect(fromSnapshot).toEqual(live);
    }
  });
});
