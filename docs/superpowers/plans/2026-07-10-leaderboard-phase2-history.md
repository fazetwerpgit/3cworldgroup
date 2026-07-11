# Leaderboard Phase 2 (Rank History) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add movement arrows (vs yesterday), 7-day rank sparklines, and selling-day streaks to the portal leaderboard, computed on the fly from existing sales data — no new storage or cron.

**Architecture:** Pure history functions in `src/lib/leaderboard/history.ts` replay the already-loaded approved-sales dataset with earlier day cutoffs to reconstruct past ranks. `/api/portal/leaderboard` calls them and appends `movement`/`spark`/`streakDays` to each entry (fail-soft). The Broadcast UI (`LeaderboardTable.tsx`) renders the three new elements.

**Tech Stack:** Next.js 16 App Router, TypeScript strict, Tailwind v4, vitest (colocated `*.test.ts`), lucide-react icons. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-07-10-leaderboard-phase2-design.md` — read it first.

## Global Constraints

- Day bucketing timezone: `LEADERBOARD_TZ = 'America/New_York'` for ALL day boundaries (movement, spark, streak). Never bucket by server UTC.
- Streak = consecutive days with ≥1 approved sale; Saturday/Sunday without a sale NEVER breaks it; today without a sale doesn't break it (grace); a saleless weekday breaks it; walk capped at 365 days; streak is period-independent (uses all approved sales).
- Movement = yesterdayRank − currentRank (positive = climbed); `null` = unranked yesterday (render "New"); if EVERY entry's movement is null (first day of a period), render a neutral dash on all rows instead of "New" everywhere.
- `spark` = exactly 7 entries, oldest→newest, ending today; rank as of end of that day; `null` when unranked that day or the day predates the period start; nulls break the drawn line.
- Streak chip renders only when `streakDays >= 2`.
- Sparkline is hidden below the `sm` breakpoint and never shown on the podium cards.
- History enrichment is fail-soft: on error, log and serve entries with `movement: null`, `spark: []`, `streakDays: 0` — the leaderboard must still load.
- No new Firestore collections, rules, indexes, or cron jobs. No changes to the existing period-start logic, period/metric controls, weekly challenge, or ticker.
- Design system: follow existing tokens in `LeaderboardTable.tsx` (green `#5f8f20`/dark `#8dc63f`, navy `#0A1F44`, slate neutrals, `rounded-lg`, dark: variants on everything). Use lucide icons, not emoji/decorative text symbols.
- New API fields are OPTIONAL on client types (`movement?`, `spark?`, `streakDays?`) so the UI tolerates their absence.

## File Structure

- Create: `src/lib/leaderboard/history.ts` — pure day-bucketing/rank-replay/streak functions (no Firestore imports)
- Create: `src/lib/leaderboard/history.test.ts`
- Create: `src/lib/leaderboard/sparkline.ts` — pure SVG geometry for the trend line
- Create: `src/lib/leaderboard/sparkline.test.ts`
- Create: `src/components/leaderboard/Sparkline.tsx` — tiny presentational SVG component
- Modify: `src/app/api/portal/leaderboard/route.ts` — collect sale records, call `computeHistory`, enrich response
- Modify: `src/hooks/useLeaderboard.ts` — extend `LeaderboardEntry` interface (optional fields)
- Modify: `src/components/leaderboard/LeaderboardTable.tsx` — `MovementIndicator`, `StreakChip`, trend column, podium chips
- Modify: `src/app/portal/leaderboard/page.tsx` — `BoardSkeleton` chase rows gain the trend-column placeholder

---

### Task 1: History engine (`history.ts`)

**Files:**
- Create: `src/lib/leaderboard/history.ts`
- Test: `src/lib/leaderboard/history.test.ts`

