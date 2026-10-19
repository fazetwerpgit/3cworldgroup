import { describe, expect, it } from 'vitest';
import type { FiberOrder, Sale } from '@/types';
import { computeHistory, dayKey, type HistoryEnrichment } from '@/lib/leaderboard/history';
import { boardSales, companyFiberBySale, tallyBoard } from '@/lib/leaderboard/board';
import { boardCountedSales } from '@/lib/pay/chargeback';
import { chicagoMonthBounds, formatMonthParam, parseLeaderboardMonth, periodBounds } from '@/lib/leaderboard/periods';
import { chicagoMonthKey, type MonthKey } from '@/lib/sales/monthWindow';
import { boardOrder } from '@/lib/leaderboard/order';
import { recentSales } from '@/lib/leaderboard/team';
import { saleVisibleTo } from '@/lib/users/demoAccount';
import {
  buildBoardSnapshot,
  monthPeriodId,
  periodFromSnapshot,
  serveBoard,
  type BoardSnapshot,
  type RawSale,
} from '@/lib/leaderboard/snapshot';
import { NOW, fixture } from '@/lib/leaderboard/snapshot.fixture';

// ---------------------------------------------------------------------------
// The leaderboard route as it was before the snapshot (origin/master d9c5240f,
// api/portal/leaderboard/route.ts), its pure part copied verbatim: the sales
// read in, then the carrier join, tally, ranking, history, feed and month
// range. The snapshot must give the same answer for every request.
// ---------------------------------------------------------------------------

