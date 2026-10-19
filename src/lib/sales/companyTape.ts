// The All Company chat tape: "42 sales this month · Top: Braeden 9 · Last:
// Cole · 12m ago". The route reads every sale and the carrier report and hands
// them to summarizeCompanySales; the client formats names and times with
// tapeRepName / relativeSaleTime. Counts and names only: no customer data and
// no per-rep money. The company-wide dollar total is for owners only (the
// route strips it for everyone else).
//
// The count and the top rep are the leaderboard's (lib/leaderboard/board): a
// carrier cancellation, a disconnect within 120 days or an order number logged
// twice drops out here exactly as it drops off the Board.

// The counting itself is server-side, in ./companyTapeStats (it runs the
// leaderboard's carrier join); this file stays light for the chat client.

export interface CompanyTapeStats {
  mtdCount: number;
  /** Σ monthly value of this month's counted sales. OWNERS ONLY: the route drops it for anyone else. */
  mtdMonthlyValue?: number;
  // Most recent counted sale of all time, by sale date, then by when it was
  // logged. `at` is when it was logged, and only when that was on the sale's
  // own day: a noon sale date would make "12m ago" up, and a sale logged days
  // after it happened did not happen when it was logged.
  lastSale: { repName: string; at?: string } | null;
  // The leaderboard's #1 this month (topRepOf) and their counted sales.
  topRep: { repName: string; count: number } | null;
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
