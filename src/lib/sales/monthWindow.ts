import type { Sale } from '@/types';
import { dateToSaleDateInput } from '@/lib/sales/saleDate';

// A month, as the Sales page tracks it. Both the admin board and a rep's own
// ledger are read one month at a time now: an unbounded list silently truncates
// at whatever cap it was given, and every figure on the page is monthly anyway.

export interface MonthKey {
  year: number;
  /** 0-indexed, matching Date. */
  month: number;
}

export function currentMonth(now: Date = new Date()): MonthKey {
  return { year: now.getFullYear(), month: now.getMonth() };
}

/**
 * Inclusive YYYY-MM-DD bounds for the API. Built at local NOON to match how
 * sale and install dates are stored, so the day a sale lands on can't flip
 * across a timezone.
 */
export function monthBounds({ year, month }: MonthKey) {
  const start = new Date(year, month, 1, 12, 0, 0);
  const end = new Date(year, month + 1, 0, 12, 0, 0);
  return { startDate: dateToSaleDateInput(start), endDate: dateToSaleDateInput(end) };
}

export function monthLabel({ year, month }: MonthKey) {
  return new Date(year, month, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

export function shiftMonth({ year, month }: MonthKey, by: number): MonthKey {
  const shifted = new Date(year, month + by, 1);
  return { year: shifted.getFullYear(), month: shifted.getMonth() };
}

export function isCurrentMonth(key: MonthKey, now: Date = new Date()): boolean {
  return key.year === now.getFullYear() && key.month === now.getMonth();
}

/** Negative when `a` is before `b`, 0 in the same month, positive after. */
export function compareMonths(a: MonthKey, b: MonthKey): number {
  return a.year * 12 + a.month - (b.year * 12 + b.month);
}

/**
 * The latest month the Sales page can move to. The ledger lists what was SOLD,
 * so it stops at this month. The pay list goes by install date, and scheduled
 * installs land next month, so it may look one month ahead (never further).
 */
export function latestPickableMonth(payView: boolean, now: Date = new Date()): MonthKey {
  const current = currentMonth(now);
  return payView ? shiftMonth(current, 1) : current;
}

/** `month`, pulled back to `max` when it is past it. */
export function clampMonth(month: MonthKey, max: MonthKey): MonthKey {
  return compareMonths(month, max) > 0 ? max : month;
}

/** True when `value` falls inside `key`. An absent or unparseable date is not in any month. */
export function isInMonth(value: Date | string | null | undefined, key: MonthKey): boolean {
  if (!value) return false;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return false;
  return date.getFullYear() === key.year && date.getMonth() === key.month;
}

/** The month's sales, by the day they were SOLD — what the ledger lists. */
export function salesSoldIn<T extends Pick<Sale, 'saleDate'>>(sales: T[], key: MonthKey): T[] {
  return sales.filter((sale) => isInMonth(sale.saleDate, key));
}

/**
 * The month's sales, by the day they were INSTALLED — what the pay list shows.
 * Pay is owed off the install, so a sale sold in August that installs in
 * September belongs to September's pay; filtering that list by sale date would
 * hide money the rep is actually owed.
 */
export function salesInstalledIn<T extends Pick<Sale, 'installDate'>>(sales: T[], key: MonthKey): T[] {
  return sales.filter((sale) => isInMonth(sale.installDate, key));
}

const CHICAGO_MONTH = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/Chicago',
  year: 'numeric',
  month: 'numeric',
});

/**
 * The calendar month `date` falls in, read in America/Chicago — the office's
 * clock — rather than whatever timezone the viewer's browser is set to. Sale and
 * install dates are stored at noon, so the day never slips across the line.
 */
export function chicagoMonthKey(date: Date): MonthKey {
  const parts = CHICAGO_MONTH.formatToParts(date);
  const get = (type: string) => Number(parts.find((part) => part.type === type)?.value);
  return { year: get('year'), month: get('month') - 1 };
}

/** isInMonth, with the month read in America/Chicago. */
export function isInChicagoMonth(value: Date | string | null | undefined, key: MonthKey): boolean {
  if (!value) return false;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return false;
  const month = chicagoMonthKey(date);
  return month.year === key.year && month.month === key.month;
}
