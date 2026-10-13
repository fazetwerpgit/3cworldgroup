import { chicagoMonthKey, compareMonths, type MonthKey } from '@/lib/sales/monthWindow';

const CHICAGO_TIME_ZONE = 'America/Chicago';
const DAY_MS = 86_400_000;

export type LeaderboardPeriod = 'week' | 'month' | 'year' | 'all';

interface DateParts {
  year: number;
  month: number;
  day: number;
}

function chicagoParts(date: Date) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: CHICAGO_TIME_ZONE,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  }).formatToParts(date);

  return Object.fromEntries(
    parts.filter((part) => part.type !== 'literal').map((part) => [part.type, Number(part.value)])
  ) as Record<string, number>;
}

function chicagoMidnight(parts: DateParts) {
  let result = new Date(Date.UTC(parts.year, parts.month - 1, parts.day));

  for (let pass = 0; pass < 2; pass += 1) {
    const shown = chicagoParts(result);
    const shownAsUtc = Date.UTC(shown.year, shown.month - 1, shown.day, shown.hour, shown.minute, shown.second);
    const wantedAsUtc = Date.UTC(parts.year, parts.month - 1, parts.day);
    result = new Date(result.getTime() + wantedAsUtc - shownAsUtc);
  }

  return result;
}

export function periodBounds(period: LeaderboardPeriod, now = new Date()) {
  if (period === 'all') return null;

  const local = chicagoParts(now);
  const localDate = new Date(Date.UTC(local.year, local.month - 1, local.day));
  let startDate: Date;
  let endDate: Date;

  if (period === 'week') {
    const daysSinceSunday = localDate.getUTCDay();
    startDate = new Date(localDate.getTime() - daysSinceSunday * DAY_MS);
    endDate = new Date(startDate.getTime() + 7 * DAY_MS);
  } else if (period === 'month') {
    startDate = new Date(Date.UTC(local.year, local.month - 1, 1));
    endDate = new Date(Date.UTC(local.year, local.month, 1));
  } else {
    startDate = new Date(Date.UTC(local.year, 0, 1));
    endDate = new Date(Date.UTC(local.year + 1, 0, 1));
  }

  const toParts = (date: Date): DateParts => ({
    year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, day: date.getUTCDate(),
  });

  return { start: chicagoMidnight(toParts(startDate)), end: chicagoMidnight(toParts(endDate)) };
}

/** Chicago midnight to the next Chicago midnight for a YYYY-MM-DD day (23 or 25 hours across DST). */
export function chicagoDayBounds(day: string): { start: Date; end: Date } {
  const [year, month, date] = day.split('-').map(Number);
  const next = new Date(Date.UTC(year, month - 1, date + 1));
  return {
    start: chicagoMidnight({ year, month, day: date }),
    end: chicagoMidnight({ year: next.getUTCFullYear(), month: next.getUTCMonth() + 1, day: next.getUTCDate() }),
  };
}

/**
 * One calendar month on the office clock: Chicago midnight on the 1st up to
 * (not including) Chicago midnight on the 1st of the next month. Sale dates
 * are stored at the server's local noon, so every day of the month sits well
 * inside it whichever side of a DST change it falls on.
 */
export function chicagoMonthBounds({ year, month }: MonthKey): { start: Date; end: Date } {
  const next = new Date(Date.UTC(year, month + 1, 1));
  return {
    start: chicagoMidnight({ year, month: month + 1, day: 1 }),
    end: chicagoMidnight({ year: next.getUTCFullYear(), month: next.getUTCMonth() + 1, day: 1 }),
  };
}

/** `YYYY-MM`, the leaderboard's `month` query value. */
export function formatMonthParam({ year, month }: MonthKey): string {
  return `${year}-${String(month + 1).padStart(2, '0')}`;
}

const MONTH_PARAM_RE = /^(\d{4})-(0[1-9]|1[0-2])$/;

/** A `YYYY-MM` value as a MonthKey, or null when it isn't one. No range check. */
export function monthKeyFromParam(value: string | null | undefined): MonthKey | null {
  const match = MONTH_PARAM_RE.exec(value ?? '');
  return match ? { year: Number(match[1]), month: Number(match[2]) - 1 } : null;
}

export type LeaderboardMonthResult =
  | { ok: true; month: MonthKey; current: boolean }
  | { ok: false; error: string };

/**
 * The leaderboard's `month` query value. Absent means this month (on the office
 * clock); a malformed value or a month that hasn't started yet is an error.
 */
export function parseLeaderboardMonth(value: string | null | undefined, now = new Date()): LeaderboardMonthResult {
  const current = chicagoMonthKey(now);
  if (value === null || value === undefined || value === '') return { ok: true, month: current, current: true };
  const month = monthKeyFromParam(value);
  if (!month) return { ok: false, error: 'month must be YYYY-MM' };
  const order = compareMonths(month, current);
  if (order > 0) return { ok: false, error: 'month cannot be in the future' };
  return { ok: true, month, current: order === 0 };
}
