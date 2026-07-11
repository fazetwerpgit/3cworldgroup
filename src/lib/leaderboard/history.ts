// Pure rank-history helpers for the leaderboard. No Firestore imports — the
// API route passes in plain sale records so all of this is unit-testable.

export const LEADERBOARD_TZ = 'America/New_York';

export interface SaleRecord {
  salesRepId: string;
  saleDate: Date;
  totalPoints: number;
}

export interface HistoryEnrichment {
  movement: number | null;
  spark: (number | null)[];
  streakDays: number;
}

export type HistoryMetric = 'totalPoints' | 'totalSales';

// YYYY-MM-DD in the company timezone. en-CA locale formats as YYYY-MM-DD.
export function dayKey(date: Date, tz: string = LEADERBOARD_TZ): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
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
  const agg = new Map<string, { totalSales: number; totalPoints: number }>();
  for (const s of periodSales) {
    if (dayKey(s.saleDate) > cutoffKey) continue;
    const cur = agg.get(s.salesRepId) ?? { totalSales: 0, totalPoints: 0 };
    cur.totalSales += 1;
    cur.totalPoints += s.totalPoints;
    agg.set(s.salesRepId, cur);
  }
  const sorted = [...agg.entries()].sort((a, b) =>
    metric === 'totalSales'
      ? b[1].totalSales - a[1].totalSales
      : b[1].totalPoints - a[1].totalPoints,
  );
  return new Map(sorted.map(([repId], index) => [repId, index + 1]));
}

// Consecutive selling days walking back from today. Weekends without a sale
// are skipped (never break), today without a sale is grace, a saleless
// weekday stops the walk. Capped at 365 days.
export function computeStreak(saleDayKeys: Set<string>, todayKey: string): number {
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
