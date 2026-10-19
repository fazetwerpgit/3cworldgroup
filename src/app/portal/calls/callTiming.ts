import { CALL_DAY_ORDER, CallDay } from '@/types';

export interface CentralNow {
  day: CallDay;
  minutes: number;
}

// A call stays joinable this long after it starts, matching the dashboard's
// callsToday window (src/lib/dashboard/repSummary.ts).
export const LIVE_GRACE_MINUTES = 60;

const WEEK_MINUTES = CALL_DAY_ORDER.length * 1440;

export function timeToMinutes(time: string): number {
  const [hours, minutes] = time.split(':').map(Number);
  return hours * 60 + minutes;
}

/**
 * Minutes until the call's next occurrence. Negative (down to -LIVE_GRACE_MINUTES)
 * while it is live, so a call that just started stays "next" instead of jumping a week.
 */
export function getMinutesUntil(call: { day: CallDay; time: string }, now: CentralNow): number {
  const todayIndex = CALL_DAY_ORDER.indexOf(now.day);
  const callIndex = CALL_DAY_ORDER.indexOf(call.day);
  let minutes = ((callIndex - todayIndex + CALL_DAY_ORDER.length) % CALL_DAY_ORDER.length) * 1440;
  minutes += timeToMinutes(call.time) - now.minutes;
  if (minutes <= -LIVE_GRACE_MINUTES) minutes += WEEK_MINUTES;
  // Started late yesterday and still live past midnight.
  else if (minutes > WEEK_MINUTES - LIVE_GRACE_MINUTES) minutes -= WEEK_MINUTES;
  return minutes;
}

/** Today's call that ended its live window (started over LIVE_GRACE_MINUTES ago). */
export function isPastOccurrence(call: { day: CallDay; time: string }, now: CentralNow): boolean {
  return call.day === now.day && timeToMinutes(call.time) <= now.minutes - LIVE_GRACE_MINUTES;
}

const CENTRAL_DATE_FORMATTER = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/Chicago',
  year: 'numeric',
  month: 'numeric',
  day: 'numeric',
  weekday: 'long',
});

/**
 * The week strip runs from today through the next six days, so every tab is the
 * occurrence the countdown and Join button point at, never last week's.
 */
export function getWeekStripDays(today: CallDay): CallDay[] {
  const start = CALL_DAY_ORDER.indexOf(today);
  return CALL_DAY_ORDER.map((_, i) => CALL_DAY_ORDER[(start + i) % CALL_DAY_ORDER.length]);
}

/** Day of the month (Central) of the day's next occurrence; today counts as today. */
export function getNextOccurrenceDateNumber(day: CallDay, date: Date): string {
  const parts = Object.fromEntries(
    CENTRAL_DATE_FORMATTER.formatToParts(date).map(({ type, value }) => [type, value]),
  );
  const today = parts.weekday.toLowerCase() as CallDay;
  const centralDate = new Date(Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day)));
  const offset =
    (CALL_DAY_ORDER.indexOf(day) - CALL_DAY_ORDER.indexOf(today) + CALL_DAY_ORDER.length) %
    CALL_DAY_ORDER.length;
  centralDate.setUTCDate(centralDate.getUTCDate() + offset);
  return String(centralDate.getUTCDate());
}
