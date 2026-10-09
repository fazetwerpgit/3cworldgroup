import type { Sale } from '@/types';
import { US_STATES } from '@/lib/validation/address';

// Sales by market for the owner home: a market is the US state of the sale's
// customer address. There is no market field anywhere (users.state is the
// rep's HOME state, not where they sell), so the state is parsed from the free-
// text customerAddress. Aggregates only: the output is state names and counts.

const NAME_BY_CODE = new Map(US_STATES.map((s) => [s.code, s.name]));
const CODE_BY_NAME = new Map(US_STATES.map((s) => [s.name.toLowerCase(), s.code]));
// Longest first, so "West Virginia" wins over "Virginia".
const NAMES = [...CODE_BY_NAME.keys()].sort((a, b) => b.length - a.length);
const NAME_PATTERN = NAMES.map((name) => name.replace(/ /g, '\\s+')).join('|');

// Two-letter codes that are also street suffixes, directions or plain words
// ("Maple Ct", "Dexter Ave NE", "come in"). A bare trailing one only counts
// after a comma or before a ZIP; otherwise the ZIP prefix decides.
const AMBIGUOUS_CODES = new Set(['AL', 'CO', 'CT', 'DE', 'HI', 'IN', 'LA', 'ME', 'NE', 'OK', 'OR', 'PA', 'WY']);

// First three ZIP digits -> state (USPS prefix ranges, inclusive).
const ZIP_PREFIXES: Array<[number, number, string]> = [
  [5, 5, 'NY'], [10, 27, 'MA'], [28, 29, 'RI'], [30, 38, 'NH'], [39, 49, 'ME'], [50, 54, 'VT'],
  [55, 55, 'MA'], [56, 59, 'VT'], [60, 69, 'CT'], [70, 89, 'NJ'], [100, 149, 'NY'], [150, 196, 'PA'],
  [197, 199, 'DE'], [200, 205, 'DC'], [206, 219, 'MD'], [220, 246, 'VA'], [247, 268, 'WV'],
  [270, 289, 'NC'], [290, 299, 'SC'], [300, 319, 'GA'], [320, 349, 'FL'], [350, 369, 'AL'],
  [370, 385, 'TN'], [386, 397, 'MS'], [398, 399, 'GA'], [400, 427, 'KY'], [430, 459, 'OH'],
  [460, 479, 'IN'], [480, 499, 'MI'], [500, 528, 'IA'], [530, 549, 'WI'], [550, 567, 'MN'],
  [569, 569, 'DC'], [570, 577, 'SD'], [580, 588, 'ND'], [590, 599, 'MT'], [600, 629, 'IL'],
  [630, 658, 'MO'], [660, 679, 'KS'], [680, 693, 'NE'], [700, 714, 'LA'], [716, 729, 'AR'],
  [730, 749, 'OK'], [750, 799, 'TX'], [800, 816, 'CO'], [820, 831, 'WY'], [832, 838, 'ID'],
  [840, 847, 'UT'], [850, 865, 'AZ'], [870, 884, 'NM'], [885, 885, 'TX'], [889, 898, 'NV'],
  [900, 961, 'CA'], [967, 968, 'HI'], [970, 979, 'OR'], [980, 994, 'WA'], [995, 999, 'AK'],
];

/** State code for a 5-digit ZIP by its 3-digit prefix, or null. */
export function zipState(zip: string): string | null {
  if (!/^\d{5}$/.test(zip)) return null;
  const prefix = Number(zip.slice(0, 3));
  const hit = ZIP_PREFIXES.find(([from, to]) => prefix >= from && prefix <= to);
  return hit ? hit[2] : null;
}

/** A state code from a code or a full name token, or null. */
function stateCode(token: string): string | null {
  const clean = token.trim().replace(/\s+/g, ' ');
  if (clean.length === 2) {
    const code = clean.toUpperCase();
    return NAME_BY_CODE.has(code) ? code : null;
  }
  return CODE_BY_NAME.get(clean.toLowerCase()) ?? null;
}

// "<state> 48823" or "<state>, 48823-1234", the last one in the address.
const BEFORE_ZIP = new RegExp(`(?:^|[\\s,.])(${NAME_PATTERN}|[A-Za-z]{2})[\\s,.]*(\\d{5})(?:-\\d{4})?\\b`, 'gi');
// A state at the very end: ", MI" / " Michigan" (the separator is kept to judge a bare code).
const AT_END = new RegExp(`(^|,\\s*|\\s+)(${NAME_PATTERN}|[A-Za-z]{2})$`, 'i');
const COUNTRY_TAIL = /[\s,]*(?:usa|u\.s\.a\.?|us|united states(?: of america)?)\.?$/i;

/**
 * The US state code of a free-text customer address, or null when it cannot be
 * told. In order: the state written just before the ZIP, a state written at the
 * end, then the ZIP's prefix. A leading 5-digit street number is not a ZIP.
 */