**Interfaces:**
- Consumes: nothing (pure module).
- Produces (used verbatim by Task 3):
  - `LEADERBOARD_TZ: string`
  - `interface SaleRecord { salesRepId: string; saleDate: Date; totalPoints: number }`
  - `interface HistoryEnrichment { movement: number | null; spark: (number | null)[]; streakDays: number }`
  - `type HistoryMetric = 'totalPoints' | 'totalSales'`
  - `dayKey(date: Date, tz?: string): string` — `YYYY-MM-DD` in `LEADERBOARD_TZ`
  - `computeHistory(opts: { periodSales: SaleRecord[]; allSales: SaleRecord[]; currentRanks: Map<string, number>; periodStartKey: string; metric: HistoryMetric; now: Date }): Map<string, HistoryEnrichment>`
  - Also exported for tests: `addDaysToKey(key: string, days: number): string`, `isWeekendKey(key: string): boolean`, `computeStreak(saleDayKeys: Set<string>, todayKey: string): number`

- [ ] **Step 1: Write the failing tests**

Create `src/lib/leaderboard/history.test.ts`. Date facts used below: 2026-07-10 is a **Friday**; 07-11 Sat, 07-12 Sun, 07-13 Mon. July ET is UTC-4, so `T16:00:00Z` = noon ET same calendar day and `T02:00:00Z` = 10pm ET the **previous** day.

```ts
import { describe, expect, it } from 'vitest';
import {
  addDaysToKey,
  computeHistory,
  computeStreak,
  dayKey,
  isWeekendKey,
  type SaleRecord,
} from './history';

const sale = (salesRepId: string, iso: string, totalPoints = 10): SaleRecord => ({
  salesRepId,
  saleDate: new Date(iso),
  totalPoints,
});

describe('dayKey', () => {
  it('buckets by America/New_York, not UTC', () => {
    // 02:00 UTC on the 10th is 10pm ET on the 9th.
    expect(dayKey(new Date('2026-07-10T02:00:00Z'))).toBe('2026-07-09');
    expect(dayKey(new Date('2026-07-10T16:00:00Z'))).toBe('2026-07-10');
  });
});

describe('addDaysToKey / isWeekendKey', () => {
  it('walks calendar days', () => {
    expect(addDaysToKey('2026-07-13', -1)).toBe('2026-07-12');
    expect(addDaysToKey('2026-07-01', -1)).toBe('2026-06-30');
  });
  it('flags Sat/Sun', () => {
    expect(isWeekendKey('2026-07-11')).toBe(true); // Sat
    expect(isWeekendKey('2026-07-12')).toBe(true); // Sun
    expect(isWeekendKey('2026-07-13')).toBe(false); // Mon
  });
});

describe('computeStreak', () => {
  it('counts consecutive selling days', () => {
    expect(computeStreak(new Set(['2026-07-08', '2026-07-09', '2026-07-10']), '2026-07-10')).toBe(3);
  });
  it('weekend without a sale does not break the streak (Fri -> Mon)', () => {
    expect(computeStreak(new Set(['2026-07-10', '2026-07-13']), '2026-07-13')).toBe(2);
  });
  it('a weekend sale still counts toward the streak', () => {
    expect(computeStreak(new Set(['2026-07-10', '2026-07-11', '2026-07-13']), '2026-07-13')).toBe(3);
  });
  it('today without a sale is grace, not a break', () => {
    expect(computeStreak(new Set(['2026-07-08', '2026-07-09']), '2026-07-10')).toBe(2);
  });
  it('a saleless weekday breaks the streak', () => {
    // Sold Thu 07-09 only; today Mon 07-13: grace Mon, skip Sun/Sat, Fri had no sale -> 0.
    expect(computeStreak(new Set(['2026-07-09']), '2026-07-13')).toBe(0);
  });
  it('no sales -> 0', () => {
    expect(computeStreak(new Set(), '2026-07-10')).toBe(0);
  });
});

describe('computeHistory', () => {
  const now = new Date('2026-07-10T16:00:00Z'); // Fri noon ET

  it('movement = yesterdayRank - currentRank; null for reps unranked yesterday', () => {
    const periodSales = [
      sale('A', '2026-07-08T16:00:00Z', 20),
      sale('B', '2026-07-08T16:00:00Z', 10),
      sale('B', '2026-07-10T16:00:00Z', 30), // B overtakes A today
      sale('C', '2026-07-10T16:00:00Z', 5),  // C is new today
    ];
    const result = computeHistory({
      periodSales,
      allSales: periodSales,
      currentRanks: new Map([['B', 1], ['A', 2], ['C', 3]]),
      periodStartKey: '2026-07-01',
      metric: 'totalPoints',
      now,
    });
    expect(result.get('B')!.movement).toBe(1);  // was #2, now #1
    expect(result.get('A')!.movement).toBe(-1); // was #1, now #2
    expect(result.get('C')!.movement).toBeNull(); // unranked yesterday
  });

  it('spark has 7 entries oldest->newest with nulls before period start and before first sale', () => {
    const periodSales = [sale('A', '2026-07-08T16:00:00Z', 20)];
    const result = computeHistory({
      periodSales,
      allSales: periodSales,
      currentRanks: new Map([['A', 1]]),
      periodStartKey: '2026-07-06',
      metric: 'totalPoints',
      now,
    });
    // Days 07-04..07-10: 04,05 predate period start -> null; 06,07 unranked -> null; 08,09,10 -> rank 1.
    expect(result.get('A')!.spark).toEqual([null, null, null, null, 1, 1, 1]);
  });

  it('first day of a period yields movement null for everyone', () => {
    const periodSales = [sale('A', '2026-07-10T16:00:00Z', 20)];
    const result = computeHistory({
      periodSales,
      allSales: periodSales,
      currentRanks: new Map([['A', 1]]),
      periodStartKey: '2026-07-10',
      metric: 'totalPoints',
      now,
    });
    expect(result.get('A')!.movement).toBeNull();
  });

  it('streak uses allSales even when outside the period', () => {
    const periodSales = [sale('A', '2026-07-10T16:00:00Z', 20)];
    const allSales = [...periodSales, sale('A', '2026-07-09T16:00:00Z', 5)];
    const result = computeHistory({
      periodSales,
      allSales,
      currentRanks: new Map([['A', 1]]),
      periodStartKey: '2026-07-10',
      metric: 'totalPoints',
      now,
    });
    expect(result.get('A')!.streakDays).toBe(2);
  });

  it('ranks by totalSales when that metric is selected', () => {
    const periodSales = [
      sale('A', '2026-07-08T16:00:00Z', 100), // 1 sale, 100 pts
      sale('B', '2026-07-08T16:00:00Z', 1),   // 2 sales, 2 pts
      sale('B', '2026-07-09T16:00:00Z', 1),
    ];
    const result = computeHistory({
      periodSales,
      allSales: periodSales,
      currentRanks: new Map([['B', 1], ['A', 2]]),
      periodStartKey: '2026-07-01',
      metric: 'totalSales',
      now,
    });
    // Yesterday (07-09) by sales count: B(2) #1, A(1) #2 -> no movement.
    expect(result.get('B')!.movement).toBe(0);
    expect(result.get('A')!.movement).toBe(0);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/leaderboard/history.test.ts`
