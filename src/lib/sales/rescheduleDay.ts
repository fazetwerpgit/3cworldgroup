import { dateToSaleDateInput, installDayKey } from './saleDate';

/**
 * The day a missed install broke, as YYYY-MM-DD: the carrier's missed day
 * (the breakage row's est install day, in whatever shape it was stored), else
 * the sale's own install date. '' when neither can be read.
 */
export function missedInstallDay(missedDay: unknown, installDate: unknown): string {
  return installDayKey(missedDay) ?? installDayKey(installDate) ?? '';
}

/** The day after a YYYY-MM-DD. */
export function nextDay(day: string): string {
  const [year, month, date] = day.split('-').map(Number);
  return dateToSaleDateInput(new Date(year, month - 1, date + 1, 12));
}

/**
 * The first day a reschedule may land on: after the day that broke, and never
 * before the sale. The sale day alone when nothing broke.
 */
export function firstRescheduleDay(brokeDay: string, soldDay: string): string {
  return brokeDay && nextDay(brokeDay) > soldDay ? nextDay(brokeDay) : soldDay;
}

/** Why a picked reschedule day can't stand, or null when it can. */
export function rescheduleDayError(day: string, brokeDay: string): string | null {
  if (!day) return 'Pick the install day.';
  if (brokeDay && day <= brokeDay) return 'Pick a day after the missed one.';
  return null;
}
