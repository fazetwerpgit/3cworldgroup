// Pure rank-history helpers for the leaderboard. No Firestore imports — the
// API route passes in plain sale records so all of this is unit-testable.

import { boardOrder } from '@/lib/leaderboard/order';
import { INSTALL_DATE_TIME_ZONE } from '@/lib/sales/saleDate';

// The company's clock (US Central), the same one every leaderboard period uses
// (periods.ts): "today", "yesterday", the spark's days and streaks all turn
// over at Chicago midnight, never New York's.
export const LEADERBOARD_TZ = INSTALL_DATE_TIME_ZONE;

export interface SaleRecord {
  salesRepId: string;
  saleDate: Date;
  totalPoints: number;
  /** The board's tie-break (boardOrder: name A to Z, then id). */
  salesRepName?: string;
}

export interface HistoryEnrichment {
  movement: number | null;
  spark: (number | null)[];
  streakDays: number;
}

export type HistoryMetric = 'totalPoints' | 'totalSales';

// YYYY-MM-DD in the company timezone. en-CA locale formats as YYYY-MM-DD.
// One formatter per zone: building an Intl.DateTimeFormat costs far more than
// formatting with it, and history formats every sale several times.
const DAY_KEY_FORMATTERS = new Map<string, Intl.DateTimeFormat>();
export function dayKey(date: Date, tz: string = LEADERBOARD_TZ): string {
  let formatter = DAY_KEY_FORMATTERS.get(tz);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: tz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    DAY_KEY_FORMATTERS.set(tz, formatter);
  }
  return formatter.format(date);
}

// Calendar-day arithmetic on keys via UTC noon, immune to DST edges.
export function addDaysToKey(key: string, days: number): string {
  const d = new Date(`${key}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function isWeekendKey(key: string): boolean {
  const dow = new Date(`${key}T12:00:00Z`).getUTCDay();
  return dow === 0 || dow === 6;
}

function ranksAsOfDay(
  periodSales: SaleRecord[],
  cutoffKey: string,
  metric: HistoryMetric,
): Map<string, number> {
  const agg = new Map<string, { totalSales: number; totalPoints: number; name: string }>();
  for (const s of periodSales) {
    if (dayKey(s.saleDate) > cutoffKey) continue;
    const cur = agg.get(s.salesRepId) ?? { totalSales: 0, totalPoints: 0, name: s.salesRepName ?? '' };
    cur.totalSales += 1;
    cur.totalPoints += s.totalPoints;
    agg.set(s.salesRepId, cur);
  }
  // The board's own order (boardOrder), so a tie ranks the same here as on
  // the row and never shows as movement or a spark jump.
  const sorted = [...agg.entries()].sort((a, b) =>
    boardOrder(
      { score: a[1][metric], name: a[1].name, id: a[0] },
      { score: b[1][metric], name: b[1].name, id: b[0] },
    ),
  );
  return new Map(sorted.map(([repId], index) => [repId, index + 1]));
}

// Display consecutive selling days only when there was a sale today or on
// calendar yesterday. Weekends without a sale are skipped (never break),
// today without a sale is grace, a saleless weekday stops the walk. Capped at
// 365 days.
export function computeStreak(saleDayKeys: Set<string>, todayKey: string): number {
  const yesterdayKey = addDaysToKey(todayKey, -1);
  if (!saleDayKeys.has(todayKey) && !saleDayKeys.has(yesterdayKey)) return 0;

  let streak = 0;
  let key = todayKey;
  for (let i = 0; i < 365; i++) {
    if (saleDayKeys.has(key)) {
      streak += 1;
    } else if (key !== todayKey && !isWeekendKey(key)) {
      break;
    }
    key = addDaysToKey(key, -1);
  }
  return streak;
}

export function computeHistory(opts: {
  periodSales: SaleRecord[];
  allSales: SaleRecord[];
  currentRanks: Map<string, number>;
  periodStartKey: string;
  metric: HistoryMetric;
  now: Date;
}): Map<string, HistoryEnrichment> {
  const { periodSales, allSales, currentRanks, periodStartKey, metric, now } = opts;
  const todayKey = dayKey(now);

  const rankCache = new Map<string, Map<string, number>>();
  const ranksAt = (cutoffKey: string) => {
    let ranks = rankCache.get(cutoffKey);
    if (!ranks) {
      ranks = ranksAsOfDay(periodSales, cutoffKey, metric);
      rankCache.set(cutoffKey, ranks);
    }
    return ranks;
  };

  const yesterdayRanks = ranksAt(addDaysToKey(todayKey, -1));
  const sparkKeys = Array.from({ length: 7 }, (_, i) => addDaysToKey(todayKey, i - 6));

  const saleDaysByRep = new Map<string, Set<string>>();
  for (const s of allSales) {
    let days = saleDaysByRep.get(s.salesRepId);
    if (!days) {
      days = new Set();
      saleDaysByRep.set(s.salesRepId, days);
    }
    days.add(dayKey(s.saleDate));
  }

  const result = new Map<string, HistoryEnrichment>();
  for (const [repId, currentRank] of currentRanks) {
    const yesterdayRank = yesterdayRanks.get(repId);
    const movement = yesterdayRank === undefined ? null : yesterdayRank - currentRank;
    const spark = sparkKeys.map((key) =>
      key < periodStartKey ? null : (ranksAt(key).get(repId) ?? null),
    );
    const streakDays = computeStreak(saleDaysByRep.get(repId) ?? new Set(), todayKey);
    result.set(repId, { movement, spark, streakDays });
  }
  return result;
}