Expected: FAIL — cannot resolve `./history`.

- [ ] **Step 3: Implement `src/lib/leaderboard/history.ts`**

```ts
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/leaderboard/history.test.ts`
Expected: PASS (14 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/leaderboard/history.ts src/lib/leaderboard/history.test.ts
git commit -m "feat(leaderboard): rank-history engine (movement, sparkline data, streaks)"
```

---

### Task 2: Sparkline geometry (`sparkline.ts`)

**Files:**
- Create: `src/lib/leaderboard/sparkline.ts`
- Test: `src/lib/leaderboard/sparkline.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces (used verbatim by Task 4):
  - `interface SparklineGeometry { polylines: string[]; dots: { x: number; y: number }[] }`
  - `sparklineGeometry(spark: (number | null)[], width?: number, height?: number, pad?: number): SparklineGeometry` — defaults `width=64, height=20, pad=3`. Y is inverted for RANKS: rank 1 (best) maps to the TOP (smallest y). Nulls split the line into separate polylines; isolated single points become dots.

- [ ] **Step 1: Write the failing tests**

Create `src/lib/leaderboard/sparkline.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { sparklineGeometry } from './sparkline';

const pointsOf = (polyline: string) =>
  polyline.split(' ').map((pair) => pair.split(',').map(Number) as [number, number]);

describe('sparklineGeometry', () => {
  it('returns empty geometry for all-null or empty input', () => {
    expect(sparklineGeometry([])).toEqual({ polylines: [], dots: [] });
    expect(sparklineGeometry([null, null, null])).toEqual({ polylines: [], dots: [] });
  });

  it('better rank (1) sits ABOVE worse rank (5): smaller y', () => {
    const { polylines } = sparklineGeometry([5, 1]);
    const [[, yWorse], [, yBest]] = pointsOf(polylines[0]);
    expect(yBest).toBeLessThan(yWorse);
  });

  it('a constant rank draws a flat mid-height line', () => {
    const { polylines } = sparklineGeometry([2, 2, 2]);
    const ys = pointsOf(polylines[0]).map(([, y]) => y);
    expect(new Set(ys).size).toBe(1);
    expect(ys[0]).toBe(10); // height 20 / 2
  });

  it('nulls split the line and isolated points become dots', () => {
    const { polylines, dots } = sparklineGeometry([1, 2, null, 3, null, 4, 4]);
    expect(polylines).toHaveLength(2); // [1,2] and [4,4]
    expect(dots).toHaveLength(1); // the isolated 3
  });

  it('x spans pad..width-pad across the 7 slots', () => {
    const { polylines } = sparklineGeometry([1, 1, 1, 1, 1, 1, 2], 64, 20, 3);
    const pts = pointsOf(polylines[0]);
    expect(pts[0][0]).toBe(3);
    expect(pts[6][0]).toBe(61);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/leaderboard/sparkline.test.ts`
Expected: FAIL — cannot resolve `./sparkline`.

- [ ] **Step 3: Implement `src/lib/leaderboard/sparkline.ts`**

```ts
// Maps a 7-slot rank series (nulls = unranked) onto SVG polyline/dot
// geometry. Rank 1 is BEST, so y is inverted: smaller rank -> smaller y.

export interface SparklineGeometry {
  polylines: string[];
  dots: { x: number; y: number }[];
}

export function sparklineGeometry(
  spark: (number | null)[],
  width = 64,
  height = 20,
  pad = 3,
): SparklineGeometry {
  const values = spark.filter((v): v is number => v !== null);
  if (values.length === 0 || spark.length < 2) return { polylines: [], dots: [] };

  const min = Math.min(...values);
  const max = Math.max(...values);
  const x = (i: number) => pad + (i * (width - pad * 2)) / (spark.length - 1);
  const y = (rank: number) =>
    max === min ? height / 2 : pad + ((rank - min) * (height - pad * 2)) / (max - min);

  const polylines: string[] = [];
  const dots: { x: number; y: number }[] = [];
  let run: { x: number; y: number }[] = [];

  const flush = () => {
    if (run.length >= 2) {
      polylines.push(run.map((p) => `${p.x},${p.y}`).join(' '));
    } else if (run.length === 1) {
      dots.push(run[0]);
    }
    run = [];
  };

  spark.forEach((v, i) => {
    if (v === null) flush();
    else run.push({ x: x(i), y: y(v) });
  });
  flush();

  return { polylines, dots };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/leaderboard/sparkline.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/leaderboard/sparkline.ts src/lib/leaderboard/sparkline.test.ts
git commit -m "feat(leaderboard): sparkline SVG geometry helper"
```

---

### Task 3: API enrichment + client types

**Files:**
- Modify: `src/app/api/portal/leaderboard/route.ts`
- Modify: `src/hooks/useLeaderboard.ts:6-12` (the `LeaderboardEntry` interface)

**Interfaces:**
- Consumes (from Task 1): `computeHistory`, `dayKey`, `SaleRecord`, `HistoryEnrichment`, `HistoryMetric` from `@/lib/leaderboard/history`.
- Produces: every entry in the API's `leaderboard` array and `currentUser` gains `movement: number | null`, `spark: (number | null)[]`, `streakDays: number`. Task 4 relies on these exact names.

- [ ] **Step 1: Extend the route's sales loop to collect records**

In `src/app/api/portal/leaderboard/route.ts`, add the import at the top:

```ts
import {
  computeHistory,
  dayKey,
  type HistoryEnrichment,
  type SaleRecord,
} from '@/lib/leaderboard/history';
```

Replace the body of the `salesSnapshot.forEach((doc) => { ... })` loop (currently lines 66-88) so it also collects `SaleRecord`s for history. The early `return` for out-of-period sales must move BELOW the `allSales.push` — streaks need every approved sale:

```ts
    const allSales: SaleRecord[] = [];
    const periodSales: SaleRecord[] = [];

    salesSnapshot.forEach((doc) => {
      const sale = doc.data();

      const saleDate = sale.saleDate?.toDate ? sale.saleDate.toDate() : new Date(sale.saleDate);
      const record: SaleRecord = {
        salesRepId: sale.salesRepId,
        saleDate,
        totalPoints: sale.totalPoints || 0,
      };
      allSales.push(record);

      // Filter by date in code (avoids needing composite index)
      if (saleDate.getTime() < startTimestamp) {
        return; // Skip sales before the period
      }
      periodSales.push(record);

      const repId = sale.salesRepId;

      if (!salesByRep[repId]) {
        salesByRep[repId] = {
          salesRepId: repId,
          salesRepName: sale.salesRepName || 'Unknown',
          totalSales: 0,
          totalPoints: 0,
        };
      }

      salesByRep[repId].totalSales += 1;
      salesByRep[repId].totalPoints += sale.totalPoints || 0;
    });
```

(The `const allSales/periodSales` declarations go right before the loop; everything else in the loop stays byte-identical.)

- [ ] **Step 2: Enrich the ranked entries (fail-soft)**

After the existing `const fullyRanked = ...` line (line 105) and before the response, insert:

```ts
    // Phase 2: rank history (movement vs yesterday, 7-day spark, streaks).
    // Fail-soft — a history bug must never take down the leaderboard.
    let history: Map<string, HistoryEnrichment> | null = null;
    try {
      history = computeHistory({
        periodSales,
        allSales,
        currentRanks: new Map(fullyRanked.map((e) => [e.salesRepId, e.rank])),
        periodStartKey: dayKey(startDate),
        metric: metric === 'totalSales' ? 'totalSales' : 'totalPoints',
        now: new Date(),
      });
    } catch (historyError) {
      console.error('Leaderboard history enrichment failed:', historyError);
    }

    const withHistory = <T extends { salesRepId: string }>(entry: T) => {
      const h = history?.get(entry.salesRepId);
      return {
        ...entry,
        movement: h?.movement ?? null,
        spark: h?.spark ?? [],
        streakDays: h?.streakDays ?? 0,
      };
    };
```

Then change the two response fields (lines 106-117):
- `const rankedLeaderboard = fullyRanked.slice(0, limit).map(withHistory);`
- `const rawCurrentUser = fullyRanked.find((e) => e.salesRepId === gate.uid) ?? null;` and `currentUser: rawCurrentUser ? withHistory(rawCurrentUser) : null,` in the JSON.

- [ ] **Step 3: Extend the client entry type**

In `src/hooks/useLeaderboard.ts`, extend the interface (lines 6-12) — optional so stale caches/other callers stay valid:

```ts
interface LeaderboardEntry {
  rank: number;
  salesRepId: string;
  salesRepName: string;
  totalSales: number;
  totalPoints: number;
  movement?: number | null;
  spark?: (number | null)[];
  streakDays?: number;
}
```

- [ ] **Step 4: Gates**

Run: `npx tsc --noEmit` — expected: clean.
Run: `npx vitest run` — expected: all tests pass (route has no test file; the engine is covered by Task 1).
Run: `npx eslint src/app/api/portal/leaderboard/route.ts src/hooks/useLeaderboard.ts src/lib/leaderboard/history.ts` — expected: clean.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/portal/leaderboard/route.ts src/hooks/useLeaderboard.ts
git commit -m "feat(leaderboard): serve movement/spark/streak history from the API"
```

---

### Task 4: UI — arrows, sparklines, streak chips

**Files:**
- Create: `src/components/leaderboard/Sparkline.tsx`
- Modify: `src/components/leaderboard/LeaderboardTable.tsx`
- Modify: `src/app/portal/leaderboard/page.tsx` (BoardSkeleton chase rows, lines ~159-166)

**Interfaces:**
- Consumes (Task 2): `sparklineGeometry` from `@/lib/leaderboard/sparkline`. (Task 3): optional `movement`/`spark`/`streakDays` on entries.
- Produces: final UI. No downstream consumers.

- [ ] **Step 1: Create `src/components/leaderboard/Sparkline.tsx`**

```tsx
import { sparklineGeometry } from '@/lib/leaderboard/sparkline';

// 7-day rank trend. Line going up = climbing (rank axis is inverted in the
// geometry helper). Nulls (unranked days) break the line into segments.
export function Sparkline({ spark, mine }: { spark: (number | null)[]; mine?: boolean }) {
  const { polylines, dots } = sparklineGeometry(spark);
  if (polylines.length === 0 && dots.length === 0) {
    return <span className="text-[10px] font-semibold text-slate-300 dark:text-muted-foreground">--</span>;
  }
  return (
    <svg
      width={64}
      height={20}
      viewBox="0 0 64 20"
      aria-hidden="true"
      className={mine ? 'text-[#5f8f20] dark:text-[#8dc63f]' : 'text-slate-400 dark:text-slate-500'}
    >
      {polylines.map((points, index) => (
        <polyline
          key={index}
          points={points}
          fill="none"
          stroke="currentColor"
          strokeWidth={1.5}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ))}
      {dots.map((dot, index) => (
        <circle key={index} cx={dot.x} cy={dot.y} r={1.5} fill="currentColor" />
      ))}
    </svg>
  );
}
```

- [ ] **Step 2: Add `MovementIndicator` and `StreakChip` to `LeaderboardTable.tsx`**

Extend the lucide import (line 4) with `ArrowDown, ArrowUp, Flame`, add `import { Sparkline } from '@/components/leaderboard/Sparkline';`, and extend the exported `LeaderboardEntry` interface (lines 8-14) with the same three optional fields as the hook (`movement?: number | null; spark?: (number | null)[]; streakDays?: number;`).

Add these two components near `CountUpValue`:

```tsx
// Movement since end of yesterday. noHistory = first day of a period (every
// movement is null) — render a neutral dash instead of a wall of "New".
function MovementIndicator({ movement, noHistory }: { movement: number | null | undefined; noHistory: boolean }) {
  if (noHistory || movement === 0) {
    return <span className="text-xs font-bold text-slate-300 dark:text-muted-foreground" aria-hidden="true">-</span>;
  }
  if (movement === null || movement === undefined) {
    return (
      <span className="rounded-full border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-slate-400 dark:border-border dark:bg-muted/50 dark:text-muted-foreground">
        New
      </span>
    );
  }
  const up = movement > 0;
  return (
    <span className={`inline-flex items-center gap-0.5 text-xs font-bold ${up ? 'text-[#5f8f20] dark:text-[#8dc63f]' : 'text-amber-600 dark:text-amber-400'}`}>
      {up ? <ArrowUp className="size-3" aria-hidden="true" /> : <ArrowDown className="size-3" aria-hidden="true" />}
      {Math.abs(movement)}
      <span className="sr-only">{up ? 'up' : 'down'} {Math.abs(movement)} since yesterday</span>
    </span>
  );
}

// Consecutive selling days; hidden below 2 so rows aren't noisy.
function StreakChip({ streakDays }: { streakDays: number | undefined }) {
  if (!streakDays || streakDays < 2) return null;
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300">
      <Flame className="size-3" aria-hidden="true" />
      {streakDays}-day streak
    </span>
  );
}
```

- [ ] **Step 3: Wire them into the table sections**

In `LeaderboardTable` (line 306-318): compute `const noHistory = ordered.every((entry) => (entry.movement ?? null) === null);` and pass `noHistory` down to `Podium` and `ChaseTable` as a new prop.

**Podium** (accepts `noHistory: boolean`): inside the medal-chip row (line 227-230, the `div` with `mt-3 flex items-center justify-center gap-1.5`), append `<MovementIndicator movement={entry.movement} noHistory={noHistory} />` after the "You" badge. Directly below that row add a centered streak row that renders only when the chip exists:

```tsx
<div className="mt-1.5 flex justify-center empty:hidden">
  <StreakChip streakDays={entry.streakDays} />
