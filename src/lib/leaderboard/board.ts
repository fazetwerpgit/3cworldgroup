// What the leaderboard counts, pure so the route and the tests agree.
//
// The board used to sum every approved sale and never read the carrier report,
// so a sale the carrier cancelled kept its points (Braeden C.'s Stephen N. in
// October, Wil T.'s Darrel N. in September) while the rep's own estimate had
// already dropped it. Now the board reads the SAME carrier join as the owner
// book and the admin Sales board (buildMergedBook over every sale and every
// order) and counts what the estimate counts (countedSales), less a customer
// who disconnected within 120 days of install (boardCountedSales).
//
// Counts and points only. No customer and no money ever leave here.

import type { FiberOrder, Sale } from '@/types';
import { boardCountedSales } from '@/lib/pay/chargeback';
import { buildMergedBook, fiberBySaleFromBook } from '@/lib/sales/mergeBook';
import { planMix, type PlanMixEntry } from '@/lib/sales/planMix';
import type { SaleRecord } from '@/lib/leaderboard/history';

export type BoardScope = 'approved' | 'submitted';

/** The statuses a scope ranks: 'submitted' also counts pending (the weekly challenge). */
export function inScope(sale: Pick<Sale, 'status'>, scope: BoardScope): boolean {
  return sale.status === 'approved' || (scope === 'submitted' && sale.status === 'pending');
}

/**
 * The carrier join for the whole company, as the owner book builds it. Pass
 * EVERY sale (any status) so the join resolves exactly as it does there: which
 * order a sale lands on can depend on the other sales at the same door.
 */
export function companyFiberBySale(
  sales: Sale[],
  orders: FiberOrder[],
  opts?: { now?: Date; reportAsOf?: string | null }
): Map<string, FiberOrder> {
  if (!orders.length) return new Map();
  return fiberBySaleFromBook(buildMergedBook(sales, orders, opts));
}

/** The sales the board ranks for `scope`: in scope, and counted like the estimate. */
export function boardSales<T extends Sale>(sales: T[], fiberBySale: Map<string, FiberOrder>, scope: BoardScope): T[] {
  return boardCountedSales(
    sales.filter((sale) => inScope(sale, scope)),
    fiberBySale
  );
}

export interface BoardTotals {
  salesRepId: string;
  salesRepName: string;
  totalSales: number;
  totalPoints: number;
  /** Counts per internet tier over the same sales (lib/sales/planMix). */
  planMix: PlanMixEntry[];
}

function saleTime(sale: Pick<Sale, 'saleDate'>): number {
  const date = sale.saleDate instanceof Date ? sale.saleDate : new Date(sale.saleDate as unknown as string);
  return date.getTime();
}

/**
 * One row per rep over the counted sales sold at or after `startTime` (and
 * before `endTime`, when a closed window is asked for), plus the records rank
 * history reads. Unsorted: the route orders it (boardOrder).
 */
export function tallyBoard(
  counted: Sale[],
  startTime: number,
  endTime: number = Infinity
): { totals: BoardTotals[]; allSales: SaleRecord[]; periodSales: SaleRecord[] } {
  const byRep = new Map<string, { totals: BoardTotals; sales: Sale[] }>();
  const allSales: SaleRecord[] = [];
  const periodSales: SaleRecord[] = [];

  for (const sale of counted) {
    const time = saleTime(sale);
    const record: SaleRecord = { salesRepId: sale.salesRepId, saleDate: new Date(time), totalPoints: sale.totalPoints || 0 };
    allSales.push(record);
    if (!(time >= startTime) || !(time < endTime)) continue;
    periodSales.push(record);

    let rep = byRep.get(sale.salesRepId);
    if (!rep) {
      rep = {
        totals: { salesRepId: sale.salesRepId, salesRepName: sale.salesRepName || 'Unknown', totalSales: 0, totalPoints: 0, planMix: [] },
        sales: [],
      };
      byRep.set(sale.salesRepId, rep);
    }
    rep.totals.totalSales += 1;
    rep.totals.totalPoints += sale.totalPoints || 0;
    rep.sales.push(sale);
  }

  const totals = [...byRep.values()].map(({ totals, sales }) => ({ ...totals, planMix: planMix(sales) }));
  return { totals, allSales, periodSales };
}
