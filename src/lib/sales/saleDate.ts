// Date parsing shared by sale-related date inputs (sale date, install date) on
// the sale form (client) and the sales API (server). Forms send a plain
// YYYY-MM-DD string; the server converts it to a Date (Firestore timestamp)
// at local noon so a day never shifts across timezones.

const DATE_INPUT_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Today's date as a YYYY-MM-DD string in the local timezone. */
export function todaySaleDateInput(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/** Formats a Date as a YYYY-MM-DD string for a date input's value, in local time. */
export function dateToSaleDateInput(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export type ParsedDateInput =
  | { ok: true; date: Date }
  | { ok: false; error: string };

/** @deprecated use ParsedDateInput */
export type ParsedSaleDate = ParsedDateInput;

interface ParseDateInputOptions {
  /** Error for unparseable/non-existent calendar dates (e.g. 2026-02-31). */
  invalidError: string;
  /** Allow dates after today. Default false (sale date behavior). */
  allowFuture?: boolean;
  /** When allowFuture, reject dates more than this many days ahead. */
  maxFutureDays?: number;
  /** Error for a future date rejected by allowFuture=false or maxFutureDays. */
  futureError: string;
  /** allowFuture=false: the latest YYYY-MM-DD accepted. Default: today in Chicago. */
  latestDay?: string;
}

/**
 * Parses a YYYY-MM-DD date input into a Date at local noon, applying the
 * given future-date policy.
 */
function parseDateInput(input: unknown, options: ParseDateInputOptions): ParsedDateInput {
  if (typeof input !== 'string' || !DATE_INPUT_RE.test(input)) {
    return { ok: false, error: options.invalidError };
  }

  const [, yearStr, monthStr, dayStr] = DATE_INPUT_RE.exec(input)!;
  const year = Number(yearStr);
  const month = Number(monthStr);
  const day = Number(dayStr);
  const date = new Date(year, month - 1, day, 12, 0, 0);

  // Guard against values like 2026-02-31 that Date() silently rolls over.
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return { ok: false, error: options.invalidError };
  }

  if (!options.allowFuture) {
    // Compare calendar days, never instants: the server runs on UTC, so "today"
    // there turns over at 7 pm Central. The latest day allowed is the company's
    // (Chicago) today, or the caller's own local day when that is one ahead.
    if (input > (options.latestDay ?? chicagoTodayKey())) {
      return { ok: false, error: options.futureError };
    }
    return { ok: true, date };
  }

  const today = new Date();
  today.setHours(12, 0, 0, 0);

  if (options.maxFutureDays !== undefined) {
    const maxDate = new Date(today);
    maxDate.setDate(maxDate.getDate() + options.maxFutureDays);
    if (date.getTime() > maxDate.getTime()) {
      return { ok: false, error: options.futureError };
    }
  }

  return { ok: true, date };
}

/** Adds whole days to a YYYY-MM-DD key (calendar arithmetic at UTC noon, DST-proof). */
function addDaysToDayKey(key: string, days: number): string {
  const date = new Date(`${key}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/** Today as YYYY-MM-DD on the company clock (America/Chicago), wherever this runs. */
export function chicagoTodayKey(now: Date = new Date()): string {
  return installDayKey(now) ?? dateToSaleDateInput(now);
}

/**
 * The latest sale date accepted: today in Chicago, or the rep's own local day
 * (`clientToday`, YYYY-MM-DD from todaySaleDateInput on their phone) when it
 * is exactly one day ahead, an Eastern rep after midnight ET. Anything else
 * the client claims is ignored, so a wrong phone clock cannot open the door.
 */
export function latestSaleDayKey(clientToday?: unknown, now: Date = new Date()): string {
  const chicago = chicagoTodayKey(now);
  if (typeof clientToday === 'string' && DATE_INPUT_RE.test(clientToday) && clientToday === addDaysToDayKey(chicago, 1)) {
    return clientToday;
  }
  return chicago;
}

/** A YYYY-MM-DD day at local noon, the way every sale date is stored. */
export function dayKeyAtNoon(key: string): Date {
  const [year, month, day] = key.split('-').map(Number);
  return new Date(year, month - 1, day, 12, 0, 0);
}

/**
 * Parses a YYYY-MM-DD sale date input into a Date at local noon.
 * Rejects unparseable values and dates after today (latestSaleDayKey: the
 * Chicago day, or the rep's local day when it is one day ahead).
 */
export function parseSaleDateInput(input: unknown, options: { clientToday?: unknown } = {}): ParsedDateInput {
  return parseDateInput(input, {
    invalidError: 'Invalid sale date',
    futureError: 'Sale date cannot be in the future',
    latestDay: latestSaleDayKey(options.clientToday),
  });
}

/**
 * Parses a YYYY-MM-DD install date input into a Date at local noon. Unlike
 * sale date, future dates are allowed (installs are scheduled ahead), capped
 * at one year out.
 */
export function parseInstallDateInput(input: unknown): ParsedDateInput {
  return parseDateInput(input, {
    invalidError: 'Invalid install date',
    allowFuture: true,
    maxFutureDays: 365,
    futureError: 'Install date too far in the future',
  });
}

/**
 * The timezone the business (and the carrier's report) means by "a day". Install
 * dates are stored at LOCAL noon, so a bare getTime() comparison between a
 * report day and a stored date answers the wrong question near midnight; every
 * "is this the same day" check goes through installDayKey below instead.
 */
export const INSTALL_DATE_TIME_ZONE = 'America/Chicago';

const DAY_KEY_FORMATTER = new Intl.DateTimeFormat('en-US', {
  timeZone: INSTALL_DATE_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/** Accepts a Date, a Firestore Timestamp, or an ISO/`YYYY-MM-DD` string. */
function asDate(value: unknown): Date | null {
  if (value instanceof Date) return value;
  if (typeof value === 'string') {
    if (DATE_INPUT_RE.test(value)) {
      const parsed = parseDateInput(value, {
        invalidError: 'invalid',
        allowFuture: true,
        futureError: 'future',
      });
      return parsed.ok ? parsed.date : null;
    }
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  const maybe = value as { toDate?: () => Date } | null | undefined;
  if (maybe && typeof maybe.toDate === 'function') {
    const parsed = maybe.toDate();
    return parsed instanceof Date && !Number.isNaN(parsed.getTime()) ? parsed : null;
  }
  return null;
}

/**
 * The calendar day an install date falls on, as `YYYY-MM-DD` in
 * INSTALL_DATE_TIME_ZONE. null when there is no usable date. Two values with
 * the same key are the same install day however they were stored.
 */
export function installDayKey(value: unknown): string | null {
  const date = asDate(value);
  if (!date || Number.isNaN(date.getTime())) return null;
  const parts = DAY_KEY_FORMATTER.formatToParts(date);
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? '';
  const year = get('year');
  const month = get('month');
  const day = get('day');
  if (!year || !month || !day) return null;
  return `${year}-${month}-${day}`;
}

/** MM/DD/YYYY in INSTALL_DATE_TIME_ZONE, for anything a rep reads. */
export function formatInstallDay(value: unknown): string | null {
  const key = installDayKey(value);
  if (!key) return null;
  const [year, month, day] = key.split('-');
  return `${month}/${day}/${year}`;
}

const SHORT_DAY = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });

/** "Oct 9" for the install day in INSTALL_DATE_TIME_ZONE, or null with no usable date. */
export function formatInstallDayShort(value: unknown): string | null {
  const key = installDayKey(value);
  if (!key) return null;
  const [year, month, day] = key.split('-').map(Number);
  return SHORT_DAY.format(new Date(Date.UTC(year, month - 1, day, 12)));
}
