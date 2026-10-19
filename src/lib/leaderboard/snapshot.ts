// The leaderboard snapshot, pure: every period the board route serves, tallied
// once from the whole sales collection and stored as a few small docs
// (snapshotStore.ts), so a board read costs two doc reads instead of a scan.
//
// The old route read `sales.limit(5000)` with no order on every request: past
// 5,000 sales it ranked whatever slice Firestore happened to return. The
// snapshot is built from EVERY sale (paged), and the serve step below runs the
// same ordering, ranking and history the route always ran, so for a book that
// fits the old read the output is identical (snapshot.test.ts proves it).
//
// Counting lives in ONE function, `countSnapshotSales`: the shared counting
// helper can replace its body without touching anything else here.

import type { FiberOrder, Sale } from '@/types';
import { boardSales, companyFiberBySale, tallyBoard, type BoardScope, type BoardTotals } from '@/lib/leaderboard/board';
import { computeHistory, dayKey, type HistoryEnrichment, type HistoryMetric } from '@/lib/leaderboard/history';
import { boardOrder } from '@/lib/leaderboard/order';
import { chicagoMonthBounds, formatMonthParam, periodBounds } from '@/lib/leaderboard/periods';
import { recentSales, type RecentSale } from '@/lib/leaderboard/team';
import { boardCountedSales } from '@/lib/pay/chargeback';
import { chicagoMonthKey, type MonthKey } from '@/lib/sales/monthWindow';
import { installDayKey } from '@/lib/sales/saleDate';
import { isDemoSale, saleVisibleTo } from '@/lib/users/demoAccount';
import type { CompanyTapeStats } from '@/lib/sales/companyTape';
import { companyTapeFromDocs } from '@/lib/sales/companyTapeDocs';

export const SNAPSHOT_VERSION = 1;
export const SNAPSHOT_SCOPES: readonly BoardScope[] = ['approved', 'submitted'];
export const SNAPSHOT_METRICS: readonly HistoryMetric[] = ['totalPoints', 'totalSales'];
const RECENT_SCAN = 25;
const RECENT_COUNT = 5;

type Data = Record<string, unknown>;
export interface RawSale {
  id: string;
  data: Data;
}

/** One period of one scope, as stored. `history` is null for a closed month. */
export interface PeriodPayload {
  startMs: number;
  /** Null = open end (week, year, all time). */
  endMs: number | null;
  totals: BoardTotals[];
  history: Record<HistoryMetric, Record<string, HistoryEnrichment>> | null;
}

export interface BoardSnapshot {
  version: number;
  builtAtMs: number;
  /** The day keys the snapshot was tallied on; another day means rebuild. */
  validKey: string;
  /** `${scope}:${periodId}` -> payload. periodId: week | year | all | month-YYYY-MM. */
  periods: Record<string, PeriodPayload>;
  /** YYYY-MM of every month with a payload (others read as an empty board). */
  months: string[];
  /** The earliest counted sale's month per scope (the month picker's range). */
  firstMonth: Record<BoardScope, string | null>;
  /** The include=team feed: the newest standing sales. */
  recent: RecentSale[];
  /** Reps owning demo sales: their own boards are built live (they see their own). */
  demoRepIds: string[];
  /** The All Company chat tape (company-stats), over the same sales. */
  tape: CompanyTapeStats;
}

/**
 * THE counting rule the snapshot ranks by. Today it is the board's own
 * (boardSales: in scope, counted like the estimate, less a 120-day chargeback).
 * Swap this body for the shared helper and every period follows.
 */
export function countSnapshotSales<T extends Sale>(
  sales: T[],
  fiberBySale: Map<string, FiberOrder>,
  scope: BoardScope
): T[] {
  return boardSales(sales, fiberBySale, scope);
}

