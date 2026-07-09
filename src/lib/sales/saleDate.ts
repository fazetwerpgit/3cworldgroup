// Sale date parsing shared by the sale form (client) and the sales API (server).
// The form sends a plain YYYY-MM-DD string; the server converts it to a Date
// (Firestore timestamp) at local noon so a day never shifts across timezones.

const SALE_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

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

export type ParsedSaleDate =
  | { ok: true; date: Date }
  | { ok: false; error: string };

/**
 * Parses a YYYY-MM-DD sale date input into a Date at local noon.
 * Rejects unparseable values and dates after today.
 */
export function parseSaleDateInput(input: unknown): ParsedSaleDate {
  if (typeof input !== 'string' || !SALE_DATE_RE.test(input)) {
    return { ok: false, error: 'Invalid sale date' };
  }

  const [, yearStr, monthStr, dayStr] = SALE_DATE_RE.exec(input)!;
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
    return { ok: false, error: 'Invalid sale date' };
  }

  const today = new Date();
  today.setHours(12, 0, 0, 0);
  if (date.getTime() > today.getTime()) {
    return { ok: false, error: 'Sale date cannot be in the future' };
  }

  return { ok: true, date };
}
