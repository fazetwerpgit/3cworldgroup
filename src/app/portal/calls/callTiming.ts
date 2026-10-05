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