// Firestore hands back Timestamps; the carrier join and the tally read Dates.
export function asDate(value: unknown): Date | undefined {
  if (!value) return undefined;
  if (value instanceof Date) return value;
  const maybe = value as { toDate?: () => Date };
  if (typeof maybe.toDate === 'function') return maybe.toDate();
  const date = new Date(value as string);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

export function toSale(id: string, data: Data): Sale {
  return {
    ...data,
    id,
    saleDate: asDate(data.saleDate),
    installDate: asDate(data.installDate),
    createdAt: asDate(data.createdAt),
  } as unknown as Sale;
}

/** The day keys a snapshot is good for: rank history and the carrier buckets are day-based. */
export function snapshotValidKey(now: Date): string {
  return `${dayKey(now)}|${installDayKey(now) ?? ''}`;
}

export function monthPeriodId(key: MonthKey): string {
  return `month-${formatMonthParam(key)}`;
}

export function periodKey(scope: BoardScope, periodId: string): string {
  return `${scope}:${periodId}`;
}

function rankedByMetric(totals: BoardTotals[], metric: HistoryMetric): BoardTotals[] {
  return [...totals].sort((a, b) => boardOrder(
    { score: a[metric], name: a.salesRepName, id: a.salesRepId },
    { score: b[metric], name: b.salesRepName, id: b.salesRepId },
  ));
}

function payloadFor(
  counted: Sale[],
  start: Date,
  end: Date | null,
  withHistory: boolean,
  now: Date
): PeriodPayload {
  const { totals, allSales, periodSales } = tallyBoard(counted, start.getTime(), end ? end.getTime() : Infinity);
  let history: PeriodPayload['history'] = null;
  if (withHistory) {
    history = { totalPoints: {}, totalSales: {} };
    for (const metric of SNAPSHOT_METRICS) {
      try {
        const ranked = rankedByMetric(totals, metric);
        const enrichment = computeHistory({
          periodSales,
          allSales,
          currentRanks: new Map(ranked.map((entry, index) => [entry.salesRepId, index + 1])),
          periodStartKey: dayKey(start),
          metric,
          now,
        });
        history[metric] = Object.fromEntries(enrichment);
      } catch (historyError) {
        // Fail-soft, as the route always was: no history beats no board.
        console.error('Leaderboard history enrichment failed:', historyError);
      }
    }
  }
  return { startMs: start.getTime(), endMs: end ? end.getTime() : null, totals, history };
}

/**
 * Every period of every scope, from EVERY sale (any status: the carrier join
 * needs them all) and every carrier order. `viewerUid` decides which demo
 * sales are seen: none for the shared snapshot, the viewer's own for a demo
 * account's live board.
 */
export function buildBoardSnapshot(
  rawSales: readonly RawSale[],
  orders: FiberOrder[],
  opts: { now: Date; reportAsOf?: string | null; viewerUid?: string | null }
): BoardSnapshot {
  const { now } = opts;
  const sales: Sale[] = [];
  const rawById = new Map<string, Data>();
  const demoRepIds = new Set<string>();
  for (const { id, data } of rawSales) {
    if (isDemoSale(data) && typeof data.salesRepId === 'string') demoRepIds.add(data.salesRepId);
    if (!saleVisibleTo(data, opts.viewerUid ?? null)) continue;
    rawById.set(id, data);
    sales.push(toSale(id, data));
  }

  let fiberBySale = new Map<string, FiberOrder>();
  try {
    fiberBySale = companyFiberBySale(sales, orders, { now, reportAsOf: opts.reportAsOf ?? null });
  } catch (carrierError) {
    console.error('Leaderboard carrier report failed:', carrierError);
  }

  const currentMonth = chicagoMonthKey(now);
  const currentMonthId = formatMonthParam(currentMonth);
  const periods: Record<string, PeriodPayload> = {};
  const months = new Set<string>([currentMonthId]);
  const firstMonth: Record<BoardScope, string | null> = { approved: null, submitted: null };

  for (const scope of SNAPSHOT_SCOPES) {
    const counted = countSnapshotSales(sales, fiberBySale, scope);

    for (const period of ['week', 'year', 'all'] as const) {
      const bounds = periodBounds(period, now);
      periods[periodKey(scope, period)] = payloadFor(counted, bounds?.start ?? new Date(0), null, true, now);
    }

    // Every month a counted sale falls in, up to this one (a later month is refused).
    const monthKeys = new Map<string, MonthKey>([[currentMonthId, currentMonth]]);
    let earliest = Infinity;
    for (const sale of counted) {
      const time = (sale.saleDate instanceof Date ? sale.saleDate : new Date(sale.saleDate as unknown as string)).getTime();
      if (time < earliest) earliest = time;
      if (!Number.isFinite(time)) continue;
      const key = chicagoMonthKey(new Date(time));
      const id = formatMonthParam(key);
      if (id <= currentMonthId) monthKeys.set(id, key);
    }
    firstMonth[scope] = Number.isFinite(earliest) ? formatMonthParam(chicagoMonthKey(new Date(earliest))) : null;

    for (const [id, key] of monthKeys) {
      const bounds = chicagoMonthBounds(key);
      const current = id === currentMonthId;
      const payload = payloadFor(counted, bounds.start, bounds.end, current, now);
      if (!current && payload.totals.length === 0) continue;
      periods[periodKey(scope, monthPeriodId(key))] = payload;
      months.add(id);
    }
  }

  // The newest logged sales that still stand (any scope): a carrier
  // cancellation (or a disconnect within 120 days) leaves the feed as it
  // leaves the board.
  const recentDocs = boardCountedSales(sales, fiberBySale)
    .sort((a, b) => (asDate(b.createdAt)?.getTime() ?? 0) - (asDate(a.createdAt)?.getTime() ?? 0))
    .slice(0, RECENT_SCAN)
    .flatMap((sale): Data[] => {
      const raw = rawById.get(sale.id || '');
      return raw ? [raw] : [];
    });

  return {
    version: SNAPSHOT_VERSION,
    builtAtMs: now.getTime(),
    validKey: snapshotValidKey(now),
    periods,
    months: [...months].sort(),
    firstMonth,
    recent: recentSales(recentDocs, RECENT_COUNT),
    demoRepIds: [...demoRepIds].sort(),
    tape: companyTapeFromDocs(rawSales, opts.viewerUid ?? null, now),
  };
}

/** A period the snapshot holds no payload for: nothing counted in it. */
export function emptyPayload(start: Date, end: Date | null, withHistory: boolean): PeriodPayload {
  return {
    startMs: start.getTime(),
    endMs: end ? end.getTime() : null,
    totals: [],
    history: withHistory ? { totalPoints: {}, totalSales: {} } : null,
  };
}

export interface ServedRow extends BoardTotals {
  rank: number;
  movement: number | null;
  spark: (number | null)[];
  streakDays: number;
}

/**
 * The ranked rows the route returns, from one period payload: ordered by the
 * metric (boardOrder), ranked over the FULL list (so the caller's rank holds
 * below the cutoff), cut to `limit`, with the rank history attached.
 */
export function serveBoard(
  payload: PeriodPayload,
  opts: { metric: HistoryMetric; limit: number; viewerUid: string }
): { leaderboard: ServedRow[]; totalRanked: number; currentUser: ServedRow | null; rankedIds: string[] } {
  const fullyRanked = rankedByMetric(payload.totals, opts.metric).map((entry, index) => ({ ...entry, rank: index + 1 }));
  const history = payload.history?.[opts.metric] ?? null;
  const withHistory = (entry: BoardTotals & { rank: number }): ServedRow => {
    const h = history?.[entry.salesRepId];
    return {
      ...entry,
      movement: h?.movement ?? null,
      spark: h?.spark ?? [],
      streakDays: h?.streakDays ?? 0,
    };
  };
  const current = fullyRanked.find((entry) => entry.salesRepId === opts.viewerUid) ?? null;
  return {
    leaderboard: fullyRanked.slice(0, opts.limit).map(withHistory),
    totalRanked: fullyRanked.length,
    currentUser: current ? withHistory(current) : null,
    rankedIds: fullyRanked.map((entry) => entry.salesRepId),
  };
}

/** The one period a board request reads, out of a whole in-memory snapshot. */
export function periodFromSnapshot(
  snapshot: BoardSnapshot,
  req: { scope: BoardScope; periodId: string; start: Date; end: Date | null; withHistory: boolean }
): { payload: PeriodPayload; firstMonth: Record<BoardScope, string | null>; recent: RecentSale[] } {
  return {
    payload: snapshot.periods[periodKey(req.scope, req.periodId)] ?? emptyPayload(req.start, req.end, req.withHistory),
    firstMonth: snapshot.firstMonth,
    recent: snapshot.recent,
  };
}
