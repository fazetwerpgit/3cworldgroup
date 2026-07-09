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

  const today = new Date();
  today.setHours(12, 0, 0, 0);

  if (!options.allowFuture) {
    if (date.getTime() > today.getTime()) {
      return { ok: false, error: options.futureError };
    }
    return { ok: true, date };
  }

  if (options.maxFutureDays !== undefined) {
    const maxDate = new Date(today);
    maxDate.setDate(maxDate.getDate() + options.maxFutureDays);
    if (date.getTime() > maxDate.getTime()) {
      return { ok: false, error: options.futureError };
    }
  }

  return { ok: true, date };
}

/**
 * Parses a YYYY-MM-DD sale date input into a Date at local noon.
 * Rejects unparseable values and dates after today.
 */
export function parseSaleDateInput(input: unknown): ParsedDateInput {
  return parseDateInput(input, {
    invalidError: 'Invalid sale date',
    futureError: 'Sale date cannot be in the future',
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