</div>
```

**ChaseTable** (accepts `noHistory: boolean`):
- Header grid (line 264): change `sm:grid` columns to `grid-cols-[76px_minmax(0,1fr)_64px_110px_120px]` and the header cells to `<span>Rank</span><span>Rep</span><span className="text-center">Trend</span><span className="text-right">…</span><span className="text-right">Gap to next</span>`.
- Row grid (line 281): change the `sm:` columns to `sm:grid-cols-[76px_minmax(0,1fr)_64px_110px_120px]`. Mobile columns (`grid-cols-[36px_minmax(0,1fr)_auto]`) stay unchanged.
- Rank cell (line 282): wrap the existing rank box plus the indicator: 

```tsx
<span className="flex items-center gap-1.5">
  <span className="portal-num grid size-8 shrink-0 place-items-center rounded-md bg-slate-100 text-sm font-bold text-slate-500 dark:bg-muted dark:text-muted-foreground sm:size-9">{entry.rank}</span>
  <span className="hidden sm:inline-flex"><MovementIndicator movement={entry.movement} noHistory={noHistory} /></span>
</span>
```

- Name block (lines 285-291): after the name `<p>`, add a chips row so streak + the existing mobile gap chip + a mobile movement indicator flow together:

```tsx
<span className="mt-1 flex flex-wrap items-center gap-1.5">
  {mine && <Badge className="bg-[#8dc63f] text-[#0A1F44] hover:bg-[#7ab82e]">You</Badge>}
  <span className="inline-flex sm:hidden"><MovementIndicator movement={entry.movement} noHistory={noHistory} /></span>
  <StreakChip streakDays={entry.streakDays} />
  {/* existing mobile-only gap chip moves in here unchanged (keep its sm:hidden class) */}