function asDate(value: unknown): Date | undefined {
  if (!value) return undefined;
  if (value instanceof Date) return value;
  const maybe = value as { toDate?: () => Date };
  if (typeof maybe.toDate === 'function') return maybe.toDate();
  const date = new Date(value as string);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

function toSale(id: string, data: Record<string, unknown>): Sale {
  return {
    ...data,
    id,
    saleDate: asDate(data.saleDate),
    installDate: asDate(data.installDate),
    createdAt: asDate(data.createdAt),
  } as unknown as Sale;
}

interface Params {
  period: string;
  metric: string;
  scope: 'approved' | 'submitted';
  limit: number;
  month?: string;
  uid: string;
}

function legacyBoard(docs: RawSale[], orders: FiberOrder[], reportAsOf: string | null, p: Params, now: Date) {
  const boardPeriod = p.period === 'week' || p.period === 'year' || p.period === 'all' ? p.period : 'month';
  let monthView: { key: MonthKey; current: boolean } | null = null;
  if (boardPeriod === 'month') {
    const parsed = parseLeaderboardMonth(p.month ?? null, now);
    if (!parsed.ok) throw new Error(parsed.error);
    monthView = { key: parsed.month, current: parsed.current };
  }
  const pastMonth = monthView !== null && !monthView.current;
  const bounds = monthView ? chicagoMonthBounds(monthView.key) : periodBounds(boardPeriod, now);
  const startDate = bounds?.start ?? new Date(0);
  const endTime = monthView && bounds ? bounds.end.getTime() : Infinity;

  const sales: Sale[] = [];
  const rawById = new Map<string, Record<string, unknown>>();
  docs.forEach((doc) => {
    if (!saleVisibleTo(doc.data, p.uid)) return;
    rawById.set(doc.id, doc.data);
    sales.push(toSale(doc.id, doc.data));
  });
  let fiberBySale = new Map<string, FiberOrder>();
  try {
    fiberBySale = companyFiberBySale(sales, orders, { now, reportAsOf });
  } catch {
    /* fail-soft */
  }
  const { totals: leaderboard, allSales, periodSales } = tallyBoard(
    boardSales(sales, fiberBySale, p.scope),
    startDate.getTime(),
    endTime
  );
  const score = p.metric === 'totalSales' ? 'totalSales' : 'totalPoints';
  leaderboard.sort((a, b) => boardOrder(
    { score: a[score], name: a.salesRepName, id: a.salesRepId },
    { score: b[score], name: b.salesRepName, id: b.salesRepId },
  ));
  const fullyRanked = leaderboard.map((entry, index) => ({ ...entry, rank: index + 1 }));
  let history: Map<string, HistoryEnrichment> | null = null;
  if (!pastMonth) {
    history = computeHistory({
      periodSales,
      allSales,
      currentRanks: new Map(fullyRanked.map((e) => [e.salesRepId, e.rank])),
      periodStartKey: dayKey(startDate),
      metric: score,
      now,
    });
  }
  const withHistory = <T extends { salesRepId: string }>(entry: T) => {
    const h = history?.get(entry.salesRepId);
    return { ...entry, movement: h?.movement ?? null, spark: h?.spark ?? [], streakDays: h?.streakDays ?? 0 };
  };
  const rankedLeaderboard = fullyRanked.slice(0, p.limit).map(withHistory);
  const rawCurrentUser = fullyRanked.find((e) => e.salesRepId === p.uid) ?? null;
  const recentDocs = boardCountedSales(sales, fiberBySale)
    .sort((a, b) => (asDate(b.createdAt)?.getTime() ?? 0) - (asDate(a.createdAt)?.getTime() ?? 0))
    .slice(0, 25)
    .flatMap((sale): Array<Record<string, unknown>> => {
      const raw = rawById.get(sale.id || '');
      return raw ? [raw] : [];
    });
  let monthFields: { month: string; firstMonth: string | null; endDate: Date } | null = null;
  if (monthView && bounds) {
    let earliest = Infinity;
    for (const record of allSales) {
      const time = record.saleDate.getTime();
      if (time < earliest) earliest = time;
    }
    monthFields = {
      month: formatMonthParam(monthView.key),
      firstMonth: Number.isFinite(earliest) ? formatMonthParam(chicagoMonthKey(new Date(earliest))) : null,
      endDate: bounds.end,
    };
  }
  return json({
    startDate,
    ...(monthFields ?? {}),
    leaderboard: rankedLeaderboard,
    totalRanked: fullyRanked.length,
    currentUser: rawCurrentUser ? withHistory(rawCurrentUser) : null,
    recent: pastMonth ? undefined : recentSales(recentDocs, 5),
  });
}

/** The new route's flow over a snapshot that went through storage (JSON). */
function snapshotBoard(stored: BoardSnapshot, p: Params, now: Date) {
  const boardPeriod = p.period === 'week' || p.period === 'year' || p.period === 'all' ? p.period : 'month';
  let monthView: { key: MonthKey; current: boolean } | null = null;
  if (boardPeriod === 'month') {
    const parsed = parseLeaderboardMonth(p.month ?? null, now);
    if (!parsed.ok) throw new Error(parsed.error);
    monthView = { key: parsed.month, current: parsed.current };
  }
  const pastMonth = monthView !== null && !monthView.current;
  const bounds = monthView ? chicagoMonthBounds(monthView.key) : periodBounds(boardPeriod, now);
  const startDate = bounds?.start ?? new Date(0);
  const board = periodFromSnapshot(stored, {
    scope: p.scope,
    periodId: monthView ? monthPeriodId(monthView.key) : boardPeriod,
    start: startDate,
    end: monthView && bounds ? bounds.end : null,
    withHistory: !pastMonth,
  });
  const served = serveBoard(board.payload, {
    metric: p.metric === 'totalSales' ? 'totalSales' : 'totalPoints',
    limit: p.limit,
    viewerUid: p.uid,
  });
  return json({
    startDate,
    ...(monthView && bounds
      ? { month: formatMonthParam(monthView.key), firstMonth: board.firstMonth[p.scope] ?? null, endDate: bounds.end }
      : {}),
    leaderboard: served.leaderboard,
    totalRanked: served.totalRanked,
    currentUser: served.currentUser,
    recent: pastMonth ? undefined : board.recent,
  });
}

function json<T>(value: T): unknown {
  return JSON.parse(JSON.stringify(value));
}

// The fixture: a deterministic book over ~5 months (snapshot.test.fixture).

function requests(uids: string[]): Params[] {
  const out: Params[] = [];
  const months = [undefined, '2026-10', '2026-09', '2026-08', '2026-06', '2026-05', '2025-01'];
  for (const uid of uids) {
    for (const scope of ['approved', 'submitted'] as const) {
      for (const metric of ['totalPoints', 'totalSales']) {
        for (const limit of [5, 1000]) {
          for (const period of ['week', 'year', 'all', 'bogus']) out.push({ period, metric, scope, limit, uid });
          for (const month of months) out.push({ period: 'month', month, metric, scope, limit, uid });
        }
      }
    }
  }
  return out;
}

describe('leaderboard snapshot matches the old live route', () => {
  const { docs, orders } = fixture(400);
  const reportAsOf = '2026-10-13';
  const stored = json(buildBoardSnapshot(docs, orders, { now: NOW, reportAsOf })) as BoardSnapshot;

  it('gives the identical response for every period, month, metric, scope, limit and viewer', () => {
    let compared = 0;
    for (const p of requests(['rep0', 'rep5', 'nobody'])) {
      expect(snapshotBoard(stored, p, NOW), JSON.stringify(p)).toEqual(legacyBoard(docs, orders, reportAsOf, p, NOW));
      compared += 1;
    }
    expect(compared).toBeGreaterThan(250);
  }, 120_000);

  it('really ranks: the fixture puts many reps on the boards, with history', () => {
    const monthly = snapshotBoard(stored, { period: 'month', metric: 'totalPoints', scope: 'approved', limit: 100, uid: 'rep0' }, NOW) as {
      leaderboard: Array<{ spark: unknown[] }>;
      totalRanked: number;
    };
    expect(monthly.totalRanked).toBeGreaterThan(8);
    expect(monthly.leaderboard.some((row) => row.spark.some((v) => v !== null))).toBe(true);
  });

  it('builds the demo account its own board live, identical to the old route', () => {
    const demoSnapshot = json(buildBoardSnapshot(docs, orders, { now: NOW, reportAsOf, viewerUid: 'demo' })) as BoardSnapshot;
    expect(stored.demoRepIds).toEqual(['demo']);
    for (const p of requests(['demo']).filter((_, i) => i % 3 === 0)) {
      expect(snapshotBoard(demoSnapshot, p, NOW)).toEqual(legacyBoard(docs, orders, reportAsOf, p, NOW));
    }
  }, 60_000);

  it('matches with no carrier report at all', () => {
    const bare = json(buildBoardSnapshot(docs, [], { now: NOW, reportAsOf: null })) as BoardSnapshot;
    for (const p of requests(['rep2']).filter((_, i) => i % 4 === 0)) {
      expect(snapshotBoard(bare, p, NOW)).toEqual(legacyBoard(docs, [], null, p, NOW));
    }
  }, 60_000);

  it('counts every sale past 5,000, where the old read cut an arbitrary slice', () => {
    const big = fixture(6000);
    const snapshot = buildBoardSnapshot(big.docs, [], { now: NOW });
    const allTime = serveBoard(snapshot.periods['approved:all'], { metric: 'totalSales', limit: 1000, viewerUid: 'x' });
    const counted = allTime.leaderboard.reduce((sum, row) => sum + row.totalSales, 0);
    const expected = big.docs.filter((d) => d.data.status === 'approved' && !d.data.demoAccount).length;
    expect(counted).toBe(expected);
    expect(counted).toBeGreaterThan(3000);
  }, 60_000);

  it('serves the stored payload size well under the 1 MiB doc limit for a 6,000-sale book', () => {
    const big = fixture(6000);
    const snapshot = buildBoardSnapshot(big.docs, [], { now: NOW });
    for (const payload of Object.values(snapshot.periods)) {
      expect(JSON.stringify(payload).length).toBeLessThan(900_000);
    }
  }, 60_000);
});
