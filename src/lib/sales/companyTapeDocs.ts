// The company tape's reduction of raw sale docs, shared by the leaderboard
// snapshot (which stores the tape beside the board) and the company-stats
// route's live path. Moved here verbatim from the route.

import { periodBounds } from '@/lib/leaderboard/periods';
import { summarizeCompanySales, type CompanyTapeStats, type TapeSale } from '@/lib/sales/companyTape';
import { saleVisibleTo } from '@/lib/users/demoAccount';

// Firestore hands back a Timestamp; a locally-written doc (or a test) can hold a
// plain Date or an ISO string. Anything else reads as "no date".
function toDate(value: unknown): Date | null {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value === 'object' && typeof (value as { toDate?: unknown }).toDate === 'function') {
    const date = (value as { toDate: () => Date }).toDate();
    return date instanceof Date && !Number.isNaN(date.getTime()) ? date : null;
  }
  if (typeof value === 'string' || typeof value === 'number') {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  return null;
}

/**
 * The tape over approved sales (any other status is skipped), as `viewerUid`
 * may see them: a demo account's sales never reach anyone else's tape.
 * "This month" is the Chicago calendar month of `now`, like the leaderboard.
 */
export function companyTapeFromDocs(
  docs: ReadonlyArray<{ data: Record<string, unknown> }>,
  viewerUid: string | null,
  now: Date = new Date()
): CompanyTapeStats {
  const monthStartMs = periodBounds('month', now)!.start.getTime();
  const sales: TapeSale[] = [];
  for (const { data } of docs) {
    if (data.status !== 'approved') continue;
    if (!saleVisibleTo(data, viewerUid)) continue;
    // Bucket on the day the sale HAPPENED, not the day it was uploaded or
    // approved: a rep back-entering last month's work must not inflate this
    // month's tape (or read as today's latest sale). approvedAt/createdAt
    // only cover docs with no saleDate.
    const effectiveDate = toDate(data.saleDate) ?? toDate(data.approvedAt) ?? toDate(data.createdAt);
    if (!effectiveDate) continue;
    const repName = typeof data.salesRepName === 'string' && data.salesRepName ? data.salesRepName : 'Unknown';
    sales.push({
      repKey: typeof data.salesRepId === 'string' && data.salesRepId ? data.salesRepId : `name:${repName}`,
      repName,
      effectiveMs: effectiveDate.getTime(),
      loggedMs: toDate(data.createdAt)?.getTime() ?? null,
      monthlyValue: typeof data.totalValue === 'number' && Number.isFinite(data.totalValue) ? data.totalValue : 0,
    });
  }
  return summarizeCompanySales(sales, monthStartMs);
}
