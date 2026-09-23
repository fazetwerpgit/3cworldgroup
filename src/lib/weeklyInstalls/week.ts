// Calendar weeks for the Monday "what got installed" email.
//
// Everything here works in DAY KEYS (`YYYY-MM-DD` in America/Chicago) rather
// than instants. Install dates are stored at local noon and carrier dates are
// bare days, so "which week is this install in" is a question about calendar
// days — asking it with millisecond bounds is how a DST Sunday drops an hour's
// worth of installs into the wrong week. Day-key arithmetic runs on UTC dates,
// which have no DST at all.
//
// Weeks run Sunday–Saturday, as the leaderboard's week does (leaderboard/periods).

import { INSTALL_DATE_TIME_ZONE, installDayKey } from '@/lib/sales/saleDate';

export type DayKey = string;

const DAY_KEY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function isDayKey(value: unknown): value is DayKey {
  if (typeof value !== 'string') return false;
  const match = DAY_KEY_RE.exec(value);
  if (!match) return false;
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  return date.toISOString().slice(0, 10) === value;
}

function keyToUtc(key: DayKey): Date {
  const [year, month, day] = key.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

function utcToKey(date: Date): DayKey {
  return date.toISOString().slice(0, 10);
}

export function addDays(key: DayKey, days: number): DayKey {
  const date = keyToUtc(key);
  date.setUTCDate(date.getUTCDate() + days);
  return utcToKey(date);
}

/** 0 = Sunday … 6 = Saturday. */
export function weekdayOf(key: DayKey): number {
  return keyToUtc(key).getUTCDay();
}

/** The Sunday that starts the week `key` is in. */
export function weekStartOf(key: DayKey): DayKey {
  return addDays(key, -weekdayOf(key));
}

/** The Chicago calendar day an instant falls on. */
export function chicagoDayKey(now: Date): DayKey {
  return installDayKey(now) as DayKey;
}

const HOUR_FORMAT = new Intl.DateTimeFormat('en-US', {
  timeZone: INSTALL_DATE_TIME_ZONE,
  hour: '2-digit',
  hourCycle: 'h23',
});

/** 0–23, the wall-clock hour in Chicago. */
export function chicagoHour(now: Date): number {
  return Number(HOUR_FORMAT.formatToParts(now).find((part) => part.type === 'hour')?.value ?? NaN);
}

/**
 * The Vercel cron fires at 13:00 AND 14:00 UTC every Monday, because 8 AM in
 * Chicago is 13:00 UTC in summer (CDT) and 14:00 UTC in winter (CST). Exactly
 * one of the two lands on 8 AM local; this is the gate that picks it.
 */
export function isSendHour(now: Date): boolean {
  return weekdayOf(chicagoDayKey(now)) === 1 && chicagoHour(now) === 8;
}

export interface DayRange {
  /** First day, inclusive. */
  from: DayKey;
  /** Last day, inclusive. */
  to: DayKey;
}

export interface ReportWeek {
  /** The Sunday–Saturday week the email reports on. Also the idempotency key. */
  last: DayRange;
  /** The Monday the email goes out. */
  sendDay: DayKey;
  /** "Coming up this week": the send Monday through Saturday. */
  upcoming: DayRange;
}

/** The report for the week starting on `weekStart` (a Sunday). */
export function reportWeekFromStart(weekStart: DayKey): ReportWeek {
  const start = weekStartOf(weekStart);
  const sendDay = addDays(start, 8);
  return {
    last: { from: start, to: addDays(start, 6) },
    sendDay,
    upcoming: { from: sendDay, to: addDays(start, 13) },
  };
}

/** The report due at `now`: last week, relative to the Chicago day `now` falls on. */
export function reportWeekFor(now: Date): ReportWeek {
  return reportWeekFromStart(addDays(weekStartOf(chicagoDayKey(now)), -7));
}

export function inRange(key: DayKey | null | undefined, range: DayRange): boolean {
  return !!key && key >= range.from && key <= range.to;
}

/**
 * A day key as a Date at LOCAL noon — the shape sale install dates are stored
 * in, and what payoutWindow's local-date arithmetic expects.
 */
export function dayKeyToLocalNoon(key: DayKey): Date {
  const [year, month, day] = key.split('-').map(Number);
  return new Date(year, month - 1, day, 12, 0, 0);
}

/**
 * An instant to stand in for "now" when a report is built for a chosen week
 * (the owner preview): 13:00 UTC on the send Monday, which is 8 AM Chicago in
 * summer and 7 AM in winter. Everything that matters here is a day key, so the
 * DST hour never changes a result.
 */
export function sendInstantFor(week: ReportWeek): Date {
  const [year, month, day] = week.sendDay.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day, 13, 0, 0));
}

const SHORT_MONTH = new Intl.DateTimeFormat('en-US', { month: 'short', timeZone: 'UTC' });
const WEEKDAY = new Intl.DateTimeFormat('en-US', { weekday: 'short', timeZone: 'UTC' });

/** "Sep 13–19", or "Aug 30–Sep 5" across a month end. */
export function formatRange(range: DayRange): string {
  const from = keyToUtc(range.from);
  const to = keyToUtc(range.to);
  const fromMonth = SHORT_MONTH.format(from);
  const toMonth = SHORT_MONTH.format(to);
  return fromMonth === toMonth
    ? `${fromMonth} ${from.getUTCDate()}–${to.getUTCDate()}`
    : `${fromMonth} ${from.getUTCDate()}–${toMonth} ${to.getUTCDate()}`;
}

/** "Tue, Sep 15". */
export function formatDay(key: DayKey): string {
  const date = keyToUtc(key);
  return `${WEEKDAY.format(date)}, ${SHORT_MONTH.format(date)} ${date.getUTCDate()}`;
}
