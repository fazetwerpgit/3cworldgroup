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
