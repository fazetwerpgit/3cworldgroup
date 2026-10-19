// The All Company tape's numbers (server side). See ./companyTape for the
// shape and the client helpers. The count and the top rep are the
// leaderboard's (lib/leaderboard/board countedSalesIn / topRepOf).

import type { FiberOrder, Sale } from '@/types';
import { boardSales, countedSalesIn, rankedBoard, topRepOf, type BoardWindow } from '@/lib/leaderboard/board';
import { installDayKey } from './saleDate';
import type { CompanyTapeStats } from './companyTape';
import type { DemoRedactor } from '@/lib/demo/redact';

interface TapeSale {
  repName: string;
  /** salesRepId, else `name:<repName>`: who the sale is, for a demo caller's aliases. */
  repKey: string;
  // When the sale happened (saleDate, falling back to approvedAt/createdAt).
  // saleDate is a calendar day stored at noon, so it has no time of day.
  effectiveMs: number;
  // When the rep logged it (createdAt), the only real time of day on a sale.
  loggedMs: number | null;
}

function timeOf(value: unknown): number | null {
  if (!value) return null;
  const maybe = value as { toDate?: () => Date };
  const date =
    value instanceof Date ? value : typeof maybe.toDate === 'function' ? maybe.toDate() : new Date(value as string | number);
  const time = date instanceof Date ? date.getTime() : Number.NaN;
  return Number.isFinite(time) ? time : null;
}

const repNameOf = (sale: Sale) => (typeof sale.salesRepName === 'string' && sale.salesRepName ? sale.salesRepName : 'Unknown');
const repKeyOf = (sale: Sale) =>
  typeof sale.salesRepId === 'string' && sale.salesRepId ? sale.salesRepId : `name:${repNameOf(sale)}`;

/**
 * The tape as the server keeps it (the leaderboard snapshot stores it): every
 * field, plus who the top rep and the last sale are (`repKey`), so a demo
 * caller's response can alias them. Never sent as is: tapeForViewer shapes it.
 */
export interface KeyedCompanyTape {
  mtdCount: number;
  mtdMonthlyValue: number;
  lastSale: { repName: string; repKey: string; at?: string } | null;
  topRep: { repName: string; repKey: string; count: number } | null;
}

/**
 * The tape for `month` from every sale (any status) and the company carrier
 * join (companyFiberBySale), counted by the leaderboard's rule.
 */
export function summarizeCompanySales(
  sales: Sale[],
  fiberBySale: Map<string, FiberOrder>,
  month: BoardWindow
): Required<CompanyTapeStats> {
  const keyed = summarizeCompanySalesKeyed(sales, fiberBySale, month);
  return {
    mtdCount: keyed.mtdCount,
    mtdMonthlyValue: keyed.mtdMonthlyValue,
    lastSale: keyed.lastSale ? withoutKey(keyed.lastSale) : null,
    topRep: keyed.topRep ? withoutKey(keyed.topRep) : null,
  };
}

function withoutKey<T extends { repKey: string }>(value: T): Omit<T, 'repKey'> {
  const { repKey: _repKey, ...rest } = value;
  return rest;
}

/** summarizeCompanySales, keeping who the top rep and the last sale are. */
export function summarizeCompanySalesKeyed(
  sales: Sale[],
  fiberBySale: Map<string, FiberOrder>,
  month: BoardWindow
): KeyedCompanyTape {
  const inMonth = countedSalesIn(sales, fiberBySale, month);
  const mtdMonthlyValue = inMonth.reduce(
    (sum, sale) => sum + (typeof sale.totalValue === 'number' && Number.isFinite(sale.totalValue) ? sale.totalValue : 0),
    0
  );

  let last: TapeSale | null = null;
  for (const sale of boardSales(sales, fiberBySale, 'approved')) {
    const record = sale as Sale & { approvedAt?: unknown };
    const effectiveMs = timeOf(record.saleDate) ?? timeOf(record.approvedAt) ?? timeOf(record.createdAt);
    if (effectiveMs === null) continue;
    const loggedMs = timeOf(record.createdAt);
    if (
      !last ||
      effectiveMs > last.effectiveMs ||
      (effectiveMs === last.effectiveMs && (loggedMs ?? -Infinity) > (last.loggedMs ?? -Infinity))
    ) {
      last = { repName: repNameOf(sale), repKey: repKeyOf(sale), effectiveMs, loggedMs };
    }
  }

  const top = topRepOf(rankedBoard(sales, fiberBySale, month));
  return {
    mtdCount: inMonth.length,
    mtdMonthlyValue,
    lastSale: last ? lastSaleOf(last) : null,
    topRep: top ? { repName: top.salesRepName, repKey: top.salesRepId, count: top.totalSales } : null,
  };
}

function lastSaleOf(sale: TapeSale): { repName: string; repKey: string; at?: string } {
  const who = { repName: sale.repName, repKey: sale.repKey };
  const logged = sale.loggedMs;
  if (logged === null) return who;
  const sameDay = installDayKey(new Date(logged)) === installDayKey(new Date(sale.effectiveMs));
  return sameDay ? { ...who, at: new Date(logged).toISOString() } : who;
}

/**
 * The tape one caller receives: the company dollar total only for an owner
 * (company financials), and for a demo account every name but its own as
 * "Rep N" (top rep first, then the last sale), via its per-response redactor.
 */
export function tapeForViewer(
  tape: KeyedCompanyTape,
  viewer: { isOwner: boolean; redact?: DemoRedactor }
): CompanyTapeStats {
  const shown = (who: { repName: string; repKey: string }) =>
    viewer.redact?.active ? viewer.redact.name(who.repKey, who.repName) : who.repName;
  const topRep = tape.topRep ? { repName: shown(tape.topRep), count: tape.topRep.count } : null;
  const lastSale = tape.lastSale
    ? tape.lastSale.at !== undefined
      ? { repName: shown(tape.lastSale), at: tape.lastSale.at }
      : { repName: shown(tape.lastSale) }
    : null;
  const stats: CompanyTapeStats = { mtdCount: tape.mtdCount, lastSale, topRep };
  return viewer.isOwner ? { ...stats, mtdMonthlyValue: tape.mtdMonthlyValue } : stats;
}

