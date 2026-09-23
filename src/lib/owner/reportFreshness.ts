// When the carrier report last landed, for the owner's money board. Every
// install behind the money figures comes from that report, so once it stops
// arriving the numbers are stale and the stamp says so.

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

/** The report lands each morning; past this it has missed at least one. */
export const REPORT_STALE_MS = 36 * HOUR_MS;

export interface ReportStamp {
  text: string;
  /** Older than REPORT_STALE_MS: shown in amber. */
  stale: boolean;
}

/**
 * "Carrier report 12m ago" / "3h ago" while fresh, "Carrier report 2 days old"
 * once stale. Null when no report has arrived (or the stamp is unreadable).
 */
export function carrierReportStamp(reportAt: string | null | undefined, nowMs: number): ReportStamp | null {
  const atMs = reportAt ? Date.parse(reportAt) : NaN;
  if (!Number.isFinite(atMs)) return null;
  const ago = Math.max(0, nowMs - atMs);
  if (ago >= REPORT_STALE_MS) return { text: `Carrier report ${Math.round(ago / DAY_MS)} days old`, stale: true };
  if (ago < MINUTE_MS) return { text: 'Carrier report just now', stale: false };
  if (ago < HOUR_MS) return { text: `Carrier report ${Math.floor(ago / MINUTE_MS)}m ago`, stale: false };
  return { text: `Carrier report ${Math.floor(ago / HOUR_MS)}h ago`, stale: false };
}
