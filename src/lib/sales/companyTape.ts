// The All Company chat tape: "42 sales this month · Top: Braeden 9 · Last:
// Cole · 12m ago". The route reduces approved sales with summarizeCompanySales;
// the client formats names and times with tapeRepName / relativeSaleTime.
// Counts and names only: no customer data and no per-rep money.

import { installDayKey } from './saleDate';

export interface TapeSale {
  // Groups a rep's sales; salesRepId when present, else the name.
  repKey: string;
  repName: string;
  // When the sale happened (saleDate, falling back to approvedAt/createdAt).
  // saleDate is a calendar day stored at noon, so it has no time of day.
  effectiveMs: number;
  // When the rep logged it (createdAt), the only real time of day on a sale.
  loggedMs?: number | null;
  monthlyValue: number;
}

export interface CompanyTapeStats {
  mtdCount: number;
  mtdMonthlyValue: number;
  // Most recent approved sale of all time, by sale date, then by when it was
  // logged. `at` is when it was logged, and only when that was on the sale's
  // own day: a noon sale date would make "12m ago" up, and a sale logged days
  // after it happened did not happen when it was logged.
  lastSale: { repName: string; at?: string } | null;
  // Most sales this month; ties go to the rep who got there first.
  topRep: { repName: string; count: number } | null;
}

export function summarizeCompanySales(sales: TapeSale[], monthStartMs: number): CompanyTapeStats {
  let mtdCount = 0;
  let mtdMonthlyValue = 0;
  let last: TapeSale | null = null;
  const reps = new Map<string, { repName: string; count: number; latestMs: number }>();

  for (const sale of sales) {
    if (
      !last ||
      sale.effectiveMs > last.effectiveMs ||
      (sale.effectiveMs === last.effectiveMs && (sale.loggedMs ?? -Infinity) > (last.loggedMs ?? -Infinity))
    ) {
      last = sale;
    }
    if (sale.effectiveMs < monthStartMs) continue;
    mtdCount += 1;
    mtdMonthlyValue += sale.monthlyValue;
    const rep = reps.get(sale.repKey);
    if (!rep) {
      reps.set(sale.repKey, { repName: sale.repName, count: 1, latestMs: sale.effectiveMs });
    } else {
      rep.count += 1;
      if (sale.effectiveMs >= rep.latestMs) {
        rep.latestMs = sale.effectiveMs;
        rep.repName = sale.repName;
      }
    }
  }

  // A rep's count was reached at their latest sale this month, so among tied
  // reps the earliest latest-sale got there first. The key breaks exact ties.
  let top: { key: string; repName: string; count: number; latestMs: number } | null = null;
  for (const [key, rep] of reps) {
    if (
      !top ||
      rep.count > top.count ||
      (rep.count === top.count &&
        (rep.latestMs < top.latestMs || (rep.latestMs === top.latestMs && key < top.key)))
    ) {
      top = { key, ...rep };
    }
  }

  return {
    mtdCount,
    mtdMonthlyValue,
    lastSale: last ? lastSaleOf(last) : null,
    topRep: top ? { repName: top.repName, count: top.count } : null,
  };
}

function lastSaleOf(sale: TapeSale): { repName: string; at?: string } {
  const logged = sale.loggedMs;
  if (typeof logged !== 'number' || !Number.isFinite(logged)) return { repName: sale.repName };
  const sameDay = installDayKey(new Date(logged)) === installDayKey(new Date(sale.effectiveMs));
  return sameDay
    ? { repName: sale.repName, at: new Date(logged).toISOString() }
    : { repName: sale.repName };
}

const LONG_NAME = 12;

/** Full name when it's short, else first name + last initial ("Braeden C."). */
export function tapeRepName(name: string): string {
  const trimmed = name.trim().replace(/\s+/g, ' ');
  if (trimmed.length <= LONG_NAME) return trimmed;
  const parts = trimmed.split(' ');
  if (parts.length < 2) return trimmed;
  return `${parts[0]} ${parts[parts.length - 1].charAt(0).toUpperCase()}.`;
}

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

/** "just now", "12m ago", "3h ago", then the weekday ("Tue"), then "Sep 3". */
export function relativeSaleTime(atMs: number, nowMs: number, timeZone?: string): string {
  const ago = Math.max(0, nowMs - atMs);
  if (ago < MINUTE_MS) return 'just now';
  if (ago < HOUR_MS) return `${Math.floor(ago / MINUTE_MS)}m ago`;
  if (ago < DAY_MS) return `${Math.floor(ago / HOUR_MS)}h ago`;
  const at = new Date(atMs);
  if (ago < 6 * DAY_MS) return at.toLocaleDateString('en-US', { weekday: 'short', timeZone });
  return at.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone });
}