</span>
```

(Delete the old standalone `{mine && <Badge …>}` line and the old `mt-1 inline-flex … sm:hidden` gap-chip wrapper — the chip itself moves into this row unchanged.)

- Trend cell: between the name block and the points `<p>`, add `<span className="hidden justify-center sm:flex"><Sparkline spark={entry.spark ?? []} mine={mine} /></span>`.

- [ ] **Step 4: Update `BoardSkeleton` in `page.tsx`**

In the chase-row skeleton (lines ~160-166), mirror the new geometry: after `<Skeleton className="h-4 flex-1" />` add `<Skeleton className="hidden h-4 w-16 sm:block" />` for the trend column (the row then reads: rank box, avatar, name bar, trend bar, points bar, gap bar).

- [ ] **Step 5: Gates**

Run: `npx tsc --noEmit` — clean.
Run: `npx eslint src/components/leaderboard/LeaderboardTable.tsx src/components/leaderboard/Sparkline.tsx src/app/portal/leaderboard/page.tsx` — clean.
Run: `npx vitest run` — all pass.

- [ ] **Step 6: Commit**

```bash
git add src/components/leaderboard/Sparkline.tsx src/components/leaderboard/LeaderboardTable.tsx src/app/portal/leaderboard/page.tsx
git commit -m "feat(leaderboard): movement arrows, 7-day sparklines, streak chips"
```

---

### Task 5: Full verification

**Files:** none created; read-only + screenshots.

- [ ] **Step 1: Full gates**

Run: `npx tsc --noEmit`, `npx vitest run`, `npm run build` — all clean. (Full `npm run lint` has known pre-existing debt; only touched files must be clean.)

- [ ] **Step 2: Visual verification (project `verify` skill)**

Use the project's `verify` skill to run the app and screenshot `/portal/leaderboard` signed in: light + dark, desktop + 390px mobile. Confirm: arrows render (or all-dash on a first-of-period board), sparklines hidden on mobile, streak chips only at 2+, podium unbroken at 390px (1-2-3 order stacked), skeleton matches final geometry. NOTE: QA-bot credentials are blocked — the user may need to log into the Playwright browser manually.

- [ ] **Step 3: Self-critique against the redesign quality bar, fix, re-shoot**

- [ ] **Step 4: Final commit for any fixes**

```bash
git add -A && git commit -m "fix(leaderboard): visual QA fixes for phase 2 history features"
```