export function addressState(address: unknown): string | null {
  if (typeof address !== 'string') return null;
  let text = address.trim().replace(/[\s.]+$/, '');
  if (!text) return null;
  text = text.replace(COUNTRY_TAIL, '').trim().replace(/[\s,.]+$/, '');

  let beforeZip: string | null = null;
  for (const match of text.matchAll(BEFORE_ZIP)) {
    const code = stateCode(match[1]);
    if (!code) continue;
    // A full name before the ZIP can be a town named for a state ("Washington
    // 48094" is in Michigan): when the ZIP says otherwise, the ZIP wins.
    const byZip = match[1].length > 2 ? zipState(match[2]) : null;
    beforeZip = byZip ?? code;
  }
  if (beforeZip) return beforeZip;

  const end = text.match(AT_END);
  if (end) {
    const code = stateCode(end[2]);
    const bare = end[2].length === 2;
    const afterComma = end[1].includes(',');
    if (code && (!bare || afterComma || !AMBIGUOUS_CODES.has(code))) return code;
  }

  const zips = [...text.matchAll(/\b(\d{5})(?:-\d{4})?\b/g)];
  for (let i = zips.length - 1; i >= 0; i -= 1) {
    const match = zips[i];
    const leadingStreetNumber = match.index === 0 && text.length > match[0].length;
    if (leadingStreetNumber) continue;
    const code = zipState(match[1]);
    if (code) return code;
  }
  return null;
}

export const OTHER_MARKET = 'Other';

export interface MarketCount {
  /** Full state name ("Michigan"), or "Other". */
  market: string;
  count: number;
}

export interface MarketsSummary {
  /** Biggest market first; "Other" only when something could not be placed. */
  markets: MarketCount[];
  total: number;
  /** Sales whose address gave no state, placed by where that rep's other sales are. */
  placedByRep: number;
}

interface Window {
  start: Date;
  end: Date;
}

function saleTime(sale: Sale): number | null {
  const value = sale.saleDate as unknown;
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value as string);
  const time = date.getTime();
  return Number.isNaN(time) ? null : time;
}

/** Counted the way the leaderboard counts a sale: approved, dated inside the window. */
export function countsForMonth(sale: Sale, window: Window): boolean {
  if (sale.status !== 'approved') return false;
  const time = saleTime(sale);
  return time !== null && time >= window.start.getTime() && time < window.end.getTime();
}

/**
 * Each rep's usual state: the state most of their parseable sales this month
 * are in, else most of their parseable sales in the whole book. A tie goes to
 * the state of their latest sale. Cancelled and rejected sales still say where
 * a rep works, so every status is used.
 */
export function repHomeMarkets(sales: Sale[], window: Window): Map<string, string> {
  type Tally = Map<string, { count: number; latest: number }>;
  const month = new Map<string, Tally>();
  const all = new Map<string, Tally>();
  const add = (tallies: Map<string, Tally>, repId: string, code: string, time: number) => {
    const tally = tallies.get(repId) ?? new Map();
    const entry = tally.get(code) ?? { count: 0, latest: -Infinity };
    entry.count += 1;
    entry.latest = Math.max(entry.latest, time);
    tally.set(code, entry);
    tallies.set(repId, tally);
  };
  for (const sale of sales) {
    if (!sale.salesRepId) continue;
    const code = addressState(sale.customerAddress);
    if (!code) continue;
    const time = saleTime(sale) ?? -Infinity;
    add(all, sale.salesRepId, code, time);
    if (time >= window.start.getTime() && time < window.end.getTime()) add(month, sale.salesRepId, code, time);
  }
  const top = (tally: Tally) =>
    [...tally].sort((a, b) => b[1].count - a[1].count || b[1].latest - a[1].latest)[0]?.[0];
  const result = new Map<string, string>();
  for (const [repId, tally] of all) {
    const code = top(month.get(repId) ?? new Map()) ?? top(tally);
    if (code) result.set(repId, code);
  }
  return result;
}

/** This month's counted sales by market (state of the customer address). */
export function summarizeMarkets(sales: Sale[], window: Window): MarketsSummary {
  const home = repHomeMarkets(sales, window);
  const counts = new Map<string, number>();
  let total = 0;
  let placedByRep = 0;
  for (const sale of sales) {
    if (!countsForMonth(sale, window)) continue;
    total += 1;
    let code = addressState(sale.customerAddress);
    if (!code && sale.salesRepId && home.has(sale.salesRepId)) {
      code = home.get(sale.salesRepId)!;
      placedByRep += 1;
    }
    const market = code ? NAME_BY_CODE.get(code)! : OTHER_MARKET;
    counts.set(market, (counts.get(market) ?? 0) + 1);
  }
  const markets = [...counts]
    .map(([market, count]) => ({ market, count }))
    .sort((a, b) => {
      if ((a.market === OTHER_MARKET) !== (b.market === OTHER_MARKET)) return a.market === OTHER_MARKET ? 1 : -1;
      return b.count - a.count || a.market.localeCompare(b.market);
    });
  return { markets, total, placedByRep };
}
