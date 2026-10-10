// Is the carrier's daily report late? The T-Fiber report lands once a day,
// any time 6 AM–7 PM Central, covering the day before. A gap of more than 30
// hours since the last one landed means today's has not come in, so install
// dates and statuses on the rep's screens may be behind (owner, 2026-10-10:
// "let them know, but just subtly").

/** What reps receive from config/fiberReportStatus — nothing else. */
export interface CarrierReportStamp {
  /** When the last report landed (ISO string as the webhook stores it). */
  lastReportAt: string | null;
  /** The day that report covers, 'YYYY-MM-DD'. */
  lastReportAsOf?: string | null;
}

export const CARRIER_STALE_AFTER_MS = 30 * 60 * 60 * 1000;

/** ms since epoch, or null. Tolerates a Firestore Timestamp as serialized JSON. */
function toMillis(value: unknown): number | null {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value.getTime();
  if (typeof value === 'string' && value) {
    const ms = Date.parse(value);
    return Number.isNaN(ms) ? null : ms;
  }
  if (value && typeof value === 'object') {
    const record = value as { seconds?: unknown; _seconds?: unknown };
    const seconds = record.seconds ?? record._seconds;
    if (typeof seconds === 'number') return seconds * 1000;
  }
  return null;
}

/** Stale when no report has landed for more than 30 hours, or none is on record. */
export function isCarrierReportStale(lastReportAt: unknown, now: Date = new Date()): boolean {
  const landed = toMillis(lastReportAt);
  if (landed === null) return true;
  return now.getTime() - landed > CARRIER_STALE_AFTER_MS;
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/**
 * 'YYYY-MM-DD' → "Thu 10/8". It is a calendar day (Central), not an instant,
 * so it is read as-is with no time-zone shift. null when it isn't a date.
 */
export function formatReportAsOf(asOf: string | null | undefined): string | null {
  const match = typeof asOf === 'string' ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(asOf) : null;
  if (!match) return null;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return `${WEEKDAYS[date.getUTCDay()]} ${month}/${day}`;
}

/** The one quiet line reps see when the report is late; null when it isn't. */
export function carrierStaleLine(
  report: CarrierReportStamp | null | undefined,
  now: Date = new Date()
): string | null {
  // Not loaded yet (or failed — CarrierNotice says that): say nothing.
  if (!report) return null;
  if (!isCarrierReportStale(report.lastReportAt, now)) return null;
  const asOf = formatReportAsOf(report.lastReportAsOf);
  return asOf
    ? `Carrier update delayed · install info as of ${asOf}`
    : 'Carrier update delayed · install info may be behind';
}
